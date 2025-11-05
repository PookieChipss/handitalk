// Progress with per-UID localStorage + optional Firestore sync.
// Tracks pieces per item: image and (if exists) video.

let currentUid = "anon";
const LS_PREFIX = "HT_PROGRESS::";
const CATEGORIES = ["alphabet", "numbers", "phrases", "emotions", "greetings", "foods"];

const withVideo = (c) => !["alphabet", "numbers"].includes(c);

// ---------------- in-memory
let state = createEmptyState();
const subs = new Set();

// ---------------- helpers
function emptyForCategory() { return { img: [], vid: [] }; }
function createEmptyState() {
  const s = {};
  for (const c of CATEGORIES) s[c] = emptyForCategory();
  return s;
}
function storageKey(uid = currentUid) { return `${LS_PREFIX}${uid || "anon"}`; }

function postLoadMigrations(obj) {
  const base = createEmptyState();
  for (const c of CATEGORIES) {
    const v = obj?.[c];
    if (Array.isArray(v)) base[c] = { img: v, vid: [] };                 // v1 → v2
    else if (v && typeof v === "object") base[c] = { img: v.img ?? [], vid: v.vid ?? [] };
    else base[c] = emptyForCategory();
  }
  if (obj?.objects) {                                                     // legacy 'objects' → 'foods'
    base.foods = Array.isArray(obj.objects) ? { img: obj.objects, vid: [] } : base.foods;
  }
  return base;
}
function loadFromLocal(uid = currentUid) {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    return postLoadMigrations(raw ? JSON.parse(raw) : {});
  } catch { return createEmptyState(); }
}
function saveToLocal(uid = currentUid, data = state) {
  try { localStorage.setItem(storageKey(uid), JSON.stringify(data)); } catch {}
}
function emit() { for (const cb of subs) try { cb(state); } catch {} }

// ---------------- optional Firestore
let _db = null;
async function fetchFromFirestore(uid) {
  if (!_db || !uid) return null;
  try {
    const { doc, getDoc } = await import("firebase/firestore");
    const ref = doc(_db, "users", uid, "meta", "progress");
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}
async function writeToFirestore(uid, data) {
  if (!_db || !uid) return;
  try {
    const { doc, setDoc } = await import("firebase/firestore");
    const ref = doc(_db, "users", uid, "meta", "progress");
    await setDoc(ref, data, { merge: true });
  } catch {}
}

// ---------------- core API
export function subscribeProgress(cb) {
  subs.add(cb); cb(state);
  return () => subs.delete(cb);
}
export function getPieces(category) { return state[category] ?? emptyForCategory(); }
export function hasPiece(category, idx, piece /* 'img'|'vid' */) {
  const arr = state[category]?.[piece] ?? []; return arr.includes(idx);
}
export function markPiece(category, idx, piece /* 'img'|'vid' */) {
  if (!CATEGORIES.includes(category)) return;
  const set = new Set(state[category]?.[piece] ?? []);
  if (!set.has(idx)) {
    set.add(idx);
    state[category][piece] = Array.from(set).sort((a,b)=>a-b);
    saveToLocal(); writeToFirestore(currentUid, state); emit();
  }
}
export function itemIsDone(category, idx) {
  const p = state[category] ?? emptyForCategory();
  return withVideo(category) ? (p.img.includes(idx) && p.vid.includes(idx)) : p.img.includes(idx);
}
export function categoryPercent(category, totalItems) {
  const items = Math.max(0, Number(totalItems) || 0);
  if (items === 0) return 0;
  const p = state[category] ?? emptyForCategory();
  const piecesDone = (p.img?.length || 0) + (p.vid?.length || 0);
  const denom = items * (withVideo(category) ? 2 : 1);
  return Math.round((piecesDone / Math.max(1, denom)) * 100);
}

/* ---------------- compatibility exports so older pages don't break ------------- */

// legacy: array of DONE item indices (previously a simple list)
// for video categories, return items where BOTH img & vid are done
export function getDone(category) {
  const p = state[category] ?? emptyForCategory();
  if (withVideo(category)) {
    const s = new Set(p.img); return (p.vid || []).filter(i => s.has(i));
  }
  return p.img || [];
}

// legacy: toggle a single list → we map it to toggling the image piece
export function toggleDone(category, idx) {
  const p = state[category] ?? (state[category] = emptyForCategory());
  const arr = p.img;
  const pos = arr.indexOf(idx);
  if (pos === -1) arr.push(idx); else arr.splice(pos, 1);
  state[category].img = Array.from(new Set(arr)).sort((a,b)=>a-b);
  saveToLocal(); writeToFirestore(currentUid, state); emit();
}

// legacy alias: getPercent
export const getPercent = categoryPercent;

// ---------------- bootstrap
export function initAuthProgressSync(auth, options = {}) {
  _db = options.db || null;
  state = loadFromLocal("anon"); emit();

  import("firebase/auth").then(({ onAuthStateChanged }) => {
    onAuthStateChanged(auth, async (user) => {
      const newUid = user?.uid || "anon";
      if (newUid === currentUid) return;
      currentUid = newUid;

      let next = loadFromLocal(currentUid);

      if (currentUid !== "anon") {
        const remote = await fetchFromFirestore(currentUid);
        if (remote && typeof remote === "object") {
          next = postLoadMigrations(remote); saveToLocal(currentUid, next);
        } else {
          const anon = loadFromLocal("anon");
          const moved = postLoadMigrations(anon);
          const any = Object.values(moved).some(x => (x.img?.length || 0) + (x.vid?.length || 0) > 0);
          if (any) {
            next = moved;
            saveToLocal(currentUid, next); writeToFirestore(currentUid, next);
            saveToLocal("anon", createEmptyState());
          }
        }
      }

      state = next; emit();
    });
  });
}
