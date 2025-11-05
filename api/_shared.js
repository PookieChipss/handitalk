const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function sha(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function genOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

// ----- Firebase Admin (service account from env) -----
const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!sa) {
  console.warn("FIREBASE_SERVICE_ACCOUNT_JSON not set");
}

if (!admin.apps.length && sa) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(sa))
  });
}
const db = admin.firestore();

// ----- Mailer -----
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const FROM_EMAIL =
  process.env.FROM_EMAIL || SMTP_USER || "no-reply@example.com";

let transporter = null;
if (SMTP_USER && SMTP_PASS) {
  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
  } else {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
  }
} else {
  console.log("[DEV] SMTP creds missing, OTP will be logged in functions logs.");
}

// ----- HTTP helpers -----
function onlyPost(handler) {
  return async (req, res) => {
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    try {
      await handler(req, res);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "server_error" });
    }
  };
}

const OTP_TTL_MS = 10 * 60 * 1000;

module.exports = {
  admin,
  db,
  transporter,
  FROM_EMAIL,
  sha,
  genOtp,
  parseBody,
  onlyPost,
  OTP_TTL_MS
};
