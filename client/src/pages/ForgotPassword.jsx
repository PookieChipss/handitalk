import { useState } from "react";
import { Link } from "react-router-dom";
import { requestResetOtp, verifyResetOtp } from "@/lib/api";
import { auth } from "@/lib/firebase";
import { fetchSignInMethodsForEmail } from "firebase/auth";
import "@/styles/auth-login.css";
import aslLogin from "@/assets/asllogin.png";

/* inline icons */
function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
      <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2"/>
      <path d="M8 10V8a4 4 0 118 0v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
function CodeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M7 8l-4 4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M17 8l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 19l4-14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
function Eye({ off = false }) {
  if (off) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M10.5 6.2A9.9 9.9 0 0112 6c5.2 0 8.9 3.8 10 6-0.33.64-1 1.74-2.13 2.87M5.6 7.6C4.05 8.8 3 10.2 2 12c1.07 1.96 3.3 4.57 6.72 5.58" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M14.12 9.88A3 3 0 009 15m6-3a3 3 0 00-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6S2 12 2 12z" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPass, setNewPass] = useState("");
  const [showPass, setShowPass] = useState(false);

  const [stage, setStage] = useState("request"); // "request" | "verify"
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // per-field errors for red border + hint
  const [fieldErr, setFieldErr] = useState({ email: "", otp: "", pass: "" });
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateEmail = async () => {
    const e = email.trim();
    if (!e) {
      setFieldErr((s) => ({ ...s, email: "Please enter your email." }));
      return false;
    }
    if (!emailRe.test(e)) {
      setFieldErr((s) => ({ ...s, email: "Please enter a valid email address." }));
      return false;
    }
    // Check if account exists in Firebase
    try {
      const methods = await fetchSignInMethodsForEmail(auth, e);
      if (!methods || methods.length === 0) {
        setFieldErr((s) => ({ ...s, email: "No account found for this email." }));
        return false;
      }
    } catch {
      // If Firebase throws for malformed emails etc., treat as invalid
      setFieldErr((s) => ({ ...s, email: "Please enter a valid email address." }));
      return false;
    }
    setFieldErr((s) => ({ ...s, email: "" }));
    return true;
  };

  const requestCode = async (e) => {
    e.preventDefault();
    setErr(""); setMsg("");
    if (loading) return;

    // client-side checks first
    setLoading(true);
    const okEmail = await validateEmail();
    if (!okEmail) { setLoading(false); return; }

    try {
      await requestResetOtp(email.trim()); // your backend should also reject unknown emails
      setStage("verify");
      setMsg("Code sent. Check your email.");
    } catch (eObj) {
      let m = eObj?.message || "Couldn't send code.";
      // normalize a couple of likely backend messages
      if (/not\s*found/i.test(m)) m = "No account found for this email.";
      setErr(m);
    } finally {
      setLoading(false);
    }
  };

  const validateVerify = () => {
    let ok = true;
    const next = { email: "", otp: "", pass: "" };

    if (!/^\d{6}$/.test(otp.trim())) {
      next.otp = "Enter the 6-digit code.";
      ok = false;
    }
    if (!newPass || newPass.length < 6) {
      next.pass = "Password must be at least 6 characters.";
      ok = false;
    }
    setFieldErr((s) => ({ ...s, ...next }));
    return ok;
  };

  const submitNewPassword = async (e) => {
    e.preventDefault();
    setErr(""); setMsg("");
    if (loading) return;

    if (!validateVerify()) return;

    setLoading(true);
    try {
      await verifyResetOtp(email.trim(), otp.trim(), newPass);
      setMsg("Password updated. You can sign in now.");
    } catch (eObj) {
      let m = eObj?.message || "Verification failed.";
      if (/expired/i.test(m)) m = "Code expired. Please request a new one.";
      if (/invalid/i.test(m)) m = "The code you entered is incorrect.";
      setErr(m);
    } finally {
      setLoading(false);
    }
  };

  const onBlurEmail = () => { void validateEmail(); };
  const onBlurOtp = () => {
    if (!/^\d{6}$/.test(otp.trim()))
      setFieldErr((s) => ({ ...s, otp: "Enter the 6-digit code." }));
    else setFieldErr((s) => ({ ...s, otp: "" }));
  };
  const onBlurPass = () => {
    if (!newPass || newPass.length < 6)
      setFieldErr((s) => ({ ...s, pass: "Password must be at least 6 characters." }));
    else setFieldErr((s) => ({ ...s, pass: "" }));
  };

  return (
    <div className="login-page">
      <h1 className="brand-big">HandiTalk</h1>

      <div className="login-shell">
        <img className="login-hero" src={aslLogin} alt="ASL illustration" />

        <div className="heading">
          <h2 className="login-title">Reset password</h2>
          <p className="login-sub">
            {stage === "request" ? "Enter the 6-digit code we sent to your email." : "Enter code and your new password."}
          </p>
        </div>

        {msg && <div className="login-msg ok">{msg}</div>}
        {err && <div className="login-msg err">{err}</div>}

        {stage === "request" ? (
          <form className="login-form" onSubmit={requestCode} noValidate>
            <label className={`field ${fieldErr.email ? "has-error" : ""}`}>
              <span className="icon"><MailIcon /></span>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={onBlurEmail}
                autoComplete="email"
                aria-invalid={!!fieldErr.email}
                aria-describedby={fieldErr.email ? "fp-email-err" : undefined}
                required
              />
            </label>
            {fieldErr.email && <div id="fp-email-err" className="field-error">{fieldErr.email}</div>}

            <button className="primary" disabled={loading}>
              {loading ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form className="login-form" onSubmit={submitNewPassword} noValidate>
            <label className={`field ${fieldErr.otp ? "has-error" : ""}`}>
              <span className="icon"><CodeIcon /></span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="6-digit code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                onBlur={onBlurOtp}
                aria-invalid={!!fieldErr.otp}
                aria-describedby={fieldErr.otp ? "fp-otp-err" : undefined}
                required
              />
            </label>
            {fieldErr.otp && <div id="fp-otp-err" className="field-error">{fieldErr.otp}</div>}

            <label className={`field ${fieldErr.pass ? "has-error" : ""}`}>
              <span className="icon"><LockIcon /></span>
              <input
                type={showPass ? "text" : "password"}
                placeholder="New password (min 6)"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                onBlur={onBlurPass}
                minLength={6}
                aria-invalid={!!fieldErr.pass}
                aria-describedby={fieldErr.pass ? "fp-pass-err" : undefined}
                required
              />
              <button
                type="button"
                className="reveal"
                onClick={() => setShowPass((s) => !s)}
                aria-label={showPass ? "Hide password" : "Show password"}
                title={showPass ? "Hide password" : "Show password"}
              >
                <Eye off={showPass} />
              </button>
            </label>
            {fieldErr.pass && <div id="fp-pass-err" className="field-error">{fieldErr.pass}</div>}

            <button className="primary" disabled={loading}>
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>
        )}

        <div className="links">
          <Link to="/login">Back to login</Link>
        </div>
      </div>
    </div>
  );
}
