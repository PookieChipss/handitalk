import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import "@/styles/auth-login.css";
import aslLogin from "@/assets/asllogin.png";

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
      <path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6S2 12 2 12z" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M4 20c1.6-3.5 5-6 8-6s6.4 2.5 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 10V8a4 4 0 118 0v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function Login() {
  const nav = useNavigate();
  const { state } = useLocation();
  const [email, setEmail] = useState(state?.email || "");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);

  // global success/error
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(state?.justSignedUp ? "Account created. Please sign in." : "");
  const [loading, setLoading] = useState(false);

  // per-field errors
  const [fieldErr, setFieldErr] = useState({ email: "", pass: "" });
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  useEffect(() => {
    if (state?.email) setEmail(state.email);
    if (state?.justSignedUp) setOk("Account created. Please sign in.");
  }, [state?.email, state?.justSignedUp]);

  const validate = () => {
    const e = email.trim();
    const p = pass;

    const next = { email: "", pass: "" };

    if (!e) next.email = "Please enter your email.";
    else if (!emailRe.test(e)) next.email = "Please enter a valid email address.";

    if (!p) next.pass = "Please enter your password.";

    setFieldErr(next);
    // valid if both empty strings
    return !next.email && !next.pass;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    setErr("");
    setOk("");

    // client-side guard to avoid Firebase errors like auth/invalid-email
    const okInputs = validate();
    if (!okInputs) return;

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      nav("/home", { replace: true });
    } catch (e) {
      console.error(e);
      let msg = e?.message || "Sign in failed";
      if (msg.includes("auth/invalid-credential")) msg = "Incorrect email or password.";
      if (msg.includes("auth/user-not-found")) msg = "No account for this email.";
      if (msg.includes("auth/wrong-password")) msg = "Incorrect password.";
      if (msg.includes("auth/too-many-requests")) msg = "Too many attempts. Try again later.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  // Validate on blur so users get quick feedback
  const onBlurEmail = () => {
    if (!email.trim()) setFieldErr((s) => ({ ...s, email: "Please enter your email." }));
    else if (!emailRe.test(email.trim()))
      setFieldErr((s) => ({ ...s, email: "Please enter a valid email address." }));
    else setFieldErr((s) => ({ ...s, email: "" }));
  };
  const onBlurPass = () => {
    if (!pass) setFieldErr((s) => ({ ...s, pass: "Please enter your password." }));
    else setFieldErr((s) => ({ ...s, pass: "" }));
  };

  return (
    <div className="login-page">
      <h1 className="brand-big">HandiTalk</h1>

      <div className="login-shell">
        <img className="login-hero" src={aslLogin} alt="ASL illustration" />

        <div className="heading">
          <h2 className="login-title">Login</h2>
          <p className="login-sub">Please sign in to continue.</p>
        </div>

        {ok && <div className="login-msg ok">{ok}</div>}
        {err && <div className="login-msg err">{err}</div>}

        <form className="login-form" onSubmit={onSubmit} noValidate>
          <label className={`field ${fieldErr.email ? "has-error" : ""}`}>
            <span className="icon"><UserIcon /></span>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={onBlurEmail}
              autoComplete="email"
              aria-invalid={!!fieldErr.email}
              aria-describedby={fieldErr.email ? "email-error" : undefined}
              required
            />
          </label>
          {fieldErr.email && (
            <div id="email-error" className="field-error">{fieldErr.email}</div>
          )}

          <label className={`field ${fieldErr.pass ? "has-error" : ""}`}>
            <span className="icon"><LockIcon /></span>
            <input
              type={showPass ? "text" : "password"}
              placeholder="Password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onBlur={onBlurPass}
              autoComplete="current-password"
              aria-invalid={!!fieldErr.pass}
              aria-describedby={fieldErr.pass ? "pass-error" : undefined}
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
          {fieldErr.pass && (
            <div id="pass-error" className="field-error">{fieldErr.pass}</div>
          )}

          <button className="primary" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="links">
          <a
            href="/reset-password"
            onClick={(e) => { e.preventDefault(); nav("/reset-password"); }}
          >
            Forgot your password?
          </a>
          <span className="dot">•</span>
          <Link to="/signup">Create new account</Link>
        </div>
      </div>
    </div>
  );
}
