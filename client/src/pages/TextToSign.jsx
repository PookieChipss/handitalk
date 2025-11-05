import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSignClipsForPhrase, getProviderFallback } from "@/lib/signProviders";
import "@/styles/text-to-sign.css";
import "@/styles/kid/text-to-sign-kid.css";

export default function TextToSign() {
  const nav = useNavigate();
  const [query, setQuery] = useState("");
  const [clips, setClips] = useState([]);
  const [ix, setIx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [refresh, setRefresh] = useState(0);

  const videoRef = useRef(null);
  const curr = clips[ix] || null;
  const count = clips.length;
  const charCount = useMemo(() => query.trim().length, [query]);

  const isKid =
    typeof document !== "undefined" &&
    document.body.classList.contains("kid");

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (curr && curr.kind !== "youtube" && curr.mp4) {
      try { v.currentTime = 0; v.play().catch(() => {}); } catch {}
    }
  }, [ix, curr?.mp4, curr?.kind]);

  // ---- helper: filter clips to only those that actually match the query ----
  function filterClipsByQuery(found, rawQuery) {
    const tokens = (rawQuery || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((w) => w.length >= 2);

    if (!tokens.length) return [];

    const cleaned = (s) => (s || "").toString().toLowerCase();

    const filtered = (found || []).filter((c) => {
      const cap = cleaned(c.caption || c.title);
      const key = cleaned(c.key || c.word || c.label);
      // Keep only if ANY token appears in caption or key/word/label
      return tokens.some((t) => cap.includes(t) || key.includes(t));
    });

    return filtered;
  }

  async function onTranslate() {
    const q = query.trim();
    if (!q) { setClips([]); setIx(0); setErr(""); return; }
    setLoading(true); setErr("");
    try {
      const found = await getSignClipsForPhrase(q);

      // ▼ NEW: strictly filter to avoid unrelated fallbacks like "hello"
      const finalClips = filterClipsByQuery(found, q);

      setClips(finalClips);
      setIx(0);
      setRefresh((n) => n + 1);

      if (!finalClips.length) {
        setErr("No video to preview. Try a different word or phrasing.");
      }
    } catch {
      setErr("Failed to load clips.");
    } finally {
      setLoading(false);
    }
  }

  const onPrev   = () => setIx((p) => (count ? (p - 1 + count) % count : 0));
  const onNext   = () => setIx((p) => (count ? (p + 1) % count : 0));
  const onRepeat = () => {
    const v = videoRef.current;
    if (curr?.kind === "youtube") { setRefresh((n) => n + 1); return; }
    if (v) { try { v.pause(); v.currentTime = 0; v.play().catch(() => {}); } catch {} }
  };

  async function onMediaError() {
    if (count > 1 && ix + 1 < count) { setIx(ix + 1); return; }
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await getProviderFallback(query.trim());

      // ▼ NEW: apply the same strict filtering to fallbacks
      const finalClips = filterClipsByQuery(res, query.trim());

      if (finalClips.length) {
        setClips(finalClips);
        setIx(0);
        setErr("");
      } else {
        setClips([]);
        setIx(0);
        setErr("No video to preview. Try a different word or phrasing.");
      }
    } catch {
      setErr("Couldn’t load this clip.");
    } finally {
      setLoading(false);
    }
  }

  const isYouTube = curr?.kind === "youtube";
  const ytSrc =
    isYouTube && curr.embed
      ? `${curr.embed}${curr.embed.includes("?") ? "&" : "?"}autoplay=1&mute=1&playsinline=1&_r=${refresh}`
      : null;

  const onKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      e.preventDefault();
      onTranslate();
    }
  };

  return (
    <div className="tts-page ttsk-page" style={{ fontFamily: "Outfit, system-ui, sans-serif" }}>
      {/* Header (left aligned) */}
      <header className="tts-header ttsk-header">
        <button className="back ttsk-back" onClick={() => nav(-1)} aria-label="Back">←</button>
        <h1 className="ttsk-title">Text to Sign</h1>
      </header>

      {/* Input card */}
      <div className="tts-card ttsk-card ttsk-card--input">
        <div className="ttsk-inner">
          <div className="ttsk-inputWrap">
            <textarea
              className="tts-input ttsk-input"
              placeholder="Type your message here..."
              maxLength={100}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="tts-counter ttsk-counter">{charCount}/100</div>
          </div>

          <button className="tts-btn ttsk-btnPrimary" onClick={onTranslate} disabled={loading}>
            {loading ? "Translating…" : "Translate"}
          </button>
        </div>
      </div>

      {/* Preview card */}
      <section className="tts-panel ttsk-card ttsk-card--preview">
        <div className="ttsk-inner">
          <div className="ttsk-panelHead">
            <div className="tts-panel-title ttsk-panelTitle">Sign Video Preview</div>
          </div>

          <div className="tts-stage ttsk-stage" role="region" aria-label="Sign video" tabIndex={0}>
            {!curr && !loading && (
              <div className="tts-placeholder ttsk-stagePlaceholder">
                {err ? err : "Enter a word or short phrase and tap Translate."}
              </div>
            )}

            {curr && (
              <div className="tts-player">
                {isYouTube ? (
                  <iframe
                    key={(ytSrc || "") + "|" + refresh}
                    className="tts-video ttsk-video"
                    src={ytSrc || undefined}
                    title={curr.caption || "ASL sign"}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : curr.mp4 ? (
                  <video
                    key={curr.mp4}
                    ref={videoRef}
                    src={curr.mp4}
                    muted
                    playsInline
                    className="tts-video ttsk-video"
                    onError={onMediaError}
                    controls={false}
                  />
                ) : (
                  <img
                    src={curr.gif || curr.thumb}
                    alt={curr.caption || "ASL sign"}
                    className="tts-video ttsk-video"
                    onError={onMediaError}
                  />
                )}
              </div>
            )}
          </div>

          <div className="tts-controls">
            <button className="mini" onClick={onPrev}   disabled={!count}>⏮ Prev</button>
            <button className="mini" onClick={onRepeat} disabled={!curr}>Repeat ⟲</button>
            <button className="mini" onClick={onNext}   disabled={!count}>Next ⏭</button>
          </div>

          <div className="tts-meta">
            {curr ? (
              <div>Showing <strong>{curr.caption || "clip"}</strong> <span>({ix + 1}/{count})</span></div>
            ) : err ? <div className="tts-error">{err}</div> : null}
          </div>
        </div>
      </section>

      {isKid ? (
        <div className="ttsk-footer">
          <div className="ttsk-footNote">
            Video mappings derived from <strong>Lifeprint (ASL University)</strong>. Videos play via YouTube embeds.
          </div>
        </div>
      ) : (
        <footer className="tts-footer tiny">
          Video mappings derived from <b>Lifeprint (ASL University)</b>. Videos play via YouTube embeds.
        </footer>
      )}
    </div>
  );
}
