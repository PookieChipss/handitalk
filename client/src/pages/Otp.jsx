import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { requestSignupOtp as requestOtp, verifySignupOtp } from "@/lib/api";

import {
  getAuth,
  signOut,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import "@/styles/auth-login.css";
import aslLogin from "@/assets/asllogin.png";

/* Icons (same visual language) */
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

export default function Otp() {
  const nav = useNavigate();
  const { state } = useLocation();

  // Fallback to sessionStorage if user refreshed the OTP page
  const fromStore = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem("pendingSignup") || "{}");
    } catch {
      return {};
    }
  }, []);

  // data passed from SignUp (or recovered from storage)
  const email = state?.email || fromStore.email || "";
  const password = state?.password || fromStore.password || ""; // server uses this to finalize signup
  const name = state?.name || fromStore.name || "";

  // OTP state (we’ll use 6 visual boxes but keep a single string)
  const [otp, setOtp] = useState("");
  const boxes = 6;
  const otpRefs = useRef(Array.from({ length: boxes }, () => null));

  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErr, setFieldErr] = useState({ otp: "" });

  const auth = useMemo(() => getAuth(), []);
  const db = useMemo(() => getFirestore(), []);

  useEffect(() => {
    if (!email) setErr("Missing email. Please start from Sign up.");
    // focus first box on load
    setTimeout(() => {
      const el = otpRefs.current?.[0];
      if (el) el.focus();
    }, 60);
  }, [email]);

  // ── OTP helpers (boxes) ──
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
    const v = e.target.value.replace(/\D/g, "").slice(0,1);
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

  // ── Actions ──
  const onVerify = async (e) => {
    e.preventDefault();
    if (loading) return;
    setErr("");
    setOk("");

    if (!email) {
      setErr("Missing email. Please start from Sign up.");
      return;
    }
    if (!/^\d{6}$/.test(otp.trim())) {
      setFieldErr((s) => ({ ...s, otp: "Enter the 6-digit code." }));
      return;
    }
    setFieldErr((s) => ({ ...s, otp: "" }));

    setLoading(true);
    try {
      // 1) Finalize account on the server (creates the Firebase user on backend)
      await verifySignupOtp(email, otp.trim(), password);

      // 2) Silently sign in just to set displayName + create a profile doc
      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, email, password);
      } catch (signInErr) {
        throw signInErr;
      }

      const user = cred.user;

      // 3) Update Auth profile with the chosen name
      const safeName = (name && name.trim()) || (email ? email.split("@")[0] : "there");
      try { await updateProfile(user, { displayName: safeName }); } catch {}

      // 4) Create/merge a Firestore profile document
      try {
        await setDoc(
          doc(db, "users", user.uid),
          { uid: user.uid, displayName: safeName, email: user.email, createdAt: serverTimestamp() },
          { merge: true }
        );
      } catch {}

      // 5) Sign out to keep "no auto-login" onboarding
      try { await signOut(auth); } catch {}

      // Cleanup temp storage
      sessionStorage.removeItem("pendingSignup");

      setOk("Account created. Please sign in.");
      nav("/login", { replace: true, state: { email, justSignedUp: true, name: safeName } });
    } catch (eObj) {
      let msg = eObj?.message || "Verification failed";
      if (msg === "invalid_otp" || msg === "invalid_or_expired") msg = "Invalid or expired code.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  const onResend = async (e) => {
    e.preventDefault();
    if (!email || loading) return;
    setErr("");
    setOk("");
    setLoading(true);
    try {
      await requestOtp(email);
      setOk("New code sent. Check your inbox.");
      // reset OTP boxes
      setOtp("");
      requestAnimationFrame(() => {
        otpRefs.current.forEach((el) => { if (el) el.value = ""; });
        focusBox(0);
      });
    } catch (eObj) {
      setErr(eObj?.message || "Failed to resend code");
    } finally {
      setLoading(false);
    }
  };

  // Pad OTP for displaying verified/entered digits in boxes
  const otpDigits = otp.padEnd(boxes, "").slice(0, boxes).split("");

  return (
    <div className="login-page">
      <h1 className="brand-big">HandiTalk</h1>

      <div className="login-shell">
        <img className="login-hero" src={aslLogin} alt="ASL illustration" />

        <div className="heading">
          <h2 className="login-title">Verify your email</h2>
          <p className="login-sub">
            We sent a 6-digit code to <b>{email || "your email"}</b>.
          </p>
        </div>

        {ok && <div className="login-msg ok">{ok}</div>}
        {err && <div className="login-msg err">{err}</div>}

        {/* Email (read-only) */}
        <label className="field">
          <span className="icon"><MailIcon /></span>
          <input type="email" value={email} readOnly />
        </label>

        {/* OTP input (6 boxes) */}
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
                  aria-invalid={!!fieldErr.otp}
                />
              </div>
            ))}
          </div>
          {fieldErr.otp && <div className="field-error">{fieldErr.otp}</div>}
        </div>

        <form className="login-form" onSubmit={onVerify} noValidate>
          <button className="primary" disabled={loading || otp.trim().length !== boxes || !email}>
            {loading ? "Verifying…" : "Verify & create account"}
          </button>
        </form>

        <div className="links" style={{ marginTop: 12 }}>
          <a href="#" onClick={onResend}>Resend code</a>
          <span className="dot">•</span>
          <Link to="/signup" replace>Back to sign up</Link>
        </div>
      </div>
    </div>
  );
}
