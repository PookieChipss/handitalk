// client/src/admin/pages/ContentManager.jsx
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  getDocs,
} from "firebase/firestore";
import "@/admin/styles/content.css";

// Cloudinary
const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD;
const PRESET = import.meta.env.VITE_CLOUDINARY_PRESET;

async function uploadToCloudinary(kind, file) {
  const endpoint =
    kind === "video"
      ? `https://api.cloudinary.com/v1_1/${CLOUD}/video/upload`
      : `https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`;
  const fd = new FormData();
  fd.append("upload_preset", PRESET);
  fd.append("file", file);
  const r = await fetch(endpoint, { method: "POST", body: fd });
  if (!r.ok) throw new Error("cloudinary_upload_failed");
  return r.json(); // { secure_url, ... }
}

export default function ContentManager() {
  // form (create / edit)
  const [kind, setKind] = useState("word"); // "word" | "phrase"
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");
  const [order, setOrder] = useState(1);
  const [tags, setTags] = useState("");

  const [image, setImage] = useState(null);      // new image file (optional)
  const [video, setVideo] = useState(null);      // new video file (optional)
  const [imgPreview, setImgPreview] = useState("");

  // when editing, we keep currently stored URLs if user doesn't re-upload
  const [prevImageUrl, setPrevImageUrl] = useState("");
  const [prevVideoUrl, setPrevVideoUrl] = useState("");

  const [editId, setEditId] = useState(""); // empty = create, else doc id for update

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // modules for dropdown
  const [modules, setModules] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const qy = query(collection(db, "modules"), orderBy("title", "asc"));
        const snap = await getDocs(qy);
        setModules(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("load modules failed", e);
      }
    })();
  }, []);

  // listing
  const [list, setList] = useState([]);
  const [catFilter, setCatFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [qtext, setQtext] = useState("");

  const filtered = useMemo(() => {
    let out = [...list];
    if (catFilter) out = out.filter((x) => (x.category || "") === catFilter);
    if (kindFilter) out = out.filter((x) => ((x.kind || "word") === kindFilter));
    if (qtext.trim()) {
      const s = qtext.trim().toLowerCase();
      out = out.filter(
        (x) =>
          (x.label || "").toLowerCase().includes(s) ||
          (x.tags || []).some((t) => (t || "").toLowerCase().includes(s))
      );
    }
    out.sort((a, b) => {
      if ((a.category || "") !== (b.category || "")) {
        return (a.category || "").localeCompare(b.category || "");
      }
      const ao = Number(a.order || 0);
      const bo = Number(b.order || 0);
      if (ao !== bo) return ao - bo;
      return (a.label || "").localeCompare(b.label || "");
    });
    return out;
  }, [list, catFilter, kindFilter, qtext]);

  async function reload() {
    const snap = await getDocs(collection(db, "content"));
    setList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }
  useEffect(() => {
    reload();
  }, []);

  function resetForm() {
    setKind("word");
    setLabel("");
    setCategory("");
    setOrder(1);
    setTags("");

    setImage(null);
    setVideo(null);
    setImgPreview("");
    setPrevImageUrl("");
    setPrevVideoUrl("");

    setEditId("");
    setErr("");
  }

  function onPickImage(f) {
    setImage(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setImgPreview(url);
    } else {
      setImgPreview(prevImageUrl || "");
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");

    if (!CLOUD || !PRESET) {
      setErr("Cloudinary env missing (VITE_CLOUDINARY_CLOUD & VITE_CLOUDINARY_PRESET).");
      return;
    }
    if (!label.trim() || !category) {
      setErr("Please fill Label and Category.");
      return;
    }
    // For create: at least one media required (as per your rule). For edit: allow no change.
    if (!editId && !image && !video) {
      setErr("Upload at least an image or a video.");
      return;
    }

    setBusy(true);
    try {
      // decide which URLs to use (uploads only if new file picked)
      let imageUrl = prevImageUrl || "";
      let videoUrl = prevVideoUrl || "";

      if (image) imageUrl = (await uploadToCloudinary("image", image)).secure_url;
      if (video) videoUrl = (await uploadToCloudinary("video", video)).secure_url;

      const payload = {
        kind,                                      // ensure type is saved
        label: label.trim(),
        category,
        order: Number(order || 0),
        tags: (tags || "").split(",").map((t) => t.trim()).filter(Boolean),
        imageUrl,
        videoUrl,
        updatedAt: serverTimestamp(),
      };

      if (editId) {
        await updateDoc(doc(db, "content", editId), payload);
      } else {
        await addDoc(collection(db, "content"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      await reload();
      resetForm();
    } catch (e) {
      console.error(e);
      setErr("Save failed. See console.");
    } finally {
      setBusy(false);
    }
  }

  function onEdit(item) {
    // populate form with the chosen row
    setEditId(item.id);
    setKind(item.kind || "word");
    setLabel(item.label || "");
    setCategory(item.category || "");
    setOrder(item.order ?? 0);
    setTags((item.tags || []).join(", "));

    setPrevImageUrl(item.imageUrl || "");
    setPrevVideoUrl(item.videoUrl || "");
    setImgPreview(item.imageUrl || "");
    setImage(null);
    setVideo(null);
    setErr("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onDelete(id) {
    if (!confirm("Delete this item permanently?")) return;
    await deleteDoc(doc(db, "content", id));
    await reload();
    // if deleting the one we were editing, reset form
    if (editId === id) resetForm();
  }

  return (
    <div className="cmx">
      {/* FORM CARD */}
      <section className="card">
        <header className="card-head">
          <div>
            <h2>{editId ? "Edit content" : "Content"}</h2>
            <p>{editId ? "Update this item and press Update." : "Upload words/phrases and attach them to a module."}</p>
          </div>
        </header>

        <form className="form-grid" onSubmit={onSubmit}>
          {/* Type */}
          <div className="group">
            <label>Type</label>

            <div className="seg" role="tablist" aria-label="Choose content type">
              <button
                type="button"
                role="tab"
                aria-selected={kind === "word"}
                aria-pressed={kind === "word"}
                className={`seg-btn ${kind === "word" ? "is-active" : ""}`}
                onClick={() => setKind("word")}
              >
                <span className="seg-ic" aria-hidden>🅦</span>
                Word
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={kind === "phrase"}
                aria-pressed={kind === "phrase"}
                className={`seg-btn ${kind === "phrase" ? "is-active" : ""}`}
                onClick={() => setKind("phrase")}
              >
                <span className="seg-ic" aria-hidden>🗨️</span>
                Phrase
              </button>
            </div>
          </div>

          <div className="group">
            <label>Label</label>
            <input
              className="inp"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Hello / Apple / Good morning"
            />
          </div>

          <div className="group">
            <label>Category</label>
            <select
              className="inp"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Choose…</option>
              {modules.map((m) => (
                <option key={m.id} value={m.slug}>
                  {m.title} ({m.slug})
                </option>
              ))}
            </select>
          </div>

          <div className="group">
            <label>Order</label>
            <input
              className="inp"
              type="number"
              min={0}
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            />
          </div>

          <div className="group wide">
            <label>Tags</label>
            <input
              className="inp"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="comma, separated, tags"
            />
            <div className="hint">
              Press {editId ? "update" : "save"} to apply. Example: <code>fruit, beginner</code>
            </div>
          </div>

          <div className="group media">
            <label>Image (optional)</label>
            <div className="file-row">
              <input
                className="inp"
                type="file"
                accept="image/*"
                onChange={(e) => onPickImage(e.target.files?.[0] || null)}
              />
              {imgPreview ? (
                <img className="thumb" src={imgPreview} alt="preview" />
              ) : (
                <div className="thumb ph">No image</div>
              )}
            </div>
          </div>

          <div className="group media">
            <label>Video (optional)</label>
            <div className="file-row">
              <input
                className="inp"
                type="file"
                accept="video/*"
                onChange={(e) => setVideo(e.target.files?.[0] || null)}
              />
              <div className="file-name">
                {video ? video.name : prevVideoUrl ? "Current video kept" : "No video"}
              </div>
            </div>
          </div>

          {err && <div className="alert">{err}</div>}

          <div className="actions" style={{ display: "flex", gap: 12 }}>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? (editId ? "Updating…" : "Saving…") : (editId ? "Update item" : "Save item")}
            </button>
            {editId && (
              <button
                type="button"
                className="btn"
                onClick={resetForm}
                disabled={busy}
                title="Cancel editing"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      {/* LIST CARD */}
      <section className="card">
        <header className="card-head">
          <h3>Browse</h3>
          <div className="filters">
            <select
              className="inp"
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
            >
              <option value="">All categories</option>
              {modules.map((m) => (
                <option key={m.id} value={m.slug}>
                  {m.title} ({m.slug})
                </option>
              ))}
            </select>
            <select
              className="inp"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
            >
              <option value="">All types</option>
              <option value="word">word</option>
              <option value="phrase">phrase</option>
            </select>
            <input
              className="inp"
              placeholder="Search label/tags…"
              value={qtext}
              onChange={(e) => setQtext(e.target.value)}
            />
          </div>
        </header>

        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: "26%" }}>Label</th>
                <th>Category</th>
                <th>Type</th>
                <th>Order</th>
                <th>Image</th>
                <th>Video</th>
                <th style={{ width: "24%" }}>Tags</th>
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                // ensure Type column is never empty (fallback to 'word')
                const dtype = c.kind || "word";
                return (
                  <tr key={c.id}>
                    <td className="mono">{c.label}</td>
                    <td className="mono">{c.category}</td>
                    <td>
                      <span className={`badge ${dtype === "phrase" ? "b-cream" : "b-blue"}`}>
                        {dtype}
                      </span>
                    </td>
                    <td className="mono">{c.order ?? 0}</td>
                    <td>
                      {c.imageUrl ? (
                        <a href={c.imageUrl} target="_blank" rel="noreferrer">
                          view
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {c.videoUrl ? (
                        <a href={c.videoUrl} target="_blank" rel="noreferrer">
                          view
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="muted small">{(c.tags || []).join(", ")}</td>
                    <td className="table-actions" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        className="btn"
                        onClick={() => onEdit(c)}
                        title="Edit this item"
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => onDelete(c.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted center">
                    No items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
