// client/src/lib/asluIndex.js
let _indexPromise = null;

const norm = (s) =>
  (s || "").toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

export function loadAsluIndex() {
  if (_indexPromise) return _indexPromise;

  _indexPromise = fetch("/aslu-index.json")
    .then((r) => {
      if (!r.ok) throw new Error("Failed to load /aslu-index.json");
      return r.json();
    })
    .then((rows) => {
      console.log(`[aslu] loaded ${rows.length} items`);
      return rows.map((v) => ({
        id: v.id,
        title: v.title || "",
        durationSeconds: Number(v.durationSeconds) || 0,
        embed: `https://www.youtube.com/embed/${v.id}?rel=0&modestbranding=1&playsinline=1`,
        thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      }));
    });

  return _indexPromise;
}

function scoreItem(item, q) {
  const title = norm(item.title);
  const toks = q.split(" ").filter(Boolean);
  let s = 0;
  for (const t of toks) if (title.includes(t)) s += 2;
  if (title.startsWith(q)) s += 1;
  if (title.includes(q)) s += 1;
  return s;
}

export async function searchAsluIndex(q, limit = 5, opts = {}) {
  const list = await loadAsluIndex();
  const query = norm(q);
  if (!query) return [];

  const maxSeconds =
    typeof opts.maxSeconds === "number" ? opts.maxSeconds : 10;

  const scored = list
    .filter((i) => !maxSeconds || i.durationSeconds <= maxSeconds)
    .map((item) => ({ item, s: scoreItem(item, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => ({
      kind: "youtube",
      embed: x.item.embed,
      caption: x.item.title,
      thumb: x.item.thumb,
      source: "YouTube",
    }));

  return scored;
}
