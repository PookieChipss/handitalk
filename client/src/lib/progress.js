// Lightweight local progress store (localStorage)
// Structure: { [category]: { total: number, done: [itemIds...] } }
const KEY = "ht.progress.v1";

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch { return {}; }
}
function write(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

/** Mark a single item as completed within a category. */
export function markItemDone(category, itemId, total) {
  if (!category || itemId == null) return;
  const data = read();
  const cat = data[category] || { total: total || 0, done: [] };
  if (total && !cat.total) cat.total = total;
  if (!Array.isArray(cat.done)) cat.done = [];
  if (!cat.done.includes(itemId)) cat.done.push(itemId);
  data[category] = cat;
  write(data);
}

/** Get all categories with progress (only those the user has started). */
export function getAllProgress() {
  const data = read();
  const out = {};
  Object.entries(data).forEach(([k, v]) => {
    const total = Math.max(1, Number(v.total || 0));
    const count = Math.min(v.done?.length || 0, total);
    const percent = Math.round((count / total) * 100);
    out[k] = { count, total, percent };
  });
  return out;
}

/** Optional helper if you want a single category quickly. */
export function getCategoryProgress(category) {
  return getAllProgress()[category] || { count: 0, total: 0, percent: 0 };
}

/** Reset a category (not used by UI, handy for dev/testing). */
export function resetCategory(category) {
  const data = read();
  delete data[category];
  write(data);
}
