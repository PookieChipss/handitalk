// api/requestResetOtp.js
// Forgot password — generate and email a reset OTP (10 min TTL)

const crypto = require("crypto");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

// ---------- tiny helpers ----------
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const genOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const TTL_MS = (Number(process.env.OTP_EXP_MIN || 10) * 60 * 1000);

// CORS
function cors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  return false;
}

// Firebase Admin (safe JSON parse)
function initAdmin() {
  if (!admin.apps.length) {
    let sa = {};
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "";
      sa = raw ? JSON.parse(raw) : {};
    } catch (_) {
      // keep sa as {}
    }
    try {
      admin.initializeApp({ credential: admin.credential.cert(sa) });
    } catch (_) {
      // if already initialized or creds empty, ignore
    }
  }
  return { auth: admin.auth(), db: admin.firestore() };
}

// Nodemailer transport with 12s timeout race
function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) return null; // allows dev to run without email
  if (SMTP_HOST) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: String(SMTP_SECURE || "false") === "true",
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 10000, socketTimeout: 10000, greetingTimeout: 10000
    });
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000, socketTimeout: 10000, greetingTimeout: 10000
  });
}

async function sendMailSafe(to, subject, html) {
  const transport = getTransport();
  if (!transport) return { ok: true, dev: true }; // no SMTP configured: pretend OK

  const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
  const mail = {
    from, to, subject, html,
    text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  };

  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("smtp_timeout")), 12000));
  return Promise.race([transport.sendMail(mail), timeout]);
}

// ---------- handler ----------
module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "email required" });

    const { auth, db } = initAdmin();

    // Do not leak whether user exists
    const user = await auth.getUserByEmail(email).catch(() => null);
    if (!user) return res.json({ ok: true });

    // create OTP & store
    const code = genOtp();
    await db.collection("password_resets").doc(user.uid).set({
      codeHash: sha(code),
      email,
      exp: Date.now() + TTL_MS,
      createdAt: Date.now()
    }, { merge: true });

    const appName = process.env.APP_NAME || "HandiTalk";
    const html = `
      <div style="font-family:Arial,sans-serif">
        <h3>${appName} Password Reset</h3>
        <p>Your verification code is
          <b style="font-size:20px;letter-spacing:3px">${code}</b></p>
        <p>This code expires in ${Math.round(TTL_MS/60000)} minutes.</p>
      </div>`;

    try {
      await sendMailSafe(email, `${appName} • Password reset code`, html);
    } catch (e) {
      console.error("email error:", e);
      return res.status(500).json({ error: "email_failed" });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("requestResetOtp error:", e);
    res.status(500).json({ error: "server_error" });
  }
};
