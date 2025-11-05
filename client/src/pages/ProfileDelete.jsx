// ProfileDelete.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "@/styles/profile.css";

import {
  getAuth,
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
} from "firebase/auth";

export default function ProfileDelete() {
  const nav = useNavigate();
  const [guard, setGuard] = useState("");
  const [pwd, setPwd] = useState("");
  const [show, setShow] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const can = guard.trim().toUpperCase() === "DELETE" && pwd.length >= 6;

  function mapErr(e) {
    const msg = e?.message || "";
    if (msg.includes("auth/invalid-credential")) return "Incorrect password.";
    if (msg.includes("auth/missing-password")) return "Please enter your password.";
    if (msg.includes("auth/requires-recent-login")) {
      return "Please sign in again and retry.";
    }
    if (msg.includes("auth/user-not-found")) return "Account not found.";
    if (msg.includes("auth/network-request-failed")) return "Network error. Try again.";
    return "Failed to delete account.";
  }

  async function onDelete() {
    if (!can || busy) return;
    setBusy(true);
    setErr("");
    setOk("");

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user || !user.email) {
        setErr("No signed-in user.");
        setBusy(false);
        return;
      }

      // 1) Reauthenticate with password
      const cred = EmailAuthProvider.credential(user.email, pwd);
      await reauthenticateWithCredential(user, cred);

      // 2) Delete only the Auth account (no Firestore cleanup)
      await deleteUser(user);

      // 3) Inline success + gentle redirect
      setOk("Your account has been deleted.");
      setTimeout(() => {
        // User is already signed out after deleteUser; just send to login
        nav("/login", { replace: true });
      }, 900);
    } catch (e) {
      console.error(e);
      setErr(mapErr(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prof-page">
      <header className="prof-top">
        <button className="prof-back" onClick={() => nav(-1)} aria-label="Back">←</button>
        <div className="prof-title">Delete account</div>
        <span className="prof-spacer" />
      </header>

      <main className="prof-main narrow">
        <div className="panel">
          {/* Inline banners (no window.alert) */}
          {err && (
            <div style={{
              color:"#b91c1c", background:"#fee2e2",
              padding:"8px 10px", borderRadius:10, fontWeight:700, marginBottom:10
            }}>
              {err}
            </div>
          )}
          {ok && (
            <div style={{
              color:"#065f46", background:"#d1fae5",
              padding:"8px 10px", borderRadius:10, fontWeight:700, marginBottom:10
            }}>
              {ok}
            </div>
          )}

          <h1 className="big">Wait, don’t go!</h1>
          <p className="msg" style={{marginTop:6}}>
            Deleting your account removes your sign-in permanently. Type <b>DELETE</b> and enter your password to confirm.
          </p>

          <label className="field">
            <span>Security field</span>
            <input
              value={guard}
              onChange={(e)=>setGuard(e.target.value)}
              placeholder="Type DELETE to confirm"
              disabled={busy}
            />
          </label>

          <label className="field">
            <span>Current password</span>
            <div className="pwd">
              <input
                type={show ? "text" : "password"}
                value={pwd}
                onChange={(e)=>setPwd(e.target.value)}
                placeholder="••••••"
                disabled={busy}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="eye"
                aria-label={show ? "Hide password" : "Show password"}
                onClick={() => setShow(s=>!s)}
                disabled={busy}
                style={{ all: "unset", cursor: "pointer" }}
              >
                {show ? "🙈" : "👁️"}
              </button>
            </div>
          </label>

          <div className="row-actions">
            <button className="prof-btn" onClick={()=>nav(-1)} disabled={busy}>Cancel</button>
            <button
              className="prof-btn danger"
              disabled={!can || busy}
              onClick={onDelete}
            >
              {busy ? "Deleting…" : "Delete your account"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
