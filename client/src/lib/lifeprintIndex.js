// client/src/lib/lifeprintIndex.js
// Smarter local search over /lifeprint-index.json (no YouTube quota).

let _indexPromise = null;

function norm(s) {
  return (s || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[_()[\]{}"“”'’.,!?;:/\\|+*=<>~`^]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function tokenize(s) {
  return norm(s).split(" ").filter(Boolean);
}
function isSingleSignTitle(title) {
  if (!title) return false;
  const t = title.trim();
  if (/^\(?[A-Z -]{2,}\)?$/.test(t)) return true;
  const toks = tokenize(t);
  return toks.length <= 2;
}

// Phrase aliases → Lifeprint-ish words
const PHRASE_ALIASES = {
  "hello": ["hello", "hi"],
  "hi": ["hello", "hi"],
  "good morning": ["good", "morning"],
  "good night": ["goodnight", "good night"],
  "goodnight": ["goodnight", "good night"],
  "thank you": ["thank", "thank-you", "thanks"],
  "thanks": ["thank", "thank-you", "thanks"],
  "please": ["please"],
  "sorry": ["sorry"],
  "help": ["help", "help-me", "help you"],
  "yes": ["yes"],
  "no": ["no"],
  "ok": ["ok", "okay"],
  "what is your name": ["your", "name", "what", "your name what", "what your name"],
  "what's your name": ["your", "name", "what", "your name what", "what your name"],
  "where": ["where"],
  "who": ["who"],
  "what": ["what"],
  "when": ["when"],
  "why": ["why"],
  "how": ["how"],
  "book": ["book"],
  "eat": ["eat"],
  "drink": ["drink"],
  "water": ["water"],
  "bathroom": ["bathroom", "toilet", "restroom"],
  "school": ["school"],
  "friend": ["friend"],
  "i love you": ["i love you", "love you"],
  "see you later": ["see you later"],
  "goodbye": ["goodbye", "bye"],
};

async function loadIndex() {
  if (_indexPromise) return _indexPromise;
  _indexPromise = (async () => {
    const res = await fetch("/lifeprint-index.json", { credentials: "omit" });
    if (!res.ok) throw new Error("lifeprint index load failed");
    const raw = await res.json();

    const items = (raw || []).map((r) => {
      const title = r.title || "";
      const nTitle = norm(title);
      const tokens = tokenize(title);
      return {
        videoId: r.videoId,
        title,
        nTitle,
        tokens,
        source: r.source || "Lifeprint",
        durationSec: r.durationSec ?? null,
        isSingle: isSingleSignTitle(title),
      };
    });

    console.log("[lifeprint] loaded", items.length, "<=10s items");
    const empties = items.filter(i => !i.title?.trim()).length;
    if (empties) console.warn("[lifeprint] empty titles:", empties);
    return items;
  })();
  return _indexPromise;
}

/** Score an item against query tokens/phrases. */
function scoreItem(item, qTokens, qPhrases) {
  let score = 0;

  // phrase hit
  let phraseHit = false;
  for (const p of qPhrases) {
    if (item.nTitle === p) { score += 120; phraseHit = true; }
    else if (item.nTitle.startsWith(p + " ")) { score += 40; phraseHit = true; }
    else if (item.nTitle.endsWith(" " + p)) { score += 40; phraseHit = true; }
  }

  // whole-word overlap
  const itoks = new Set(item.tokens);
  let tokenHits = 0;
  for (const t of qTokens) {
    if (itoks.has(t)) { score += 12; tokenHits++; }
  }

  // if ZERO overlap, reject
  if (!phraseHit && tokenHits === 0) return -Infinity;

  // tiebreakers
  if (item.isSingle) score += 2;
  if (item.durationSec) score += Math.max(0, 10 - Math.min(10, item.durationSec));

  return score;
}

/** Search local index. If nothing overlaps, returns [] so caller can fallback. */
export async function searchLifeprintClips(query, limit = 5, { maxSeconds = 10 } = {}) {
  const items = await loadIndex();
  const qn = norm(query);
  if (!qn) return [];

  // tokens + phrase bag (+ aliases)
  let qTokens = tokenize(query);
  let phraseBag = [qn];
  const alias = PHRASE_ALIASES[qn];
  if (alias?.length) {
    const aliasTokens = alias.flatMap((x) => tokenize(x));
    qTokens = [...new Set([...qTokens, ...aliasTokens])];
    phraseBag = [...new Set([...phraseBag, ...alias.map(norm)])];
  }

  const cand = [];
  for (const it of items) {
    if (maxSeconds && it.durationSec && it.durationSec > maxSeconds) continue;
    const sc = scoreItem(it, qTokens, phraseBag);
    if (sc > -Infinity) cand.push([sc, it]);
  }

  if (!cand.length) return []; // ← triggers GIF fallback

  cand.sort((a, b) => b[0] - a[0]);

  return cand.slice(0, limit).map(([_, it]) => ({
    kind: "youtube",
    embed: `https://www.youtube.com/embed/${it.videoId}?rel=0&modestbranding=1&playsinline=1`,
    caption: it.title || query,
    thumb: `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg`,
    source: it.source || "Lifeprint",
    durationSec: it.durationSec || undefined,
  }));
}
