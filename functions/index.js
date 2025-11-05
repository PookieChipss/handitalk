// functions/index.js
"use strict";

/* ────────────────────────── imports ────────────────────────── */
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

/* ────────────────── fetch helper (Node 18+ safe) ────────────── */
// Cloud Functions on Node 18+ has global fetch. Fallback to node-fetch if needed.
let fetchFn = globalThis.fetch;
if (!fetchFn) {
  // If this errors locally, run:  cd functions && npm i node-fetch
  fetchFn = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
}
const fetchJson = async (url) => {
  const r = await fetchFn(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
};
const dedupe = (arr) => {
  const seen = new Set();
  return arr.filter((x) => {
    const id = x?.url || x?.mp4 || x?.gif || x?.youtube || x?.caption;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

/* ─────────────── Admin init (works locally & on GCP) ────────── */
(function initAdmin() {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (raw) {
      const sa = JSON.parse(raw);
      if (sa.private_key && sa.private_key.includes("\\n")) {
        sa.private_key = sa.private_key.replace(/\\n/g, "\n");
      }
      admin.initializeApp({ credential: admin.credential.cert(sa) });
      console.log("[functions] Admin initialized with service account from env.");
    } else {
      admin.initializeApp(); // uses default credentials in GCP
      console.log("[functions] Admin initialized with default credentials.");
    }
  } catch (e) {
    console.error("[functions] Admin init failed:", e);
    throw e;
  }
})();
const db = admin.firestore();

/* ─────────────────────── Mail transport ─────────────────────── */
const SMTP_USER   = process.env.SMTP_USER   || "";
const SMTP_PASS   = process.env.SMTP_PASS   || "";
const SMTP_HOST   = process.env.SMTP_HOST   || "";
const SMTP_PORT   = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false") === "true";
const FROM_EMAIL  = process.env.FROM_EMAIL  || SMTP_USER || "no-reply@example.com";

function makeTransport() {
  if (!SMTP_USER || !SMTP_PASS) {
    console.log("[functions] SMTP creds not set; running in DEV email mode.");
    return null;
  }
  if (SMTP_HOST) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 10000,
      socketTimeout: 10000,
      greetingTimeout: 10000,
    });
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000,
    socketTimeout: 10000,
    greetingTimeout: 10000,
  });
}
const transporter = makeTransport();

/* ────────────────────────── Helpers ─────────────────────────── */
const REGION     = "asia-southeast1";
const OTP_TTL_MS = 10 * 60 * 1000;
const genOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const sha    = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const toEmail = (v) => String(v || "").trim().toLowerCase();

function cors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}
function ok(req, res, handler) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "POST only" });
  return Promise.resolve()
    .then(() => handler(req, res))
    .catch((e) => {
      console.error("[functions] Handler error:", e);
      res.status(500).json({ error: "server_error" });
    });
}

/* ────────────────────── Admin checker ───────────────────────── */

/**
 * Accept ANY of:
 *  1) Caller has custom claim { admin:true }
 *  2) Firestore: users/{callerUid}.roles.admin === true
 *  3) Runtime allowlists: ADMIN_UIDS / ADMIN_EMAILS (comma-separated)
 */
async function requireAdminFromContext(context) {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError("unauthenticated", "missing_token");
  }
  const callerUid = context.auth.uid;
  const callerEmail = (context.auth.token?.email || "").toLowerCase();

  // A) Custom claims
  try {
    const u = await admin.auth().getUser(callerUid);
    if (u.customClaims && u.customClaims.admin === true) {
      return { uid: callerUid, email: callerEmail };
    }
  } catch {}

  // B) Firestore role flag
  try {
    const snap = await db.doc(`users/${callerUid}`).get();
    if (snap.exists && (snap.data()?.roles?.admin === true)) {
      return { uid: callerUid, email: callerEmail };
    }
  } catch {}

  // C) Runtime allowlists
  const allowUids = (process.env.ADMIN_UIDS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const allowEmails = (process.env.ADMIN_EMAILS || "")
    .toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  if (allowUids.includes(callerUid) || allowEmails.includes(callerEmail)) {
    return { uid: callerUid, email: callerEmail };
  }

  throw new functions.https.HttpsError("permission-denied", "not_admin");
}

/* ───────────────────── OTP / Auth endpoints ─────────────────── */

