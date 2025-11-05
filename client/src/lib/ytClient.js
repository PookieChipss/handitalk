// src/lib/ytClient.js
// Channel-first search with caching and a quota "circuit breaker".

const YT_KEY = import.meta.env.VITE_YT_KEY || "";
const YT_SEARCH = "https://www.googleapis.com/youtube/v3/search";
const ASLU_CHANNEL = "UC0b6CqtNVwT3Z6hZtYlZyPQ"; // ASLU (Signs) channel id
const CACHE_NS = "yt_cache_v1";
const QUOTA_BLOCK_KEY = "yt_quota_block_until_v1";

// In-memory + localStorage cache (7 days TTL)
const mem = new Map();
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function now() { return Date.now(); }

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_NS);
    if (!raw) return;
    const obj = JSON.parse(raw);
    for (const [k, v] of Object.entries(obj)) {
      mem.set(k, v);
    }
  } catch {}
}
function saveCache() {
  const obj = {};
  for (const [k, v] of mem.entries()) obj[k] = v;
  try { localStorage.setItem(CACHE_NS, JSON.stringify(obj)); } catch {}
}
loadCache();

function norm(s) {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function cacheGet(key) {
  const rec = mem.get(key);
  if (!rec) return null;
  if (rec.expires && rec.expires < now()) { mem.delete(key); return null; }
  return rec.data || null;
}
function cachePut(key, data) {
  mem.set(key, { data, expires: now() + TTL_MS });
  saveCache();
}

function quotaBlocked() {
  const until = parseInt(localStorage.getItem(QUOTA_BLOCK_KEY) || "0", 10);
  return until > now();
}
function setQuotaBlock(hours = 6) {
  const until = now() + hours * 60 * 60 * 1000;
  localStorage.setItem(QUOTA_BLOCK_KEY, String(until));
}

async function ytSearchOnce(params) {
  const url = new URL(YT_SEARCH);
  const defaults = {
    key: YT_KEY,
    part: "snippet",
    type: "video",
    videoDuration: "short", // <= 4 mins
    maxResults: "5",
    // Limit payload size (does not reduce quota cost, but is faster)
    fields: "items(id/videoId,snippet/title,snippet/thumbnails/default/url)"
  };
  Object.entries({ ...defaults, ...params }).forEach(([k, v]) =>
    url.searchParams.set(k, v)
  );

  const res = await fetch(url.toString());
  if (!res.ok) {
    let reason = "";
    try {
      const j = await res.json();
      reason = j?.error?.errors?.[0]?.reason || "";
      if (reason === "quotaExceeded") setQuotaBlock(8); // back off for 8h
    } catch {}
    throw new Error(`YT HTTP ${res.status} ${reason}`);
  }
  const j = await res.json();
  return (j.items || []).map((it) => ({
    kind: "youtube",
    // use the privacy-enhanced domain
    embed:
      `https://www.youtube-nocookie.com/embed/${it.id.videoId}?rel=0&modestbranding=1&playsinline=1`,
    caption: it.snippet?.title || "",
    thumb: it.snippet?.thumbnails?.default?.url,
    source: "YouTube",
  }));
}

/**
 * Search YouTube with:
 *  1) channel-first (ASLU)
 *  2) global fallback
 *  Returns [] if YT is disabled or quota is blocked.
 */
export async function searchYouTubeClips(q, max = 5, { maxSeconds = 10 } = {}) {
  if (!YT_KEY) return [];        // no key => skip
  if (quotaBlocked()) return []; // we hit quota earlier => skip for now

  const key = `q:${norm(q)}|max:${max}|sec:${maxSeconds}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  // channel-first
  try {
    const ch = await ytSearchOnce({
      q,
      channelId: ASLU_CHANNEL,
      maxResults: String(max),
      // "short" is up to 4 minutes; we still filter client-side by caption length if needed
      // YouTube API has no direct "seconds <= N" filter in v3 search
    });
    if (ch.length) { cachePut(key, ch); return ch; }
  } catch (e) {
    // if quotaExceeded tripped, quotaBlocked() will short-circuit future calls
    // swallow and try global
  }

  // global fallback
  try {
    const gl = await ytSearchOnce({
      q,
      maxResults: String(max),
    });
    cachePut(key, gl);
    return gl;
  } catch (e) {
    // final failure
    return [];
  }
}
