// scripts/enrich-lifeprint-durations.js
// Add duration (and optional ytTitle) for collected videoIds, then filter <= MAX_SECONDS.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IN_FILE  = path.resolve(__dirname, "../client/public/lifeprint-index.json");
const OUT_FILE = path.resolve(__dirname, "../client/public/lifeprint-index.json");
const OUT_API  = path.resolve(__dirname, "../api/_data/lifeprint-index.json");

const YT_KEY = process.env.YT_KEY;
const MAX_SECONDS = Number(process.env.MAX_SECONDS || "10");
const BATCH_BUDGET = Number(process.env.BATCH_BUDGET || "120"); // 120 * 50 ids = 6000 ids

if (!YT_KEY) {
  console.error("Missing YT_KEY env.");
  process.exit(1);
}

function isoToSeconds(iso) {
  // PT#H#M#S
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const h = Number(m[1] || 0);
  const mn = Number(m[2] || 0);
  const s = Number(m[3] || 0);
  return h * 3600 + mn * 60 + s;
}

async function enrich() {
  const list = JSON.parse(fs.readFileSync(IN_FILE, "utf8"));
  const byId = new Map(list.map((x) => [x.videoId, x]));
  const ids = list.map((x) => x.videoId);

  let remaining = [...ids];
  let batches = 0;

  while (remaining.length && batches < BATCH_BUDGET) {
    const chunk = remaining.splice(0, 50);
    batches++;

    const url =
      "https://www.googleapis.com/youtube/v3/videos" +
      `?part=contentDetails,snippet&id=${chunk.join(",")}&key=${YT_KEY}`;

    const r = await fetch(url);
    if (!r.ok) {
      console.error("YouTube fetch failed:", await r.text());
      break;
    }

    const j = await r.json();
    (j.items || []).forEach((it) => {
      const id = it.id;
      const secs = isoToSeconds(it.contentDetails?.duration || "PT0S");
      const ytTitle = it.snippet?.title || "";

      const rec = byId.get(id);
      if (rec) {
        rec.durationSec = secs;
        // preserve Lifeprint term/title; store ytTitle separately if you want
        rec.ytTitle = ytTitle;
      }
    });

    process.stdout.write(
      `  • videos.list for ${chunk.length} ids (batches left ${BATCH_BUDGET - batches})\r`
    );
  }
  process.stdout.write("\n");

  // drop anything longer than MAX_SECONDS
  const filtered = list.filter(
    (x) => typeof x.durationSec === "number" && x.durationSec <= MAX_SECONDS
  );

  // prefer having a usable search term
  filtered.forEach((x) => {
    if (!x.term && !x.title && x.ytTitle) {
      // fallback: try to salvage a keyword from ytTitle
      x.title = x.ytTitle.split(/[–\-|]/)[0].trim();
    }
  });

  fs.writeFileSync(OUT_FILE, JSON.stringify(filtered, null, 2));
  fs.mkdirSync(path.dirname(OUT_API), { recursive: true });
  fs.writeFileSync(OUT_API, JSON.stringify(filtered, null, 2));

  console.log(
    `Duration enrichment done. Filtered to <= ${MAX_SECONDS}s: ${filtered.length} items remain.`
  );
  console.log(
    `Wrote lifeprint-index.json to:\n - ${OUT_FILE}\n - ${OUT_API}`
  );
}

await enrich();