// /requestOtp  -> store hashed code, email code (or log in dev)
exports.requestOtp = functions.region(REGION).https.onRequest((req, res) =>
  ok(req, res, async () => {
    const email = toEmail(req.body && req.body.email);
    if (!email) return res.status(400).json({ error: "email required" });

    const code = genOtp();
    const expiresAt = Date.now() + OTP_TTL_MS;

    await db.collection("pending_signups").doc(email).set({
      codeHash: sha(code),
      expiresAt,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      attempts: 0,
    });

    if (transporter) {
      try {
        await transporter.sendMail({
          from: FROM_EMAIL,
          to: email,
          subject: "HandiTalk verification code",
          text: `Your verification code is ${code}. It expires in 10 minutes.`,
        });
      } catch (err) {
        console.error("[functions] sendMail (requestOtp) failed:", err);
        return res.status(500).json({ error: "email_failed" });
      }
    } else {
      console.log(`[DEV ONLY] requestOtp → ${email} :: code=${code}`);
    }
    res.json({ ok: true });
  })
);

// /verifyOtp -> check code, create user
exports.verifyOtp = functions.region(REGION).https.onRequest((req, res) =>
  ok(req, res, async () => {
    const email    = toEmail(req.body && req.body.email);
    const otp      = String((req.body && req.body.otp) || "");
    const password = String((req.body && req.body.password) || "");
    if (!email || !otp || !password) return res.status(400).json({ error: "email, otp, password required" });
    if (password.length < 6)         return res.status(400).json({ error: "weak password" });

    const ref  = db.collection("pending_signups").doc(email);
    const snap = await ref.get();
    if (!snap.exists) return res.status(400).json({ error: "No OTP requested" });

    const data = snap.data() || {};
    if (Date.now() > data.expiresAt) {
      await ref.delete().catch(() => {});
      return res.status(400).json({ error: "OTP expired" });
    }
    if (sha(otp) !== data.codeHash) {
      await ref.update({ attempts: (data.attempts || 0) + 1 }).catch(() => {});
      return res.status(400).json({ error: "Invalid OTP" });
    }

    let user;
    try {
      user = await admin.auth().createUser({ email, password });
    } catch (e) {
      if (e?.errorInfo?.code === "auth/email-already-exists") {
        user = await admin.auth().getUserByEmail(email);
      } else {
        throw e;
      }
    }

    await ref.delete().catch(() => {});
    res.json({ ok: true, uid: user.uid });
  })
);

// /requestResetOtp -> email code (or log in dev)
exports.requestResetOtp = functions.region(REGION).https.onRequest((req, res) =>
  ok(req, res, async () => {
    const email = toEmail(req.body && req.body.email);
    if (!email) return res.status(400).json({ error: "email required" });

    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
    } catch {
      // don't leak account existence
      return res.json({ ok: true });
    }

    const code = genOtp();
    const expiresAt = Date.now() + OTP_TTL_MS;

    await db.collection("password_resets").doc(user.uid).set({
      email,
      codeHash: sha(code),
      expiresAt,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      attempts: 0,
    });

    if (transporter) {
      try {
        await transporter.sendMail({
          from: FROM_EMAIL,
          to: email,
          subject: "Your HandiTalk password reset code",
          text: `Your verification code is ${code}. It expires in 10 minutes.`,
        });
      } catch (err) {
        console.error("[functions] sendMail (requestResetOtp) failed:", err);
        return res.status(500).json({ error: "email_failed" });
      }
    } else {
      console.log(`[DEV ONLY] requestResetOtp → ${email} :: code=${code}`);
    }

    res.json({ ok: true });
  })
);

// /verifyResetOtp -> check code, set new password
exports.verifyResetOtp = functions.region(REGION).https.onRequest((req, res) =>
  ok(req, res, async () => {
    const email       = toEmail(req.body && req.body.email);
    const otp         = String((req.body && req.body.otp) || "");
    const newPassword = String((req.body && req.body.newPassword) || "");
    if (!email || !otp || !newPassword) return res.status(400).json({ error: "email, otp, newPassword required" });
    if (newPassword.length < 6)        return res.status(400).json({ error: "weak password" });

    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
    } catch {
      return res.status(400).json({ error: "invalid code" });
    }

    const ref  = db.collection("password_resets").doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) return res.status(400).json({ error: "invalid code" });

    const data = snap.data() || {};
    if (Date.now() > data.expiresAt) {
      await ref.delete().catch(() => {});
      return res.status(400).json({ error: "OTP expired" });
    }
    if (sha(otp) !== data.codeHash) {
      await ref.update({ attempts: (data.attempts || 0) + 1 }).catch(() => {});
      return res.status(400).json({ error: "Invalid OTP" });
    }

    await admin.auth().updateUser(user.uid, { password: newPassword });
    await ref.delete().catch(() => {});
    res.json({ ok: true });
  })
);

