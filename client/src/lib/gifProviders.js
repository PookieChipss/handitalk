// src/lib/gifProviders.js
import curatedRaw from "@/data/signSources.json";

/* ------------------- utils ------------------- */
const stopWords = new Set(["to","the","a","an","and","is","are","am","be","of","for","on","in","at","i","you","we","go","want","need"]);
const norm = (s) => (s || "").toLowerCase().trim().replace(/\s+/g, " ");
const tok  = (s) => norm(s).split(/\s+/).filter(w => w && !stopWords.has(w));

const SYN = { toilet:["bathroom","restroom","wc","lavatory"], bathroom:["toilet","restroom","wc"], restroom:["toilet","bathroom","wc"], hi:["hello"], hello:["hi","greetings"] };
const synonymsFor = (w) => [w, ...(SYN[w] || [])];

function resolveAliases(map) {
  const out = { ...map };
  for (const [k, arr] of Object.entries(map)) {
    if (Array.isArray(arr) && arr.length && arr[0].aliasOf) out[k] = map[arr[0].aliasOf] || [];
  }
  return out;
}
const curated = resolveAliases(curatedRaw);

/* ------------------- providers ------------------- */
export async function searchTenor(term, limit = 6) {
  const key = import.meta.env.VITE_TENOR_KEY;
  if (!key) return [];
  const url = new URL("https://tenor.googleapis.com/v2/search");
  url.searchParams.set("q", `asl sign ${term}`);
  url.searchParams.set("key", key);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("contentfilter", "high");
  url.searchParams.set("media_filter", "gif,mp4,tinygif,tinymp4");
  url.searchParams.set("client_key", "handitalk");
  try {
    const r = await fetch(url); if (!r.ok) return [];
    const j = await r.json();
    return (j.results || []).map((it) => {
      const mf = it.media_formats || {};
      const mp4 = mf.tinymp4?.url || mf.mp4?.url || null;
      const gif = mf.tinygif?.url || mf.gif?.url || null;
      const thumb = mf.tinygif?.url || mf.gif?.url || mp4 || null;
      return { mp4, gif, thumb, caption: (it.content_description || it.title || term || "").trim(), source: "GIPHY/Tenor", credit: "Tenor" };
    });
  } catch { return []; }
}

export async function searchGiphy(term, limit = 6) {
  const key = import.meta.env.VITE_GIPHY_KEY;
  if (!key) return [];
  const url = new URL("https://api.giphy.com/v1/gifs/search");
  url.searchParams.set("api_key", key);
  url.searchParams.set("q", `asl sign ${term}`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("rating", "g");
  try {
    const r = await fetch(url); if (!r.ok) return [];
    const j = await r.json();
    return (j.data || []).map((it) => {
      const img = it.images || {};
      const mp4 = img.preview_mp4?.mp4 || img.original_mp4?.mp4 || null;
      const gif = img.fixed_height_small?.url || img.original?.url || null;
      const thumb = img.fixed_height_small_still?.url || gif || mp4 || null;
      return { mp4, gif, thumb, caption: (it.title || term || "").trim(), source: "GIPHY", credit: "GIPHY" };
    });
  } catch { return []; }
}

/* ------------------- curated ------------------- */
async function curatedDirect(term) {
  const t = norm(term);
  const arr = curated[t]; if (!arr?.length) return [];
  return arr.filter(x => x && (x.mp4 || x.gif)).map((x) => ({
    mp4: x.mp4 || null, gif: x.gif || null, thumb: x.thumb || x.gif || x.mp4 || null,
    caption: t, source: "Curated", credit: x.credit || "Curated"
  }));
}

async function curatedSearch(term) {
  const t = norm(term);
  const arr = curated[t]; if (!arr?.length) return [];
  const jobs = arr.filter(it => it.search).map(async (it) => {
    let res = await searchTenor(it.search);
    if (import.meta.env.VITE_GIPHY_KEY) res = res.concat(await searchGiphy(it.search));
    return res.map((x) => ({ ...x, credit: it.credit || x.credit || "Curated search" }));
  });
  const batches = await Promise.all(jobs);
  return batches.flat();
}

/* ------------------- scoring & merge ------------------- */
function scoreCandidate(query, c) {
  const caption = norm(c.caption || "");
  const qTokens = tok(query).flatMap(synonymsFor);
  let hits = 0, score = 0;
  for (const w of qTokens) if (caption.includes(w)) { hits++; score += 3; }
  if (/asl|sign/i.test(caption)) score += 1;
  return { score, hits };
}
function dedupe(arr) {
  const seen = new Set();
  return arr.filter((x) => {
    const id = x.mp4 || x.gif || x.thumb || x.caption;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
function filterRank(query, arr, limit = 10) {
  return arr.map(c => ({ c, m: scoreCandidate(query, c) }))
    .filter(({ m }) => m.hits > 0)
    .sort((a, b) => b.m.score - a.m.score)
    .map(({ c }) => c)
    .slice(0, limit);
}

/* ------------------- public API ------------------- */
export async function getCurated(term) {
  const direct = await curatedDirect(term);
  const searched = await curatedSearch(term);
  return filterRank(term, dedupe([...searched, ...direct]));
}
export async function getProviderFallback(term) {
  const [t, g] = await Promise.all([
    searchTenor(term),
    import.meta.env.VITE_GIPHY_KEY ? searchGiphy(term) : Promise.resolve([]),
  ]);
  return filterRank(term, dedupe([...t, ...g]));
}
export async function getSignClipsForPhrase(phrase) {
  const q = norm(phrase);
  const cur = await getCurated(q);
  if (cur.length) return cur;

  let out = await getProviderFallback(q);
  if (out.length) return out;

  let all = [];
  for (const w of tok(q)) {
    for (const s of synonymsFor(w)) {
      let r = await getCurated(s);
      if (!r.length) r = await getProviderFallback(s);
      all = all.concat(r.map((x) => ({ ...x, caption: s })));
    }
  }
  return filterRank(q, dedupe(all));
}
