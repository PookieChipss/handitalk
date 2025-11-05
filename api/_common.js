// /api/_common.js
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// ---- service account ----
function getServiceAccount() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  try { return JSON.parse(json); } catch { return null; }
}

let _app;
function getAdmin() {
  if (!_app) {
    const sa = getServiceAccount();
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(sa || {})
      });
    }
    _app = admin;
  }
  return _app;
}

function db() { return getAdmin().firestore(); }
function auth() { return getAdmin().auth(); }

// ---- smtp transport with timeouts ----
function getTransport() {
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const from = process.env.FROM_EMAIL || user || 'no-reply@example.com';
  if (!user || !pass) return { transport: null, from }; // dev mode: no email

  const base = {
    auth: { user, pass },
    connectionTimeout: 10000,  // 10s
    socketTimeout: 10000,      // 10s
    greetingTimeout: 10000     // 10s
  };

  if (process.env.SMTP_HOST) {
    return {
      from,
      transport: nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || 'false') === 'true',
        ...base
      })
    };
  }
  return { from, transport: nodemailer.createTransport({ service: 'gmail', ...base }) };
}

// race against a timer so we never hang forever
async function sendMailSafe(transport, mail) {
  if (!transport) return { ok: true, dev: true };
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('smtp_timeout')), 12000));
  return Promise.race([transport.sendMail(mail), timeout]);
}

// ---- helpers ----
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const genOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const OTP_TTL_MS = 10 * 60 * 1000;

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

async function withHandler(req, res, fn) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  try {
    await fn();
  } catch (e) {
    console.error('Function error:', e);
    res.status(500).json({ error: 'server_error', message: String(e?.message || e) });
  }
}

module.exports = {
  db, auth,
  getTransport, sendMailSafe,
  genOtp, sha, OTP_TTL_MS,
  withHandler
};
