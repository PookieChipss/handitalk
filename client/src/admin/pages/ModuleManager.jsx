// client/src/admin/pages/ModuleManager.jsx
import { useEffect, useMemo, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import "@/admin/styles/module.css";

function slugify(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// Normalize to 'published' | 'draft' with strong fallbacks
function normalizeStatus(row) {
  const raw = (row?.status || "").toString().trim().toLowerCase();
  if (raw === "published" || raw === "draft") return raw;
  if (typeof row?.published === "boolean") return row.published ? "published" : "draft";
  return "draft";
}

// Reusable inline chip (no CSS dependency)
function StatusChip({ value }) {
  const v = value === "published" ? "published" : "draft";
  const isPub = v === "published";
  const styles = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.2,
    background: isPub ? "#ecfdf5" : "#f3f4f6",
    color: isPub ? "#065f46" : "#374151",
    border: `1px solid ${isPub ? "#a7f3d0" : "#e5e7eb"}`,
    minWidth: 84,
    justifyContent: "center",
    textTransform: "capitalize",
  };
  const dot = {
    width: 8, height: 8, borderRadius: "50%",
    background: isPub ? "#10b981" : "#9ca3af",
  };
  return (
    <span style={styles}>
      <span style={dot} aria-hidden />
      {v}
    </span>
  );
}

export default function ModuleManager() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // modal/form state
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    status: "draft",
    icon: "",
    tone: "",
    coverUrl: "",
  });

  const canSubmit = useMemo(() => form.title.trim().length >= 3, [form]);

  // ------- Data load -------
  async function load() {
    setBusy(true);
    setError("");
    try {
      const qy = query(collection(db, "modules"), orderBy("updatedAt", "desc"), limit(200));
      const snap = await getDocs(qy);
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      setError("Failed to load modules.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // ------- Open forms -------
  function openCreate() {
    setOpen(true);
    setEditingId(null);
    setFile(null);
    setForm({
      title: "",
      slug: "",
      status: "draft",
      icon: "",
      tone: "",
      coverUrl: "",
    });
  }

  function openEdit(row) {
    setOpen(true);
    setEditingId(row.id);
    setFile(null);
    setForm({
      title: row.title || "",
      slug: row.slug || "",
      status: normalizeStatus(row),
      icon: row.icon || "",
      tone: row.tone || "",
      coverUrl: row.coverUrl || "",
    });
  }

  // ------- Upload cover if present -------
  async function uploadCoverIfNeeded(id) {
    if (!file) return form.coverUrl || "";
    const path = `modules/${id}/${file.name}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file);
    return await getDownloadURL(fileRef);
  }

  // ------- Create/Update -------
  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const user = auth.currentUser;
      const base = {
        title: form.title.trim(),
        slug: (form.slug || slugify(form.title)).trim(),
        status: form.status || "draft",
        icon: form.icon || "",
        tone: form.tone || "",
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || user?.uid || "system",
      };

      if (!editingId) {
        const newRef = await addDoc(collection(db, "modules"), {
          ...base,
          createdAt: serverTimestamp(),
        });
        const url = await uploadCoverIfNeeded(newRef.id);
        if (url) await updateDoc(newRef, { coverUrl: url });
      } else {
        const refDoc = doc(db, "modules", editingId);
        const url = await uploadCoverIfNeeded(editingId);
        await updateDoc(refDoc, { ...base, ...(url ? { coverUrl: url } : {}) });
      }

      setOpen(false);
      await load();
    } catch (e) {
      console.error(e);
      setError("Save failed. Check console for details.");
    } finally {
      setBusy(false);
    }
  }

  // ------- Delete -------
  async function handleDelete(id) {
    if (!confirm("Delete this module? This cannot be undone.")) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, "modules", id));
      await load();
    } catch (e) {
      console.error(e);
      setError("Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="module-container">
      <div className="admin-card">
        <div className="module-header">
          <div>
            <h2 className="admin-title">Modules</h2>
            <p className="admin-subtext">Create, edit, publish, and manage learning modules.</p>
          </div>
          <button className="btn btn-primary module-add-btn" onClick={openCreate}>
            + New Module
          </button>
        </div>

        {error && <div className="alert">{error}</div>}

        {busy && rows.length === 0 ? (
          <div className="module-empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="module-empty">No modules yet. Click “New Module”.</div>
        ) : (
          <div className="table-wrap">
            <table className="module-table">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Slug</th>
                  <th>Status</th>
                  <th>Icon</th>
                  <th>Tone</th>
                  <th>Updated</th>
                  <th className="th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const statusVal = normalizeStatus(r);
                  return (
                    <tr key={r.id}>
                      <td><div className="mod-title">{r.title || "—"}</div></td>
                      <td className="mono">{r.slug || "—"}</td>

                      {/* Status cell – always visible */}
                      <td>
                        <StatusChip value={statusVal} />
                      </td>

                      <td>{r.icon || "—"}</td>
                      <td className="mono">{r.tone || "—"}</td>
                      <td className="muted">
                        {r.updatedAt?.toDate ? r.updatedAt.toDate().toLocaleString() : "—"}
                      </td>
                      <td className="module-actions">
                        <button className="btn btn-ghost-danger" onClick={() => openEdit(r)}>Edit</button>
                        <button className="btn btn-danger" onClick={() => handleDelete(r.id)}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {open && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-backdrop" onClick={() => !busy && setOpen(false)} />
          <div className="modal-card">
            <div className="modal-head">
              <h3>{editingId ? "Edit Module" : "New Module"}</h3>
              <button className="btn btn-ghost" onClick={() => !busy && setOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmit} className="form">
              <div className="form-row">
                <label>Title</label>
                <input
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value, slug: f.slug || slugify(e.target.value) }))
                  }
                  placeholder="e.g., Alphabet A–M"
                  required
                />
              </div>

              <div className="form-row">
                <label>Slug</label>
                <input
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="alphabet-a-m"
                />
              </div>

              <div className="form-row">
                <label>Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>

              <div className="form-grid">
                <div className="form-row">
                  <label>Icon<br />(emoji)</label>
                  <input
                    value={form.icon || ""}
                    onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                    placeholder="e.g., 🔤 or 🙂"
                  />
                </div>

                <div className="form-row">
                  <label>Tone<br />(pastel class)</label>
                  <select
                    value={form.tone || ""}
                    onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value }))}
                  >
                    <option value="">(none)</option>
                    <option value="tone-red">tone-red</option>
                    <option value="tone-yellow">tone-yellow</option>
                    <option value="tone-pink">tone-pink</option>
                    <option value="tone-cream">tone-cream</option>
                    <option value="tone-salmon">tone-salmon</option>
                    <option value="tone-mint">tone-mint</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <label>Cover image (optional)</label>
                <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>

              <div className="modal-actions">
                <button className="btn btn-primary" disabled={!canSubmit || busy} type="submit">
                  {editingId ? "Save" : "Create"}
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => !busy && setOpen(false)}>
                  Cancel
                </button>
              </div>

              {busy && <div className="saving">Saving…</div>}
              {error && <div className="alert mt">{error}</div>}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
