// client/src/lib/signProviders.js
// Pipeline: Lifeprint (local index, no quota) → Tenor fallback

import { searchLifeprintClips } from "./lifeprintIndex";

const TENOR_KEY = import.meta.env.VITE_TENOR_KEY;

/** Tenor fallback (gif/mp4) */
async function searchTenor(q, limit = 8) {
  if (!TENOR_KEY) return [];
  const url =
    "https://tenor.googleapis.com/v2/search" +
    `?q=${encodeURIComponent(q + " sign language")}` +
    `&key=${TENOR_KEY}` +
    `&limit=${limit}` +
    `&random=false` +
    `&client_key=handitalk` +
    `&media_filter=mp4,gif,mediumgif,tinygif,nanomp4`;

  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json();

  return (j.results || []).map((t) => {
    const m = t.media_formats || {};
    const mp4 = m.mp4?.url || m.mediumgif?.url || m.nanomp4?.url || null;
    const gif = m.gif?.url || m.tinygif?.url || null;
    return {
      kind: mp4 ? "mp4" : "gif",
      mp4,
      gif,
      thumb: m.tinygif?.url || m.nanomp4?.url || undefined,
      caption: t.content_description || q,
      source: "Tenor",
      credit: "Tenor",
    };
  });
}

/** Main entry used by the page */
export async function getSignClipsForPhrase(q) {
  // 1) Local Lifeprint index (YouTube embeds; no quota)
  const lifeprint = await searchLifeprintClips(q, 5, { maxSeconds: 10 }).catch(() => []);
  if (lifeprint.length) return lifeprint;

  // 2) Fallback to GIF/MP4 (Tenor)
  const gifs = await searchTenor(q, 8).catch(() => []);
  return gifs;
}

/** Used by the "error → next best" recovery path */
export async function getProviderFallback(q) {
  const gifs = await searchTenor(q, 8).catch(() => []);
  return gifs;
}
