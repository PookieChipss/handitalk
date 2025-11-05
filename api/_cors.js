export function applyCors(req, res) {
  const allowList = (process.env.ALLOW_ORIGINS || "*")
    .split(",")
    .map(s => s.trim());

  const origin = req.headers.origin;
  const allowed = allowList.includes("*") ? "*" :
                  (allowList.includes(origin) ? origin : allowList[0] || "*");

  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  return false;
}