/* ──────────────── GET /signclips?q=<term> ───────────────── */

async function searchYouTube(query) {
  const key = process.env.YT_KEY;
  if (!key) return [];
  const u = new URL("https://www.googleapis.com/youtube/v3/search");
  u.searchParams.set("key", key);
  u.searchParams.set("part", "snippet");
  u.searchParams.set("type", "video");
  u.searchParams.set("videoEmbeddable", "true");
  u.searchParams.set("maxResults", "5");
  u.searchParams.set("q", `${query} ASL sign`);

  const j = await fetchJson(u.toString());
  return (j.items || [])
    .map((it) => {
      const id = it?.id?.videoId;
      if (!id) return null;
      const embed = `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`;
      return {
        kind: "youtube",
        url: embed,
        youtube: embed,
        provider: "YouTube",
        caption: it?.snippet?.title || query,
        thumb:
          it?.snippet?.thumbnails?.medium?.url ||
          it?.snippet?.thumbnails?.default?.url ||
          null,
      };
    })
    .filter(Boolean);
}
async function searchTenor(query, limit = 3) {
  const key = process.env.TENOR_KEY;
  if (!key) return [];
  const u = new URL("https://tenor.googleapis.com/v2/search");
  u.searchParams.set("key", key);
  u.searchParams.set("q", `ASL sign ${query}`);
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("media_filter", "gif,mp4,tinygif,tinymp4");
  u.searchParams.set("client_key", "handitalk");

  const j = await fetchJson(u.toString());
  return (j.results || []).map((r) => {
    const mf = r.media_formats || {};
    const mp4 = mf.tinymp4?.url || mf.mp4?.url || null;
    const gif = mf.tinygif?.url || mf.gif?.url || null;
    const thumb = mf.tinygif?.url || mf.gif?.url || mp4 || null;
    return {
      kind: mp4 ? "mp4" : "gif",
      url: mp4 || gif,
      mp4: mp4 || null,
      gif: gif || null,
      provider: "Tenor",
      caption: r.content_description || query,
      thumb,
    };
  });
}
async function searchGiphy(query, limit = 3) {
  const key = process.env.GIPHY_KEY;
  if (!key) return [];
  const u = new URL("https://api.giphy.com/v1/gifs/search");
  u.searchParams.set("api_key", key);
  u.searchParams.set("q", `ASL sign ${query}`);
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("rating", "g");

  const j = await fetchJson(u.toString());
  return (j.data || []).map((it) => {
    const img = it.images || {};
    const mp4 = img.preview_mp4?.mp4 || img.original_mp4?.mp4 || null;
    const gif = img.fixed_height_small?.url || img.original?.url || null;
    const thumb = img.fixed_height_small_still?.url || gif || mp4 || null;
    return {
      kind: mp4 ? "mp4" : "gif",
      url: mp4 || gif,
      mp4: mp4 || null,
      gif: gif || null,
      provider: "GIPHY",
      caption: it.title || query,
      thumb,
    };
  });
}

