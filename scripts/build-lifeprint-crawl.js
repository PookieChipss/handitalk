// scripts/build-lifeprint-crawl.js
// Crawl Lifeprint and collect (videoId, term/title) for search.
// Wider coverage: more seeds, more link forms, all YouTube URL shapes.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OUT_CLIENT = path.resolve(__dirname, "../client/public/lifeprint-index.json");
const OUT_API    = path.resolve(__dirname, "../api/_data/lifeprint-index.json");

const MAX_PAGES = Number(process.env.LP_MAX_PAGES || "800");
const STARTS = (process.env.LP_STARTS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// letter indexes (a.htm … z.htm)
const letterSeeds = Array.from({ length: 26 }, (_, i) =>
  `https://www.lifeprint.com/asl101/index/${String.fromCharCode(97 + i)}.htm`
);

// extra hub pages that embed many clips
const hubSeeds = [
  "https://www.lifeprint.com/",
  "https://www.lifeprint.com/asl101/",
  "https://www.lifeprint.com/asl101/dictionary.htm",
  "https://www.lifeprint.com/asl101/lessons/lesson01.htm",
];

// ---- helpers ----
const clean = (s = "") =>
  decodeURIComponent(s).replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim();

function withinLifeprint(href) {
  return /^https?:\/\/(www\.)?lifeprint\.com/i.test(href);
}

// treat html if ends with .htm(l) OR ends with / OR has no extension
function looksHtml(u) {
  try {
    const url = new URL(u);
    const pathname = url.pathname;
    if (/\.html?$/i.test(pathname)) return true;
    if (pathname.endsWith("/")) return true;
    if (!/\.[a-z0-9]+$/i.test(pathname)) return true; // no extension
  } catch {}
  return false;
}

function pickLinks(html, baseUrl) {
  const out = new Set();
  const re = /href="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html))) {
    let u = m[1];
    if (!/^https?:\/\//i.test(u)) {
      try { u = new URL(u, baseUrl).toString(); } catch { continue; }
    }
    if (!withinLifeprint(u)) continue;
    if (!looksHtml(u)) continue;
    out.add(u.split("#")[0]); // drop fragment
  }
  return [...out];
}

// capture any common YouTube shape → 11-char id
function pickYouTubeIds(html) {
  const out = new Set();

  // /embed/ID
  let re = /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/g;
  let m; while ((m = re.exec(html))) out.add(m[1]);

  // watch?v=ID
  re = /youtube\.com\/watch\?[^"'>]*v=([A-Za-z0-9_-]{11})/g;
  while ((m = re.exec(html))) out.add(m[1]);

  // youtu.be/ID
  re = /youtu\.be\/([A-Za-z0-9_-]{11})/g;
  while ((m = re.exec(html))) out.add(m[1]);

  return [...out];
}

// prefer dictionary term from URL when present
function termFromUrl(u) {
  try {
    const m = u.match(/\/asl101\/pages-signs\/[^/]+\/([^/.?#]+)\.htm/i);
    if (m) return clean(m[1]);
  } catch {}
  return "";
}

function titleFromTag(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  let t = m[1].replace(/\s+/g, " ").trim();
  t = t.replace(/[-–|].*$/,"").replace(/\(.*?\)/g,"").trim();
  return t;
}

// ---- crawl ----
async function crawl() {
  const visited = new Set();
  const queue = [...new Set([...(STARTS.length ? STARTS : []), ...hubSeeds, ...letterSeeds])];

  const map = new Map(); // id → { videoId, term, title, source }

  while (queue.length && visited.size < MAX_PAGES) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    let res;
    try {
      res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(res.statusText);
    } catch {
      console.log("skip %s: fetch failed", url);
      continue;
    }

    const html = await res.text();

    // collect videos found on this page
    const ids = pickYouTubeIds(html);
    if (ids.length) {
      let term = termFromUrl(url);
      if (!term) term = clean(titleFromTag(html)).split(" ").slice(0, 3).join(" ");
      const title = term; // search label
      ids.forEach((id) => {
        if (!map.has(id)) map.set(id, { videoId: id, term, title, source: "Lifeprint" });
      });
    }

    // enqueue more pages
    pickLinks(html, url).forEach((u) => { if (!visited.has(u)) queue.push(u); });

    if (visited.size % 200 === 0) {
      process.stdout.write(`pages: ${visited.size}  videos: ${map.size}\r`);
    }
  }

  console.log(`\npages: ${visited.size}  videos: ${map.size}`);
  const list = [...map.values()];
  writeBoth(list);
}

function writeBoth(list) {
  fs.mkdirSync(path.dirname(OUT_CLIENT), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_API), { recursive: true });
  fs.writeFileSync(OUT_CLIENT, JSON.stringify(list, null, 2));
  fs.writeFileSync(OUT_API, JSON.stringify(list, null, 2));
  console.log(`Wrote lifeprint-index.json to client/public and api/_data`);
}

await crawl();
