#!/usr/bin/env python3
"""
Extract a local Lifeprint index from an HTML page source into lifeprint-index.json.

Usage:
  python make_index.py --in view-page-source.com-www.lifeprint.com_.html --out client/public/lifeprint-index.json
  # or just:
  python make_index.py --in path/to/file.html

If bs4 (BeautifulSoup) is installed, we'll use it.
If not, we fall back to a regex-only parser.
"""

import argparse, json, os, re, sys, html

# ---------- helpers ----------
YOUTUBE_EMBED_RE = re.compile(r"/embed//?([A-Za-z0-9_-]{6,})", re.IGNORECASE)

def extract_video_id(href: str) -> str | None:
    if not href:
        return None
    m = YOUTUBE_EMBED_RE.search(href)
    return m.group(1) if m else None

def clean_label(label: str) -> str:
    if not label:
        return ""
    s = html.unescape(label).strip()

    # Drop obvious junky prefixes like "0242 book mp4" -> "0242 book mp4" (we'll trim "mp4" later)
    # Keep numbers if they look meaningful (years), so only do light cleaning:
    s = re.sub(r"\s*\b(mp4|version|ver|v\w*)\b\s*$", "", s, flags=re.IGNORECASE).strip()
    # Normalize whitespace
    s = re.sub(r"\s+", " ", s).strip()
    return s

def parse_with_bs4(html_text: str):
    try:
        from bs4 import BeautifulSoup  # optional dep
    except Exception:
        return None

    soup = BeautifulSoup(html_text, "html.parser")
    ul = soup.find("ul", id="myUL")
    if not ul:
        return None
    items = []
    for a in ul.find_all("a", href=True):
        label = clean_label(a.get_text() or "")
        vid = extract_video_id(a["href"])
        if vid and label:
            items.append((label, vid))
    return items

def parse_with_regex(html_text: str):
    # very simple fallback: find anchors inside the #myUL block
    items = []
    # Try to isolate the UL to reduce noise
    m = re.search(r'<ul[^>]*id=["\']myUL["\'][^>]*>(.*?)</ul>', html_text, flags=re.IGNORECASE | re.DOTALL)
    block = m.group(1) if m else html_text

    # Find anchors
    for ahref, inner in re.findall(r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', block, flags=re.IGNORECASE | re.DOTALL):
        label = clean_label(re.sub(r"<[^>]+>", "", inner))  # strip tags inside
        vid = extract_video_id(ahref)
        if vid and label:
            items.append((label, vid))
    return items

def build_index(html_text: str):
    items = parse_with_bs4(html_text)
    if items is None:
        items = parse_with_regex(html_text)

    # Deduplicate: keep shortest label per videoId (labels can repeat)
    by_vid = {}
    for label, vid in items:
        keep = by_vid.get(vid)
        if keep is None or len(label) < len(keep):
            by_vid[vid] = label

    # Turn into objects
    out = []
    for vid, label in by_vid.items():
        out.append({
            "title": label,          # shown to user (e.g., "book", "Hello")
            "videoId": vid,          # YouTube id
            "durationSec": None,     # unknown; left null (your UI handles null)
            "source": "Lifeprint"
        })
    # Sort by title for stable diffs
    out.sort(key=lambda x: x["title"].lower())
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="in_path", required=True, help="Path to Lifeprint page source HTML")
    ap.add_argument("--out", dest="out_path", help="Path to write JSON (e.g., client/public/lifeprint-index.json)")
    args = ap.parse_args()

    with open(args.in_path, "r", encoding="utf-8", errors="ignore") as f:
        html_text = f.read()

    index = build_index(html_text)
    print(f"[ok] extracted {len(index)} unique video mappings")

    if args.out_path:
        os.makedirs(os.path.dirname(args.out_path), exist_ok=True)
        with open(args.out_path, "w", encoding="utf-8") as f:
            json.dump(index, f, ensure_ascii=False, indent=2)
        print(f"[ok] wrote JSON → {args.out_path}")
    else:
        # preview first few
        print(json.dumps(index[:10], ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
