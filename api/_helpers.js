// api/_helpers.js
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const genOtp = () => String(Math.floor(100000 + Math.random() * 900000));

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function ok(handler) {
  return async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    try {
      await handler(req, res);
    } catch (e) {
      console.error("API error:", e);
      res.status(500).json({ error: "server_error" });
    }
  };
}

function makeTransport() {
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  if (!user || !pass) return null; // dev: no email
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: { user, pass },
    });
  }
  return nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
}

const mailer = makeTransport();
const FROM_EMAIL =
  process.env.FROM_EMAIL || process.env.SMTP_USER || "no-reply@example.com";

async function sendMail(to, subject, text) {
  if (!mailer) {
    console.log(`[DEV] Email to ${to} :: ${subject} :: ${text}`);
    return;
  }
  await mailer.sendMail({ from: FROM_EMAIL, to, subject, text });
}

module.exports = { OTP_TTL_MS, sha, genOtp, ok, sendMail };
