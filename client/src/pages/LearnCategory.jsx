// client/src/pages/LearnCategory.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "@/styles/learn-category.css";
import "@/styles/kid/learn-category-kid.css";

import SignMedia, { hasVideoAsset, hasImageAsset } from "@/components/SignMedia";
import {
  subscribeProgress,
  getPieces,
  markPiece,
  itemIsDone,
  categoryPercent,
} from "@/lib/progressStore";

// Firestore
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

/* ----------------- Legacy local data (fallback) ----------------- */
const DATA = {
  alphabet: Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
  numbers: Array.from({ length: 31 }, (_, i) => String(i)), // 0..30
  phrases:  ["All done","Don't","Eat","Friends","Help","Hungry","Like","Me","More","No","Play","Please","Stop","Toilet","Want","Water","What","When","Where","Who","Why","Yes","You"],
  greetings:["Goodbye","Hello","I love you","No","Please","Sorry","Thank you","Yes"],
  emotions: ["Angry","Excited","Happy","Sad","Scared"],
  foods:    ["Cabbage","Cereal","Chicken","Corn","Fruit","Lettuce","Meat","Onion","Potato","Turkey","Vegetables"],
};
const TITLES = {
  alphabet: "Alphabet",
  numbers:  "Numbers",
  phrases:  "Daily Phrases",
  greetings:"Greetings",
  emotions: "Emotions",
  foods:    "Foods",
};
const DEFAULT_ALLOW_VIDEO = (c) => !["alphabet", "numbers"].includes(c);
/* --------------------------------------------------------------- */

