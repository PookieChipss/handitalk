// client/src/auth/Signup.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { requestSignupOtp as requestOtp } from "@/lib/api"; // calls /requestOtp
import { auth } from "@/lib/firebase";
import { fetchSignInMethodsForEmail } from "firebase/auth";
import "@/styles/auth-login.css";
import aslLogin from "@/assets/asllogin.png";

/* inline icons (same style as login page) */
function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4 20c1.6-3.5 5-6 8-6s6.4 2.5 8 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4 7l8 6 8-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
function Eye({ off = false }) {
  if (off) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M10.5 6.2A9.9 9.9 0 0112 6c5.2 0 8.9 3.8 10 6-0.33.64-1 1.74-2.13 2.87M5.6 7.6C4.05 8.8 3 10.2 2 12c1.07 1.96 3.3 4.57 6.72 5.58"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M14.12 9.88A3 3 0 009 15m6-3a3 3 0 00-3-3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
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

/** Strong password rule:
 * - at least 9 characters
 * - includes lowercase, uppercase, number, and special character
 */
const STRONG_PW_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{9,}$/;

// Returns a single line status like the example image
function getPwStatus(pw) {
  if (!pw) return { show: false };

  if (pw.length < 9) {
    return {
      show: true,
      ok: false,
      tone: "weak",
      text: "Weak. Must contain at least 9 characters",
      emoji: "⚠️",
    };
  }

  const lacksUpper = !/[A-Z]/.test(pw);
  const lacksLower = !/[a-z]/.test(pw);
  const lacksNum = !/\d/.test(pw);
  const lacksSpec = !/[^\w\s]/.test(pw);

  if (lacksUpper || lacksLower) {
    return {
      show: true,
      ok: false,
      tone: "warn",
      text: "So-so. Must contain at least 1 uppercase and 1 lowercase letter",
      emoji: "🟡",
    };
  }
  if (lacksNum) {
    return {
      show: true,
      ok: false,
      tone: "warn",
      text: "Almost. Must contain a number",
      emoji: "🟡",
    };
  }
  if (lacksSpec) {
    return {
      show: true,
      ok: false,
      tone: "warn",
      text: "Almost. Must contain a special symbol",
      emoji: "🟡",
    };
  }
  return {
    show: true,
    ok: true,
    tone: "ok",
    text: "Awesome! You have a secure password",
    emoji: "✅",
  };
}

export default function SignUp() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const pwStatus = getPwStatus(pass);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    setErr("");

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setErr("Please enter your full name.");
      return;
    }
    // basic email shape check (Firebase will also validate)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
      setErr("Please enter a valid email address.");
      return;
    }

    // Strong password validation
    if (!STRONG_PW_REGEX.test(pass)) {
      setErr(
        "Password must be at least 9 characters and include an uppercase letter, a lowercase letter, a number, and a special character."
      );
      return;
    }

    setLoading(true);
    try {
      // 1) Check if email already exists in Firebase
      const methods = await fetchSignInMethodsForEmail(auth, trimmedEmail);

      if (methods && methods.length > 0) {
        setErr("An account with this email already exists. Please log in.");
        return; // do NOT request OTP
      }

      // 2) Not registered → proceed with OTP request
      localStorage.setItem("pendingDisplayName", trimmedName);
      await requestOtp(trimmedEmail);

      nav("/otp", {
        replace: true,
        state: { email: trimmedEmail, password: pass, name: trimmedName },
      });
    } catch (e) {
      let msg = e?.message || "Failed to send OTP";
      if (msg === "email_failed") msg = "Couldn’t send email. Try again.";
      if (msg.includes("auth/invalid-email")) msg = "Please enter a valid email address.";
      if (msg.includes("auth/network-request-failed"))
        msg = "Network error. Check your connection and try again.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  // small inline styles so you don't need to change your CSS file
  const pwLineStyle = {
    fontSize: "0.85rem",
    marginTop: "6px",
    marginBottom: "8px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  };
  const toneColor =
    pwStatus.tone === "ok" ? "#148f3a" : pwStatus.tone === "warn" ? "#b07d00" : "#b00020";
  const borderTone =
    pwStatus.tone === "ok" ? "#37c26e" : pwStatus.tone === "warn" ? "#f2c14e" : "#ff8a80";

  return (
    <div className="login-page">
      <h1 className="brand-big">HandiTalk</h1>

      <div className="login-shell">
        <img className="login-hero" src={aslLogin} alt="ASL illustration" />

        <div className="heading">
          <h2 className="login-title">Register</h2>
          <p className="login-sub">Create your HandiTalk account.</p>
        </div>

        {err && <div className="login-msg err">{err}</div>}

        <form className="login-form" onSubmit={onSubmit} noValidate>
          <label className="field">
            <span className="icon">
              <UserIcon />
            </span>
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>

          <label className="field">
            <span className="icon">
              <MailIcon />
            </span>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="field" style={{ marginBottom: 0 }}>
            <span className="icon">
              <LockIcon />
            </span>
            <input
              type={showPass ? "text" : "password"}
              placeholder="Password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete="new-password"
              minLength={9}
              pattern="^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{9,}$"
              title="At least 9 characters, including uppercase, lowercase, number, and special character."
              required
              style={
                pwStatus.show
                  ? {
                      borderColor: borderTone,
                      outline: "none",
                    }
                  : undefined
              }
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

          {/* Dynamic one-line status like your second image */}
          {pwStatus.show && (
            <div
              role="status"
              aria-live="polite"
              style={{ ...pwLineStyle, color: toneColor }}
            >
              <span style={{ fontSize: "1rem", lineHeight: 1 }}>{pwStatus.emoji}</span>
              <span>{pwStatus.text}</span>
            </div>
          )}

          <button className="primary" disabled={loading}>
            {loading ? "Checking…" : "Sign up"}
          </button>
        </form>

        <div className="links">
          <a
            href="/login"
            onClick={(e) => {
              e.preventDefault();
              nav("/login");
            }}
          >
            Already have an account? Log in
          </a>
        </div>
      </div>
    </div>
  );
}
