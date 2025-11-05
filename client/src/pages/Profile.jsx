import { Link, useNavigate } from "react-router-dom";
import "@/styles/profile.css";
import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const LS_KIDMODE = "app.childmode";

export default function Profile() {
  const nav = useNavigate();

  const [name, setName] = useState("User");
  const [showLogout, setShowLogout] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    try {
      const auth = getAuth();
      const db = getFirestore();
      unsub = onAuthStateChanged(auth, async (user) => {
        if (!user) { setName("User"); return; }
        let n = user.displayName?.trim();
        if (!n) {
          try {
            const ref = doc(db, "users", user.uid);
            const snap = await getDoc(ref);
            if (snap.exists()) {
              const d = snap.data();
              n = d.displayName?.trim() || d.name?.trim();
            }
          } catch {}
        }
        if (!n) n = user.email?.split("@")[0] || "User";
        setName(n.charAt(0).toUpperCase() + n.slice(1));
      });
    } catch { setName("User"); }

    const onName = (e) => { if (typeof e.detail === "string") setName(e.detail); };
    window.addEventListener("app:displayName", onName);
    return () => {
      unsub && unsub();
      window.removeEventListener("app:displayName", onName);
    };
  }, []);

  // ---- Child mode ----------------------------------------------------------
  const [kid, setKid] = useState(localStorage.getItem(LS_KIDMODE) === "1");

  // reflect initial state on mount and whenever it changes
  useEffect(() => {
    document.body.dataset.childmode = kid ? "1" : "0";
  }, [kid]);

  // quick toast (still used for blocked actions)
  const [toastMsg, setToastMsg] = useState("");
  const showToast = (msg, ms = 1600) => {
    setToastMsg(msg);
    window.clearTimeout((showToast._t || 0));
    showToast._t = window.setTimeout(() => setToastMsg(""), ms);
  };

  // small “ding”
  const playDing = (high = true) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = high ? 880 : 520;
      o.type = "sine";
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.20);
      o.start(); o.stop(ctx.currentTime + 0.22);
    } catch {}
  };

  // little animation pill when toggled
  const [modeAnim, setModeAnim] = useState(""); // "", "on", or "off"

  const toggleKid = () => {
    const next = !kid;
    setKid(next);
    localStorage.setItem(LS_KIDMODE, next ? "1" : "0");
    window.dispatchEvent(new CustomEvent("app:childmode", { detail: next }));

    // notify
    setModeAnim(next ? "on" : "off");
    playDing(next);
    window.clearTimeout((toggleKid._t || 0));
    toggleKid._t = window.setTimeout(() => setModeAnim(""), 1200);
  };

  // if blocked, show a tiny toast
  const onBlocked = (e) => {
    e.preventDefault();
    showToast("Turn off Child mode to use this.");
  };

  const profTitle = `${name}${name.endsWith("s") ? "’" : "’s"} Profile`;

  async function doLogout() {
    try { await signOut(getAuth()); } catch {}
    setShowLogout(false);
    nav("/login", { replace: true });
  }

  return (
    <div className="prof-page">
      <header className="prof-top">
        <button className="prof-back" onClick={() => nav(-1)} aria-label="Back">←</button>
        <div className="prof-title">{profTitle}</div>
        <span className="prof-spacer" />
      </header>

      <section className="prof-hero">
        <img
          className="prof-gif"
          src="/img/profile-hero.gif"
          alt=""
          aria-hidden
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      </section>

      <main className="prof-main">
        {/* child-mode banner */}
        {kid && (
          <div className="prof-banner">
            <span className="b-emoji" aria-hidden>🧒</span>
            <div className="b-text">
              <b>Child mode is ON.</b> Account settings are locked.
            </div>
          </div>
        )}

        <h2 className="prof-h2">Account</h2>

        <Link
          className={`prof-row ${kid ? "blocked" : ""}`}
          to="/profile/edit"
          onClick={kid ? onBlocked : undefined}
          aria-disabled={kid}
          tabIndex={kid ? -1 : 0}
        >
          <div className="ico">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M3.5 20.5a8.5 8.5 0 0 1 17 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="body"><div className="t">Edit personal data</div></div>
          <div className="chev">
            <span className="chev-bg">{kid ? "🔒" : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M8 5l8 7-8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}</span>
          </div>
        </Link>

        <Link
          className={`prof-row ${kid ? "blocked" : ""}`}
          to="/profile/password"
          onClick={kid ? onBlocked : undefined}
          aria-disabled={kid}
          tabIndex={kid ? -1 : 0}
        >
          <div className="ico">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="4" y="11" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6"/>
            </svg>
          </div>
          <div className="body"><div className="t">Change password</div></div>
          <div className="chev">
            <span className="chev-bg">{kid ? "🔒" : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M8 5l8 7-8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}</span>
          </div>
        </Link>

        <h2 className="prof-h2">System</h2>

        <Link
          className={`prof-row ${kid ? "blocked" : ""}`}
          to="/profile/reset"
          onClick={kid ? onBlocked : undefined}
          aria-disabled={kid}
          tabIndex={kid ? -1 : 0}
        >
          <div className="ico">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 4v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20 20v-6h-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20 10A8 8 0 0 0 6 6M4 14a8 8 0 0 0 14 4" stroke="currentColor" strokeWidth="1.6"/>
            </svg>
          </div>
          <div className="body"><div className="t">Reset all progress</div></div>
          <div className="chev">
            <span className="chev-bg">{kid ? "🔒" : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M8 5l8 7-8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}</span>
          </div>
        </Link>

        <div className="prof-row">
          <div className="ico">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M2.5 20a6 6 0 0 1 11 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <rect x="15" y="12" width="7" height="7" rx="1.8" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M18.5 12v-1a2 2 0 0 1 4 0v1" stroke="currentColor" strokeWidth="1.6"/>
            </svg>
          </div>
          <div className="body"><div className="t">Child mode</div></div>
          <button
            className={`switch ${kid ? "on" : ""}`}
            onClick={toggleKid}
            aria-pressed={kid}
            aria-label="Toggle child mode"
          ><i /></button>
        </div>

        {/* Actions */}
        <button className="prof-btn primary" onClick={() => setShowLogout(true)}>
          Log Out
        </button>

        <Link className="prof-btn danger-outline" to="/profile/delete">
          Delete Account
        </Link>

        {toastMsg && <div className="toast">{toastMsg}</div>}
      </main>

      {/* Toggle animation pill */}
      {modeAnim && (
        <div className={`mode-anim ${modeAnim === "on" ? "on" : "off"}`} role="status" aria-live="polite">
          <span aria-hidden>{modeAnim === "on" ? "🧒" : "🔓"}</span>
          {modeAnim === "on" ? "Child mode enabled" : "Child mode disabled"}
          <span className="spark" aria-hidden>✨</span>
        </div>
      )}

      {/* Logout sheet */}
      {showLogout && (
        <div role="dialog" aria-modal="true"
          style={{
            position:"fixed", inset:0, background:"rgba(15,23,42,.45)",
            display:"grid", placeItems:"center", zIndex:50
          }}>
          <div style={{
            width:"92%", maxWidth:420, background:"#fff", borderRadius:16,
            padding:16, boxShadow:"0 20px 50px rgba(0,0,0,.25)"
          }}>
            <div style={{fontWeight:900, marginBottom:6}}>Log out</div>
            <div style={{color:"#475569", marginBottom:12}}>Log out from this device?</div>
            <div style={{display:"flex", gap:10, justifyContent:"flex-end"}}>
              <button className="prof-btn" onClick={()=>setShowLogout(false)}>Cancel</button>
              <button className="prof-btn danger" onClick={doLogout}>Log Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
