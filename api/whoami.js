const { auth, applyCors, sendJson } = require("./_adminCore.js");

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });

  const h = req.headers.authorization || req.headers.Authorization;
  if (!h || !/^Bearer\s+/i.test(h)) return sendJson(res, 401, { error: "missing_token" });

  try {
    const decoded = await auth.verifyIdToken(h.replace(/^Bearer\s+/i, "").trim());
    let saProject = null;
    try {
      const sa = JSON.parse(process.env.ADMIN_SA_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}");
      saProject = sa.project_id || null;
    } catch {}
    return sendJson(res, 200, {
      uid: decoded.uid, email: decoded.email || null,
      aud: decoded.aud || null, iss: decoded.iss || null,
      sa_project: saProject
    });
  } catch (e) {
    return sendJson(res, 401, { error: `invalid_token:${e?.message || "verify_failed"}` });
  }
};
