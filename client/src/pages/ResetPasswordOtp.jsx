import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { requestResetOtp, checkResetOtp, verifyResetOtp } from "@/lib/api";
import { auth } from "@/lib/firebase";
import { fetchSignInMethodsForEmail } from "firebase/auth";
import "@/styles/auth-login.css";
import aslLogin from "@/assets/asllogin.png";

/* ── icons ── */
function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
      <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2"/>
      <path d="M8 10V8a4 4 0 118 0v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
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

export default function ResetPassword() {
  const nav = useNavigate();
  const loc = useLocation();
  const emailFromState = loc.state?.email || "";

  const [email, setEmail] = useState(emailFromState);
  const [otp, setOtp] = useState(""); // combined 6 digits
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");

  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // Steps: 1=email, 2=verify code, 3=set password
  const [step, setStep] = useState(emailFromState ? 2 : 1);

  // per-field errors for red borders + hints
  const [fieldErr, setFieldErr] = useState({ email: "", otp: "", pass: "", pass2: "" });
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ── OTP input refs for 6 boxes ──
  const boxes = 6;
  const otpRefs = useRef(Array.from({ length: boxes }, () => null));

  useEffect(() => {
    if (emailFromState) setEmail(emailFromState);
  }, [emailFromState]);

  const focusBox = (i) => {
    const el = otpRefs.current[i];
    if (el) el.focus();
  };

  const setDigit = (i, val) => {
    let digits = (otp + "").padEnd(boxes, " ").split("");
    digits[i] = val;
    const joined = digits.join("").replace(/\s+/g, "");
    setOtp(joined);
  };

  const handleBoxChange = (i) => (e) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 1);
    e.target.value = v;
    if (!v) {
      setDigit(i, "");
      return;
    }
    setDigit(i, v);
    if (i < boxes - 1) focusBox(i + 1);
  };

  const handleBoxKeyDown = (i) => (e) => {
    if (e.key === "Backspace" || e.key === "Delete") {
      if (!e.currentTarget.value && i > 0) focusBox(i - 1);
      setDigit(i, "");
    } else if (e.key === "ArrowLeft" && i > 0) {
      focusBox(i - 1);
    } else if (e.key === "ArrowRight" && i < boxes - 1) {
      focusBox(i + 1);
    }
  };

  const handleBoxPaste = (e) => {
    const text = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, boxes);
    if (!text) return;
    e.preventDefault();
    setOtp(text);
    requestAnimationFrame(() => {
      for (let i = 0; i < boxes; i++) {
        const el = otpRefs.current[i];
        if (el) el.value = text[i] || "";
      }
      const last = Math.min(text.length, boxes) - 1;
      focusBox(last >= 0 ? last : 0);
    });
  };

  // ── validation helpers ──
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
    try {
      const methods = await fetchSignInMethodsForEmail(auth, e);
      if (!methods || methods.length === 0) {
        setFieldErr((s) => ({ ...s, email: "No account found for this email." }));
        return false;
      }
    } catch {
      setFieldErr((s) => ({ ...s, email: "Please enter a valid email address." }));
      return false;
    }
    setFieldErr((s) => ({ ...s, email: "" }));
    return true;
  };

  const validateOtpLocal = () => {
    if (!/^\d{6}$/.test(otp.trim())) {
      setFieldErr((s) => ({ ...s, otp: "Enter the 6-digit code." }));
      return false;
    }
    setFieldErr((s) => ({ ...s, otp: "" }));
    return true;
  };

  const validatePasswords = () => {
    let ok = true;
    const next = { pass: "", pass2: "" };
    if (!pass || pass.length < 6) {
      next.pass = "Password must be at least 6 characters.";
      ok = false;
    }
    if (pass2 !== pass) {
      next.pass2 = "Passwords do not match.";
      ok = false;
    }
    setFieldErr((s) => ({ ...s, ...next }));
    return ok;
  };

  // ── actions ──
  async function onSendOtp(e) {
    e.preventDefault();
    if (loading) return;
    setErr(""); setMsg("");
    setLoading(true);

    const okEmail = await validateEmail();
    if (!okEmail) { setLoading(false); return; }

    try {
      await requestResetOtp(email.trim());  // backend should also re-check existence
      setMsg("Code sent. Check your email.");
      setStep(2);
      setTimeout(() => focusBox(0), 50);
    } catch (eObj) {
      let m = eObj?.message || "Failed to send code.";
      if (/not\s*found/i.test(m)) m = "No account found for this email.";
      setErr(m);
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(e) {
    e.preventDefault();
    if (loading) return;
    setErr(""); setMsg("");
    if (!validateOtpLocal()) return;

    setLoading(true);
    try {
      await checkResetOtp(email.trim(), otp.trim());
      setMsg("Code verified. You can set a new password.");
      setStep(3);
    } catch (eObj) {
      let m = eObj?.message || "Invalid or expired code.";
      if (/expired/i.test(m)) m = "Code expired. Please request a new one.";
      setErr(m);
    } finally {
      setLoading(false);
    }
  }

  async function onReset(e) {
    e.preventDefault();
    if (loading) return;
    setErr(""); setMsg("");
    if (!validatePasswords()) return;

    setLoading(true);
    try {
      await verifyResetOtp(email.trim(), otp.trim(), pass);
      setMsg("Password updated. You can now log in.");
      nav("/login", { replace: true });
    } catch (eObj) {
      setErr(eObj?.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  }

  const onBlurEmail = () => { void validateEmail(); };
  const onBlurOtp = () => { void validateOtpLocal(); };

  // derive an array of digits for rendering (pads to 6)
  const otpDigits = otp.padEnd(boxes, "").slice(0, boxes).split("");

  return (
    <div className="login-page">
      <h1 className="brand-big">HandiTalk</h1>

      <div className="login-shell">
        <img className="login-hero" src={aslLogin} alt="ASL illustration" />

        <div className="heading">
          <h2 className="login-title">Reset password</h2>
          <p className="login-sub">
            {step === 1 ? "We’ll email you a 6-digit code." :
             step === 2 ? "Enter the 6-digit code we sent to your email." :
             "Set your new password."}
          </p>
        </div>

        {msg && <div className="login-msg ok">{msg}</div>}
        {err && <div className="login-msg err">{err}</div>}

        {/* Step 1: request code */}
        {step === 1 && (
          <form className="login-form" onSubmit={onSendOtp} noValidate>
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
                aria-describedby={fieldErr.email ? "rp-email-err" : undefined}
                required
              />
            </label>
            {fieldErr.email && <div id="rp-email-err" className="field-error">{fieldErr.email}</div>}

            <button className="primary" disabled={loading}>
              {loading ? "Sending…" : "Send OTP"}
            </button>
          </form>
        )}

        {/* Step 2: verify code */}
        {step === 2 && (
          <form className="login-form" onSubmit={onVerify} noValidate>
            <label className="field">
              <span className="icon"><MailIcon /></span>
              <input type="email" value={email} readOnly />
            </label>

            <div className="otp-wrap">
              <span className="otp-label"><CodeIcon /> <span>Enter code</span></span>
              <div className="otp-grid" onPaste={handleBoxPaste}>
                {Array.from({ length: boxes }).map((_, i) => (
                  <div className={`otp-cell ${fieldErr.otp ? "has-error" : ""}`} key={i}>
                    <input
                      ref={(el) => (otpRefs.current[i] = el)}
                      className="otp-input"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      defaultValue={otpDigits[i] || ""}
                      onChange={handleBoxChange(i)}
                      onKeyDown={handleBoxKeyDown(i)}
                      onBlur={onBlurOtp}
                      aria-invalid={!!fieldErr.otp}
                    />
                  </div>
                ))}
              </div>
              {fieldErr.otp && <div className="field-error">{fieldErr.otp}</div>}
            </div>

            <button className="primary" disabled={loading || otp.trim().length !== boxes}>
              {loading ? "Verifying…" : "Verify code"}
            </button>
          </form>
        )}

        {/* Step 3: set new password */}
        {step === 3 && (
          <form className="login-form" onSubmit={onReset} noValidate>
            <label className="field">
              <span className="icon"><MailIcon /></span>
              <input type="email" value={email} readOnly />
            </label>

            <div className="otp-wrap">
              <span className="otp-label"><CodeIcon /> <span>Verified code</span></span>
              <div className="otp-grid">
                {otpDigits.map((d, i) => (
                  <div className="otp-cell readonly" key={i}>
                    <span className="otp-digit">{d || "•"}</span>
                  </div>
                ))}
              </div>
            </div>

            <label className={`field ${fieldErr.pass ? "has-error" : ""}`}>
              <span className="icon"><LockIcon /></span>
              <input
                type={show1 ? "text" : "password"}
                placeholder="New password (min 6)"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                onBlur={() => {
                  if (!pass || pass.length < 6)
                    setFieldErr((s) => ({ ...s, pass: "Password must be at least 6 characters." }));
                  else setFieldErr((s) => ({ ...s, pass: "" }));
                }}
                minLength={6}
                aria-invalid={!!fieldErr.pass}
                aria-describedby={fieldErr.pass ? "rp-pass-err" : undefined}
                required
              />
              <button
                type="button"
                className="reveal"
                onClick={() => setShow1(s => !s)}
                aria-label={show1 ? "Hide password" : "Show password"}
                title={show1 ? "Hide password" : "Show password"}
              >
                <Eye off={show1} />
              </button>
            </label>
            {fieldErr.pass && <div id="rp-pass-err" className="field-error">{fieldErr.pass}</div>}

            <label className={`field ${fieldErr.pass2 ? "has-error" : ""}`}>
              <span className="icon"><LockIcon /></span>
              <input
                type={show2 ? "text" : "password"}
                placeholder="Confirm password"
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                onBlur={() => {
                  if (pass2 !== pass)
                    setFieldErr((s) => ({ ...s, pass2: "Passwords do not match." }));
                  else setFieldErr((s) => ({ ...s, pass2: "" }));
                }}
                minLength={6}
                aria-invalid={!!fieldErr.pass2}
                aria-describedby={fieldErr.pass2 ? "rp-pass2-err" : undefined}
                required
              />
              <button
                type="button"
                className="reveal"
                onClick={() => setShow2(s => !s)}
                aria-label={show2 ? "Hide password" : "Show password"}
                title={show2 ? "Hide password" : "Show password"}
              >
                <Eye off={show2} />
              </button>
            </label>
            {fieldErr.pass2 && <div id="rp-pass2-err" className="field-error">{fieldErr.pass2}</div>}

            <button className="primary" disabled={loading}>
              {loading ? "Updating…" : "Reset password"}
            </button>
          </form>
        )}

        <div className="links" style={{ marginTop: 16 }}>
          <Link to="/login">Back to login</Link>
        </div>
      </div>
    </div>
  );
}
