// scripts/build-lifeprint-index.js
// Build a local index by scraping Lifeprint's page source for YouTube embed links.
// No YouTube API used. Outputs client/public/lifeprint-index.json

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

// read file or fetch url
async function readInput({ file, url }) {
  if (file) return fs.readFile(file, "utf8");
  if (url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
    return await r.text();
  }
  throw new Error("Provide --from-file <path> or --url <url>");
}

// parse anchors like: <a href="https://www.youtube.com/embed//IvRwNLNR4_w?rel=0;autoplay=1">Thank you!</a>
function extractItems(html) {
  // one pass: capture href + text
  const re = /<a\s+[^>]*href="https:\/\/www\.youtube\.com\/embed\/\/([A-Za-z0-9_-]{11})[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    const videoId = m[1];
    // strip tags inside, decode a bit
    let title = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!title) title = "ASL clip";
    out.push({
      videoId,
      title,
      // treat Lifeprint embeds as short phrase clips (we don’t know duration without API)
      durationSec: null,
      source: "Lifeprint",
    });
  }
  // de-dupe by videoId, keep first title
  const map = new Map();
  for (const it of out) if (!map.has(it.videoId)) map.set(it.videoId, it);
  return [...map.values()];
}

async function main() {
  const args = process.argv.slice(2);
  const fileFlag = args.indexOf("--from-file");
  const urlFlag  = args.indexOf("--url");

  const file = fileFlag >= 0 ? args[fileFlag + 1] : process.env.LIFEPRINT_SOURCE_FILE;
  const url  = urlFlag  >= 0 ? args[urlFlag + 1]  : process.env.LIFEPRINT_SOURCE_URL;

  const html = await readInput({ file, url });
  const items = extractItems(html);

  // write next to the client so it can be fetched at /lifeprint-index.json
  const outClient = path.join("client", "public", "lifeprint-index.json");
  await fs.mkdir(path.dirname(outClient), { recursive: true });
  await fs.writeFile(outClient, JSON.stringify(items, null, 2), "utf8");

  // optional mirror for your api/_data (not required for runtime)
  const outApi = path.join("api", "_data", "lifeprint-index.json");
  await fs.mkdir(path.dirname(outApi), { recursive: true });
  await fs.writeFile(outApi, JSON.stringify(items, null, 2), "utf8");

  console.log(`✔ Wrote ${items.length} Lifeprint items to:\n- ${outClient}\n- ${outApi}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
