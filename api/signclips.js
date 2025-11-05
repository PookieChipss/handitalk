// api/signclips.js  (CommonJS)
const fs = require("fs/promises");
const path = require("path");

let INDEX_CACHE = null;

async function findIndexPath() {
  // Try the intended location first, but also accept your earlier path.
  const candidates = [
    path.join(__dirname, "_data", "aslu-index.json"),
    path.join(__dirname, "..", "api_data", "aslu-index.json"), // your earlier folder
  ];
  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch (_) {}
  }
  throw new Error("aslu-index.json not found in api/_data or api_data");
}

async function loadIndex() {
  if (INDEX_CACHE) return INDEX_CACHE;
  const p = await findIndexPath();
  const raw = await fs.readFile(p, "utf8");
  INDEX_CACHE = JSON.parse(raw);
  return INDEX_CACHE;
}

function norm(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function score(titleNorm, qTokens) {
  let hits = 0;
  for (const t of qTokens) if (titleNorm.includes(t)) hits++;
  return hits;
}

function pickBest(index, q, { max = 5, maxSeconds = 10 } = {}) {
  const qTokens = norm(q).split(" ").filter(Boolean);
  if (!qTokens.length) return [];

  return index
    .filter((v) => (v.durationSec ?? 0) <= maxSeconds)
    .map((v) => ({ v, s: score(norm(v.title), qTokens) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => {
      if (b.s !== a.s) return b.s - a.s;               // more matched tokens first
      if (a.v.title.length !== b.v.title.length)       // shorter title next
        return a.v.title.length - b.v.title.length;
      return (a.v.durationSec ?? 999) - (b.v.durationSec ?? 999); // shorter clip
    })
    .slice(0, max)
    .map(({ v }) => v);
}

async function searchTenor(q, limit = 6) {
  const TENOR_KEY = process.env.TENOR_KEY;
  if (!TENOR_KEY) return []; // safe no-op if key not set

  const url =
    "https://tenor.googleapis.com/v2/search" +
    `?q=${encodeURIComponent(q + " ASL sign")}` +
    `&key=${TENOR_KEY}` +
    `&limit=${limit}` +
    `&random=false` +
    `&client_key=handitalk` +
    `&media_filter=mp4,mediumgif,tinygif`;

  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json();

  return (j.results || [])
    .map((t) => {
      const m = t.media_formats || {};
      const mp4 = m.mp4?.url || null;
      const gif = m.mediumgif?.url || m.tinygif?.url || null;
      if (!mp4 && !gif) return null; // ignore static images
      return {
        kind: mp4 ? "mp4" : "gif",
        mp4,
        gif,
        thumb: m.tinygif?.url || m.mediumgif?.url,
        caption: t.content_description || q,
        source: "Tenor",
      };
    })
    .filter(Boolean);
}

module.exports = async (req, res) => {
  try {
    const { q = "", max = "5", maxSeconds = "10" } = req.query || {};
    const maxN = Math.max(1, Math.min(10, parseInt(max, 10) || 5));
    const maxS = Math.max(1, Math.min(30, parseInt(maxSeconds, 10) || 10));

    const idx = await loadIndex();
    const picked = pickBest(idx, q, { max: maxN, maxSeconds: maxS });

    let clips = picked.map((v) => ({
      kind: "youtube",
      embed: `https://www.youtube.com/embed/${v.id}?rel=0&modestbranding=1`,
      caption: v.title,
      thumb: v.thumb || undefined,
      source: "YouTube",
      durationSec: v.durationSec,
    }));

    if (!clips.length) {
      clips = await searchTenor(q, maxN);
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({ q, clips });
  } catch (e) {
    console.error("[/api/signclips] error:", e.message);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(500).json({ error: "server_error", message: e.message });
  }
};