export default function LearnCategory() {
  const { category } = useParams();
  const nav = useNavigate();

  // Firestore items for this category (if any)
  const [fsRows, setFsRows] = useState([]); // [{label, order, imageUrl?, videoUrl?}]
  const [loading, setLoading] = useState(true);

  // selection + progress state
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState("image");
  const [pieces, setPieces] = useState(getPieces(category)); // {img:[], vid:[]}
  const [percent, setPercent] = useState(() =>
    categoryPercent(category, (DATA[category] ?? []).length)
  );

  // Title
  const title = TITLES[category] ?? "Learn";

  // Load Firestore data for this category (sort later on client)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFsRows([]);
    setSelectedIdx(0);
    setMode("image");

    (async () => {
      try {
        const q = query(collection(db, "content"), where("category", "==", category));
        const snap = await getDocs(q);
        if (cancelled) return;
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setFsRows(rows);
      } catch (err) {
        // If you previously used orderBy+where you might've seen a composite index error.
        // We now fetch without orderBy and sort on the client to avoid that.
        console.warn("Load Firestore content failed (using local fallback):", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [category]);

  // Merge local fallback + Firestore extras:
  // - Start from local DATA list (keeps 0..30 for numbers).
  // - Add FS rows whose labels don’t exist in local.
  // - Sort by "order" then label (client-side).
  const merged = useMemo(() => {
    // 1) base (local)
    const base = (DATA[category] ?? []).map((label, idx) => ({
      label,
      order: idx,
      src: "local",
    }));

    // 2) extras (FS rows not in base)
    const extra = fsRows
      .filter(r => !base.find(b => String(b.label) === String(r.label)))
      .map(r => ({
        label: String(r.label),
        order: Number(r.order ?? 1e9),
        src: "fs",
        imageUrl: r.imageUrl || "",
        videoUrl: r.videoUrl || "",
      }));

    // 3) merge + sort
    const mergedList = [...base, ...extra].sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return String(a.label).localeCompare(String(b.label));
    });

    return mergedList;
  }, [fsRows, category]);

  // Rendered item labels in order
  const items = useMemo(() => merged.map(m => m.label), [merged]);

  // Current label & FS doc (if any)
  const selectedLabel = items[selectedIdx] ?? "";
  const fsDocForSelected = useMemo(() => {
    // prefer a matching FS row by label for current selection
    return fsRows.find(r => String(r.label) === String(selectedLabel)) || null;
  }, [fsRows, selectedLabel]);

  // Allow video? If Firestore has any videoUrl in this category, enable it;
  // else use your old rule (numbers/alphabet = image only).
  const allowVideo = useMemo(() => {
    if (fsRows.length > 0) return fsRows.some(r => !!r.videoUrl);
    return DEFAULT_ALLOW_VIDEO(category);
  }, [fsRows, category]);

  // Keep progress % in sync with merged item count
  useEffect(() => {
    setPercent(categoryPercent(category, items.length));
    // Ensure selected index is in range after list changes
    if (selectedIdx >= items.length) setSelectedIdx(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  // Subscribe to your progress store so badges and % update live
  useEffect(() => {
    const unsub = subscribeProgress((st) => {
      setPieces(st[category] ?? { img: [], vid: [] });
      setPercent(categoryPercent(category, items.length));
    });
    return unsub;
  }, [category, items.length]);

  // Reset selection/mode when category changes
  useEffect(() => {
    setSelectedIdx(0);
    setMode("image");
  }, [category]);

  function onPick(idx) {
    setSelectedIdx(idx);
    setMode("image");
  }

  // Progress marking: local vs Firestore media
  function onImageViewedLocal() {
    if (hasImageAsset(category, selectedLabel)) {
      markPiece(category, selectedIdx, "img");
    }
  }
  function onVideoPlayedLocal() {
    if (hasVideoAsset(category, selectedLabel)) {
      markPiece(category, selectedIdx, "vid");
    }
  }
  function onImageViewedRemote() {
    if (fsDocForSelected?.imageUrl) {
      markPiece(category, selectedIdx, "img");
    }
  }
  function onVideoPlayedRemote() {
    if (fsDocForSelected?.videoUrl) {
      markPiece(category, selectedIdx, "vid");
    }
  }

  const isDoneBadge = itemIsDone(category, selectedIdx);

  return (
    <div className="cat-page">
      {/* Header */}
      <div className="cat-h1row">
        <button className="back-inline" onClick={() => nav(-1)} aria-label="Back">←</button>
        <h1 className="cat-h1">Learn: {TITLES[category] ?? "Learn"}</h1>
      </div>
      <p className="cat-sub">Tap on the box to view its sign.</p>

      {/* Pills */}
      <div className="pill-grid">
        {loading && <div className="muted">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="muted">No items yet.</div>
        )}
        {!loading && items.map((label, idx) => {
          const done = itemIsDone(category, idx);
          const active = selectedIdx === idx;
          return (
            <button
              key={`${label}-${idx}`}
              className={`pill ${done ? "is-done" : ""} ${active ? "is-active" : ""}`}
              onClick={() => onPick(idx)}
              aria-pressed={active}
            >
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Big Card */}
      <div className={`big-card ${mode === "video" ? "show-video" : "show-image"}`}>
        <div className="big-head">
          <div className="media-title">
            <b>{selectedLabel || (TITLES[category] ?? "Learn")}</b>
            {isDoneBadge ? <span className="badge-done" aria-label="learned">✓</span> : null}
          </div>

          {allowVideo && (
            <div className="segmented" role="tablist" aria-label="Media type">
              <button
                role="tab"
                aria-selected={mode === "image"}
                className={mode === "image" ? "on" : ""}
                onClick={() => setMode("image")}
              >
                Image
              </button>
              <button
                role="tab"
                aria-selected={mode === "video"}
                className={mode === "video" ? "on" : ""}
                onClick={() => setMode("video")}
              >
                Video
              </button>
            </div>
          )}
        </div>

        <div className="media-surface">
          {/* Prefer Firestore media for this label; fallback to local SignMedia */}
          {fsDocForSelected && (fsDocForSelected.imageUrl || fsDocForSelected.videoUrl) ? (
            mode === "video" && fsDocForSelected.videoUrl ? (
              <video
                className="learn-vid"
                src={fsDocForSelected.videoUrl}
                controls
                onPlay={onVideoPlayedRemote}
              />
            ) : fsDocForSelected.imageUrl ? (
              <img
                className="learn-img"
                src={fsDocForSelected.imageUrl}
                alt={selectedLabel}
                onLoad={onImageViewedRemote}
              />
            ) : (
              <div className="learn-ph">No media</div>
            )
          ) : (
            <SignMedia
              category={category}
              label={selectedLabel}
              mode={mode}
              onImageViewed={onImageViewedLocal}
              onVideoPlayed={onVideoPlayedLocal}
            />
          )}
        </div>

        <div className="speak-row">
          <button
            className="speak-btn"
            onClick={() => {
              try {
                window.speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance(String(selectedLabel || (TITLES[category] ?? "Learn")));
                window.speechSynthesis.speak(u);
              } catch {}
            }}
            aria-label="Speak"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M11 5 6 8H3v8h3l5 3V5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
              <path d="M14 9a5 5 0 0 1 0 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M16 7a8 8 0 0 1 0 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
          <div className="hint">Media is marked as learned automatically.</div>
        </div>

        <div className="percent-foot">
          <div className="progress-line"><div style={{ width: `${percent}%` }} /></div>
          <span className="progress-label">{percent}% complete</span>
        </div>
      </div>
    </div>
  );
}
