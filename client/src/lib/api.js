// client/src/lib/api.js

// ------------------------------- BASE URL -------------------------------
// You can override with VITE_API_BASE. Examples:
//   VITE_API_BASE="https://otp-server-xxx.vercel.app"
//   VITE_API_BASE="https://otp-server-xxx.vercel.app/api"
//   VITE_API_BASE="/api"               (use Vite proxy in dev)
// If not provided, dev -> "/api", prod -> your deployed OTP server.
const RAW_ENV_BASE = (import.meta.env.VITE_API_BASE || "").trim().replace(/\/+$/, "");

// Default production host for your OTP server (update if you redeploy to a new URL)
const DEFAULT_PROD_HOST =
  "https://otp-server-fxq1bvfof-harvindsevams-projects.vercel.app";

// Compute the base (may be absolute or relative)
let API_BASE = RAW_ENV_BASE
  ? RAW_ENV_BASE
  : (import.meta.env.PROD ? DEFAULT_PROD_HOST : "/api");

// If absolute URL and missing `/api`, append it.
// (When using the Vite proxy we *want* just "/api".)
if (/^https?:\/\//i.test(API_BASE) && !/\/api$/i.test(API_BASE)) {
  API_BASE += "/api";
}

if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.log("[api] API_BASE =", API_BASE);
}

// ------------------------------ FETCH CORE ------------------------------
const DEFAULT_TIMEOUT_MS = 15000;

function makeApiError(res, data, fallbackMsg) {
  const err = new Error(
    // prefer explicit backend code; fall back to message/error; then generic
    data?.code || data?.message || data?.error || fallbackMsg || "request_failed"
  );
  err.name = "ApiError";
  err.status = res?.status ?? 0;
  err.payload = data ?? null;
  // keep code separately for easier matching
  err.code = data?.code || data?.error || null;
  return err;
}

async function request(path, { method = "POST", body, timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const url = `${API_BASE}${path}`;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  let res, text;
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    text = await res.text();
  } finally {
    clearTimeout(id);
  }

  // Parse JSON if possible, otherwise return raw text in { error }
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { error: text || "non-json-response" }; }

  if (!res.ok) {
    throw makeApiError(res, data, `Request failed: ${res.status}`);
  }
  return data;
}

const post = (path, body, opts) => request(path, { method: "POST", body, ...(opts || {}) });
const get  = (path, opts)        => request(path, { method: "GET",  ...(opts || {}) });

// ------------------------------ PUBLIC API ------------------------------

// Health check (optional, useful for diagnostics)
export const health = () => get("/health");

/* ------------------------- EMAIL AVAILABILITY -------------------------- */
/**
 * Ask the server if an email is available to register.
 * Expected response: { available: boolean }
 * Backend should check Firebase Auth & Firestore and return available:false when user exists.
 */
export const checkEmailAvailability = (email) =>
  post("/check-email", { email });

/* ------------------------- SIGNUP (email + OTP) ------------------------- */
/**
 * Request signup OTP. Frontend should only call this after:
 *  - checkEmailAvailability(email) -> { available: true }
 *  - local Auth/Firestore checks (optional)
 * Server should return { ok: true } on success, or { ok:false, code: ... } with 4xx/5xx status.
 */
export const requestSignupOtp = (email) =>
  post("/requestOtp", { email });

export const verifySignupOtp  = (email, otp, password) =>
  post("/verifyOtp", { email, otp, password });

// Back-compat names (old imports still work)
export const requestOtp = requestSignupOtp;
export const verifyOtp  = verifySignupOtp;

/* ---------------------- PASSWORD RESET (2-step flow) --------------------- */
// Step 0: send code to email
export const requestResetOtp = (email) =>
  post("/requestResetOtp", { email });

// Step 1: verify code only (no password change yet)
export const checkResetOtp = (email, otp) =>
  post("/verifyResetOtp", { email, otp, checkOnly: true });

// Step 2: set new password after successful verification
export const verifyResetOtp = (email, otp, newPassword) =>
  post("/verifyResetOtp", { email, otp, newPassword });

/* ----------------------------- DEFAULT EXPORT ---------------------------- */
export default {
  health,
  checkEmailAvailability,
  requestSignupOtp,
  verifySignupOtp,
  requestOtp,
  verifyOtp,
  requestResetOtp,
  checkResetOtp,
  verifyResetOtp,
};
