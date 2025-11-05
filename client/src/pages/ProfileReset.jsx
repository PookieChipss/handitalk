import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "@/styles/profile.css";

/* strongest safe local wipe for app progress only (keeps Firebase auth) */
async function resetAppProgress() {
  // 1) Local & Session Storage
  const LEARN_SLUGS = [
    "alphabet","numbers","phrases","emotions","greetings","foods"
  ];

  // keys to KEEP (Firebase auth/session & common SDK internals)
  const KEEP_PREFIXES = [
    "firebase:",                // firebase web auth user/session
    "FIREBASE_",                // some SDKs use caps
    "gapi.", "ga:",             // google api (if present)
  ];

  // Any key containing these hints is considered "progress-ish"
  const PROGRESS_HINTS = [
    "learn", "progress", "therapy", "quiz", "streak",
    "app.sound", "app.childmode", "lt.", "lp.", "ld."
  ];

  const shouldKeep = (k) => KEEP_PREFIXES.some(p => k.startsWith(p));

  const shouldRemove = (k) => {
    if (!k) return false;
    if (shouldKeep(k)) return false;
    const kl = k.toLowerCase();
    if (PROGRESS_HINTS.some(h => kl.includes(h))) return true;
    if (LEARN_SLUGS.some(s => kl.includes(s))) return true; // catch per-category keys
    return false;
  };

  for (const store of [localStorage, sessionStorage]) {
    const keys = [];
    for (let i = 0; i < store.length; i++) keys.push(store.key(i));
    keys.forEach(k => { if (k && shouldRemove(k)) store.removeItem(k); });
  }

  // 2) IndexedDB (best-effort; keep Firebase caches)
  try {
    if (indexedDB?.databases) {
      const dbs = await indexedDB.databases();
      await Promise.all(
        dbs
          .map(d => d?.name || "")
          .filter(name => name && !/^firebase/i.test(name)) // keep firebase local cache
          .map(name => new Promise((res) => {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = req.onerror = req.onblocked = () => res();
          }))
      );
    }
  } catch {
    // ignore
  }

  // 3) Let the app react (screens may listen to this)
  window.dispatchEvent(new CustomEvent("app:progressReset"));
  // optional extra signals if you later hook other screens:
  window.dispatchEvent(new CustomEvent("app:learnInvalidate"));
  window.dispatchEvent(new CustomEvent("app:therapyInvalidate"));
}

export default function ProfileReset() {
  const nav = useNavigate();
  const [guard, setGuard] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const can = guard.trim().toUpperCase() === "RESET";

  async function onReset() {
    if (!can || busy) return;
    setBusy(true); setMsg(""); setErr("");
    try {
      await resetAppProgress();
      setMsg("All app progress has been reset.");

      // Short, smooth delay so the success banner is visible,
      // then reload to drop any in-memory caches (e.g., progressStore).
      setTimeout(() => {
        window.location.reload(); // stays on same route and remains signed in
      }, 450);
    } catch (e) {
      setErr("Failed to reset locally.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prof-page">
      <header className="prof-top">
        <button className="prof-back" onClick={() => nav(-1)} aria-label="Back">←</button>
        <div className="prof-title">Reset all progress</div>
        <span className="prof-spacer" />
      </header>

      <main className="prof-main narrow">
        <div className="panel">
          {err && (
            <div style={{
              color:"#b91c1c", background:"#fee2e2",
              padding:"8px 10px", borderRadius:10, fontWeight:700, marginBottom:8
            }}>{err}</div>
          )}
          {msg && (
            <div style={{
              color:"#065f46", background:"#d1fae5",
              padding:"8px 10px", borderRadius:10, fontWeight:700, marginBottom:8
            }}>{msg}</div>
          )}

          <p className="msg">
            This clears Learn & Therapy progress and local settings on this device.
            Type <b>RESET</b> to confirm.
          </p>

          <label className="field">
            <span>Security field</span>
            <input
              value={guard}
              onChange={(e)=>setGuard(e.target.value)}
              placeholder="Type RESET to confirm"
            />
          </label>

          <div className="row-actions">
            <button className="prof-btn" onClick={()=>nav(-1)} disabled={busy}>Cancel</button>
            <button className="prof-btn danger" disabled={!can || busy} onClick={onReset}>
              {busy ? "Resetting…" : "Reset your progress"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
