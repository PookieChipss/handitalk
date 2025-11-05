import React, { useEffect, useMemo, useRef } from "react";

// ---------- asset resolvers (robust to your file names)
const imgGlobs = {
  phrases:   import.meta.glob("@/assets/phrases/**/*.{png,webp,jpg,jpeg,gif}",   { eager: true, import: "default" }),
  greetings: import.meta.glob("@/assets/greetings/**/*.{png,webp,jpg,jpeg,gif}", { eager: true, import: "default" }),
  emotions:  import.meta.glob("@/assets/emotions/**/*.{png,webp,jpg,jpeg,gif}",  { eager: true, import: "default" }),
  foods:     import.meta.glob("@/assets/foods/**/*.{png,webp,jpg,jpeg,gif}",     { eager: true, import: "default" }),
  // alphabet / numbers handled by dedicated poster finder below
};

const vidGlobs = {
  phrases:   import.meta.glob("@/assets/phrases/**/*.{mp4,webm}",   { eager: true, import: "default" }),
  greetings: import.meta.glob("@/assets/greetings/**/*.{mp4,webm}", { eager: true, import: "default" }),
  emotions:  import.meta.glob("@/assets/emotions/**/*.{mp4,webm}",  { eager: true, import: "default" }),
  foods:     import.meta.glob("@/assets/foods/**/*.{mp4,webm}",     { eager: true, import: "default" }),
};

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");

// Find a file in a glob map by testing path with a regex built from `key`
function findIn(globMap, key) {
  const re = new RegExp(`(^|[\\/_-])${key}([\\._-]|$)`, "i");
  for (const p in globMap) if (re.test(p)) return globMap[p];
  return null;
}

// Posters for alphabet & numbers (very forgiving filenames)
function resolvePoster(category, key) {
  try {
    if (category === "alphabet") {
      const candidates = import.meta.glob("@/assets/alphabets/**/*.{png,webp,jpg,jpeg}", { eager: true, import: "default" });
      return findIn(candidates, key) || null;
    }
    if (category === "numbers") {
      const candidates = import.meta.glob("@/assets/numbers/**/*.{png,webp,jpg,jpeg}", { eager: true, import: "default" });
      return findIn(candidates, key) || null;
    }
  } catch {}
  return null;
}

export function hasImageAsset(category, label) {
  const k = slug(label);
  if (category === "alphabet" || category === "numbers") {
    return Boolean(resolvePoster(category, label));
  }
  return Boolean(findIn(imgGlobs[category] || {}, k));
}

export function hasVideoAsset(category, label) {
  const k = slug(label);
  const g = vidGlobs[category] || {};
  return Boolean(findIn(g, k));
}

function resolveImage(category, label) {
  const k = slug(label);
  if (category === "alphabet" || category === "numbers") {
    return resolvePoster(category, label);
  }
  return findIn(imgGlobs[category] || {}, k);
}

function resolveVideo(category, label) {
  const k = slug(label);
  return findIn(vidGlobs[category] || {}, k);
}

// ---------- UI
export default function SignMedia({
  category,
  label,
  mode = "image",            // 'image' | 'video'
  onImageViewed,             // () => void
  onVideoPlayed,             // () => void
}) {
  const imgSrc = useMemo(() => resolveImage(category, label), [category, label]);
  const vidSrc = useMemo(() => resolveVideo(category, label), [category, label]);
  const videoRef = useRef(null);

  // auto-mark when image shows
  useEffect(() => {
    if (mode !== "image" || !imgSrc) return;
    const t = setTimeout(() => onImageViewed?.(), 0);
    return () => clearTimeout(t);
  }, [mode, imgSrc, onImageViewed]);

  // auto-mark when video starts playing
  useEffect(() => {
    if (mode !== "video" || !videoRef.current) return;
    const el = videoRef.current;
    const onPlay = () => onVideoPlayed?.();
    el.addEventListener("playing", onPlay, { once: true });
    return () => el.removeEventListener("playing", onPlay);
  }, [mode, vidSrc, onVideoPlayed]);

  // alphabets / numbers are image-only—guard against wrong mode
  const forceImageOnly = category === "alphabet" || category === "numbers";
  const actualMode = forceImageOnly ? "image" : mode;

  return (
    <div className={`media-area ${actualMode === "video" ? "is-video" : "is-image"}`}>
      {actualMode === "image" ? (
        imgSrc ? (
          <img className="media-img" src={imgSrc} alt={String(label)} />
        ) : (
          <div className="media-placeholder">No image</div>
        )
      ) : vidSrc ? (
        <video
          ref={videoRef}
          className="media-video"
          src={vidSrc}
          controls
          playsInline
          preload="metadata"
        />
      ) : (
        <div className="media-placeholder">No video</div>
      )}
    </div>
  );
}
