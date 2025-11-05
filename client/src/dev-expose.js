// Expose YouTube key + a helper fetch ONLY in dev.
// Remove this file or its import once you're done debugging.

if (import.meta.env.DEV) {
  const YT_KEY = import.meta.env.VITE_YT_KEY;

  // Make the key visible for quick console tests
  window.__YT_KEY__ = YT_KEY;

  // Convenience helper: call YouTube Data API v3 from the console
  window.__ytFetch__ = (query) => {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("key", YT_KEY);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("videoEmbeddable", "true");
    url.searchParams.set("maxResults", "5");
    // bias toward ASL results:
    url.searchParams.set("q", `${query} ASL sign`);

    return fetch(url.toString()).then((r) => r.json());
  };

  console.info(
    "[dev] Exposed window.__YT_KEY__ and window.__ytFetch__(q) for testing."
  );
}