// Route
exports.signclips = functions.region(REGION).https.onRequest(async (req, res) => {
  // CORS
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "Missing q" });

  try {
    let clips = [];
    try { clips = clips.concat(await searchYouTube(q)); } catch (e) { console.error("YT", e); }
    try { clips = clips.concat(await searchTenor(q)); } catch (e) { console.error("Tenor", e); }
    try { clips = clips.concat(await searchGiphy(q)); } catch (e) { console.error("GIPHY", e); }

    clips = dedupe(clips);
    return res.status(200).json({ clips });
  } catch (err) {
    console.error("signclips error:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

/* ─────────────── Admin claims & user mirror ────────────── */

// 1) Mirror Auth users into Firestore /users/{uid}
exports.onAuthCreate = functions.region(REGION).auth.user().onCreate(async (user) => {
  const { uid, email, displayName, photoURL } = user;
  try {
    await db.doc(`users/${uid}`).set({
      uid,
      email: email || null,
      displayName: (displayName && displayName.trim()) || "User",
      photoURL: photoURL || null,
      roles: { admin: Boolean(user.customClaims?.admin) }, // mirror claim if present
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log("[onAuthCreate] mirrored:", uid, email);
  } catch (e) {
    console.error("[onAuthCreate] failed:", uid, e);
    throw e;
  }
});

// 2) Callable to grant/revoke admin (must be called by an admin)
exports.setAdmin = functions.region(REGION).https.onCall(async (data, context) => {
  await requireAdminFromContext(context);

  const { uid, makeAdmin } = data || {};
  if (!uid || typeof makeAdmin !== "boolean") {
    throw new functions.https.HttpsError("invalid-argument", "Need { uid, makeAdmin:boolean }");
  }

  await admin.auth().setCustomUserClaims(uid, { admin: makeAdmin });
  await db.doc(`users/${uid}`).set({
    roles: { admin: makeAdmin },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log("[setAdmin] uid:", uid, "admin:", makeAdmin);
  return { ok: true, uid, admin: makeAdmin };
});

// 3) ONE-TIME HTTP to set the FIRST admin; call once then delete
exports.bootstrapSetAdmin = functions.region(REGION).https.onRequest(async (req, res) => {
  const token = req.get("x-bootstrap-token");
  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN || "";
  if (!expected || token !== expected) return res.status(403).send("Forbidden");

  const { email } = req.query; // ?email=youremail@domain.com
  if (!email) return res.status(400).send("Missing ?email");
  let user;
  try {
    user = await admin.auth().getUserByEmail(String(email).trim().toLowerCase());
  } catch {
    return res.status(404).send("User not found");
  }

  await admin.auth().setCustomUserClaims(user.uid, { admin: true });
  await db.doc(`users/${user.uid}`).set({
    roles: { admin: true },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log("[bootstrapSetAdmin] admin granted to:", user.uid, email);
  res.json({ ok: true, uid: user.uid, email: user.email });
});

// 4) Backfill existing Auth users into Firestore /users
exports.adminSyncAuthUsers = functions.region(REGION).https.onCall(async (data, context) => {
  await requireAdminFromContext(context);

  let created = 0;
  let nextPageToken = undefined;
  do {
    const result = await admin.auth().listUsers(1000, nextPageToken);
    for (const u of result.users) {
      const ref = db.doc(`users/${u.uid}`);
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set({
          uid: u.uid,
          email: u.email || null,
          displayName: (u.displayName && u.displayName.trim()) || "User",
          photoURL: u.photoURL || null,
          roles: { admin: Boolean(u.customClaims?.admin) },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        created++;
      }
    }
    nextPageToken = result.pageToken;
  } while (nextPageToken);

  console.log("[adminSyncAuthUsers] created:", created);
  return { ok: true, created };
});

// 5) Admin: update user's displayName/email in Auth + Firestore
exports.adminUpdateUser = functions.region(REGION).https.onCall(async (data, context) => {
  await requireAdminFromContext(context);

  const { uid, displayName, email } = data || {};
  if (!uid) throw new functions.https.HttpsError("invalid-argument", "uid required");

  await admin.auth().updateUser(uid, {
    ...(displayName != null ? { displayName } : {}),
    ...(email != null ? { email } : {}),
  });

  await db.doc(`users/${uid}`).set(
    {
      ...(displayName != null ? { displayName } : {}),
      ...(email != null ? { email } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log("[adminUpdateUser] updated:", uid);
  return { ok: true };
});

// 6) Admin: delete user from Auth and Firestore (blocks deleting admins)
exports.adminDeleteUser = functions.region(REGION).https.onCall(async (data, context) => {
  await requireAdminFromContext(context);

  const { uid } = data || {};
  if (!uid) throw new functions.https.HttpsError("invalid-argument", "uid required");

  // Prevent deleting admin accounts
  try {
    const snap = await db.doc(`users/${uid}`).get();
    const d = snap.exists ? (snap.data() || {}) : {};
    if (d?.roles?.admin === true) {
      throw new functions.https.HttpsError("failed-precondition", "cannot_delete_admin");
    }
  } catch (e) {
    if (e instanceof functions.https.HttpsError) throw e;
    // If Firestore read fails, be safe and refuse delete
    throw new functions.https.HttpsError("failed-precondition", "cannot_delete_admin");
  }

  // Delete from Auth (ignore not-found)
  await admin.auth().deleteUser(uid).catch((e) => {
    if (e?.code !== "auth/user-not-found") throw e;
  });

  // Remove Firestore user doc (best-effort)
  await db.doc(`users/${uid}`).delete().catch(() => {});

  console.log("[adminDeleteUser] deleted:", uid);
  return { ok: true };
});
