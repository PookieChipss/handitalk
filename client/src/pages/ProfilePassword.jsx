import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "@/styles/profile.css";

import {
  getAuth,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";

export default function ProfilePassword() {
  const nav = useNavigate();

  const [cur, setCur] = useState("");
  const [n1,  setN1]  = useState("");
  const [n2,  setN2]  = useState("");

  const [showCur, setShowCur] = useState(false);
  const [showN1,  setShowN1]  = useState(false);
  const [showN2,  setShowN2]  = useState(false);

  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");
  const [ok,   setOk]   = useState("");

  const can = cur.length >= 6 && n1.length >= 6 && n1 === n2;

  async function onChange() {
    if (!can || busy) return;
    setErr(""); setOk(""); setBusy(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("Not signed in");

      // reauthenticate with current password
      const cred = EmailAuthProvider.credential(user.email || "", cur);
      await reauthenticateWithCredential(user, cred);

      await updatePassword(user, n1);
      setOk("Password changed.");
      setTimeout(() => nav(-1), 500);
    } catch (e) {
      let msg = e?.message || "Failed to change password.";
      if (msg.includes("auth/wrong-password")) msg = "Incorrect current password.";
      if (msg.includes("auth/weak-password")) msg = "Choose a stronger password (min 6 chars).";
      if (msg.includes("auth/too-many-requests")) msg = "Too many attempts, try again later.";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prof-page">
      <header className="prof-top">
        <button className="prof-back" onClick={() => nav(-1)} aria-label="Back">←</button>
        <div className="prof-title">Change password</div>
        <span className="prof-spacer" />
      </header>

      <main className="prof-main narrow">
        <div className="panel">
          {err && <div className="auth-error" style={{color:"#b91c1c", background:"#fee2e2", padding:"8px 10px", borderRadius:10, fontWeight:700}}>{err}</div>}
          {ok  && <div className="auth-success" style={{color:"#065f46", background:"#d1fae5", padding:"8px 10px", borderRadius:10, fontWeight:700}}>{ok}</div>}

          <label className="field">
            <span>Current password</span>
            <div className="pwd">
              <input
                type={showCur ? "text" : "password"}
                value={cur}
                onChange={(e)=>setCur(e.target.value)}
                placeholder="••••••"
                autoComplete="current-password"
              />
              <button type="button" className="eye" onClick={()=>setShowCur(s=>!s)}>
                {showCur ? "🙈" : "👁️"}
              </button>
            </div>
          </label>

          <label className="field">
            <span>New password</span>
            <div className="pwd">
              <input
                type={showN1 ? "text" : "password"}
                value={n1}
                onChange={(e)=>setN1(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
              <button type="button" className="eye" onClick={()=>setShowN1(s=>!s)}>
                {showN1 ? "🙈" : "👁️"}
              </button>
            </div>
          </label>

          <label className="field">
            <span>Confirm new password</span>
            <div className="pwd">
              <input
                type={showN2 ? "text" : "password"}
                value={n2}
                onChange={(e)=>setN2(e.target.value)}
                placeholder="Repeat password"
                autoComplete="new-password"
              />
              <button type="button" className="eye" onClick={()=>setShowN2(s=>!s)}>
                {showN2 ? "🙈" : "👁️"}
              </button>
            </div>
          </label>

          <button className="prof-btn primary" disabled={!can || busy} onClick={onChange}>
            {busy ? "Changing…" : "Change password"}
          </button>
        </div>
      </main>
    </div>
  );
}
