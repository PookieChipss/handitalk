// api/_adminCore.js  (CommonJS, Vercel serverless)

// ── Admin SDK bootstrap (singleton) ──────────────────────────────────────────
const admin = require("firebase-admin");

function safeParse(json) {
  try { return JSON.parse(json || "{}"); } catch { return {}; }
}

function normalizeKey(creds) {
  if (creds && typeof creds.private_key === "string") {
    creds.private_key = creds.private_key.replace(/\\n/g, "\n");
  }
  return creds;
}

function resolveServiceAccount() {
  const aRaw = process.env.ADMIN_SA_JSON || "";
  const fRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "";

  const a = aRaw ? normalizeKey(safeParse(aRaw)) : null;
  const f = fRaw ? normalizeKey(safeParse(fRaw)) : null;

  // If both exist, enforce same project
  if (a && f) {
    const ap = a.project_id || "";
    const fp = f.project_id || "";
    if (ap && fp && ap !== fp) {
      const err = new Error(
        `env_project_mismatch: ADMIN_SA_JSON.project_id=${ap} != FIREBASE_SERVICE_ACCOUNT_JSON.project_id=${fp}`
      );
      err.status = 500;
      throw err;
    }
  }

  // Prefer ADMIN_SA_JSON, else fallback to FIREBASE_SERVICE_ACCOUNT_JSON
  const chosen = a || f;
  if (!chosen || !chosen.project_id || !chosen.client_email || !chosen.private_key) {
    const err = new Error(
      "service_account_missing: Provide ADMIN_SA_JSON or FIREBASE_SERVICE_ACCOUNT_JSON with project_id, client_email, private_key."
    );
    err.status = 500;
    throw err;
  }
  return chosen;
}

function initAdmin() {
  if (admin.apps.length) return admin;
  const creds = resolveServiceAccount();
  admin.initializeApp({ credential: admin.credential.cert(creds) });
  return admin;
}

const adm = initAdmin();
const auth = adm.auth();
const fdb = adm.firestore();
const FieldValue = admin.firestore.FieldValue;

// ── CORS helper ─────────────────────────────────────────────────────────────
function applyCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true; // handled
  }
  return false;
}

// ── Admin check ─────────────────────────────────────────────────────────────
// 1) allowlist via VITE_ADMIN_UIDS / VITE_ADMIN_EMAILS
// 2) Firestore: users/{uid}.roles.admin === true
async function requireAdmin(req) {
  const authz = req.headers["authorization"] || req.headers["Authorization"];
  if (!authz || !/^Bearer\s+/i.test(authz)) {
    const err = new Error("missing_token");
    err.status = 401;
    throw err;
  }

  const idToken = authz.replace(/^Bearer\s+/i, "").trim();
  if (!idToken) {
    const err = new Error("missing_token");
    err.status = 401;
    throw err;
  }

  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken);
  } catch (e) {
    const code = e?.errorInfo?.code || e?.code || "verify_error";
    const msg  = e?.errorInfo?.message || e?.message || "verify_failed";
    const err = new Error(`invalid_token:${code}:${msg}`);
    err.status = 401;
    throw err;
  }

  // Diagnostic enforcement: token project must match service account project
  const chosen = resolveServiceAccount();
  const saProject = chosen.project_id || "";
  const tokenAud  = decoded.aud || ""; // Firebase ID token 'aud' is the project id/number
  if (saProject && tokenAud && saProject !== tokenAud) {
    const err = new Error(`project_mismatch: service=${saProject} token.aud=${tokenAud}`);
    err.status = 401;
    throw err;
  }

  const uid = decoded.uid;
  const email = (decoded.email || "").toLowerCase();

  const allowUids = String(process.env.VITE_ADMIN_UIDS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  const allowEmails = String(process.env.VITE_ADMIN_EMAILS || "")
    .toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);

  if (allowUids.includes(uid) || allowEmails.includes(email)) {
    return { uid, email };
  }

  // Firestore role fallback
  try {
    const snap = await fdb.collection("users").doc(uid).get();
    if (snap.exists) {
      const d = snap.data() || {};
      if (d?.roles?.admin === true) {
        return { uid, email };
      }
    }
  } catch (_) {}

  const err = new Error("not_admin");
  err.status = 403;
  throw err;
}

// ── Response helpers ────────────────────────────────────────────────────────
function sendJson(res, code, obj) {
  res.status(code).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

module.exports = {
  admin: adm,
  auth,
  fdb,
  FieldValue,
  applyCors,
  requireAdmin,
  sendJson,
};
