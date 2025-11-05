import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "@/styles/profile.css";

import { getAuth, updateProfile } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

export default function ProfileEdit() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [warn, setWarn] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;
    const db   = getFirestore();
    let mounted = true;

    async function load() {
      try {
        let displayName = user?.displayName?.trim() || "";
        if (!displayName && user?.uid) {
          try {
            const ref = doc(db, "users", user.uid);
            const snap = await getDoc(ref);
            if (snap.exists()) {
              const d = snap.data();
              displayName = d.displayName?.trim() || d.name?.trim() || "";
            }
          } catch {}
        }
        if (mounted) setName(displayName);
      } catch {}
    }
    load();
    return () => { mounted = false; };
  }, []);

  const valid = name.trim().length >= 1;

  async function onSave() {
    if (!valid || saving) return;
    setSaving(true); setWarn(""); setOk("");
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      const db   = getFirestore();
      if (!user) throw new Error("Not signed in");

      // Update Auth displayName (used by your UI)
      await updateProfile(user, { displayName: name.trim() });

      // Try to mirror to Firestore (non-blocking)
      try {
        await setDoc(
          doc(db, "users", user.uid),
          { displayName: name.trim(), email: user.email || "", updatedAt: Date.now() },
          { merge: true }
        );
      } catch {
        setWarn("Name saved, but profile store couldn’t sync (permissions).");
      }

      // Notify other pages immediately
      window.dispatchEvent(new CustomEvent("app:displayName", { detail: name.trim() }));

      setOk("Name updated.");
      setTimeout(() => nav(-1), 700);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="prof-page">
      <header className="prof-top">
        <button className="prof-back" onClick={() => nav(-1)} aria-label="Back">←</button>
        <div className="prof-title">Edit personal data</div>
        <span className="prof-spacer" />
      </header>

      <main className="prof-main narrow">
        <div className="panel">
          {warn && (
            <div style={{color:"#92400e", background:"#fef3c7", padding:"8px 10px", borderRadius:10, fontWeight:700}}>
              {warn}
            </div>
          )}
          {ok && (
            <div style={{color:"#065f46", background:"#d1fae5", padding:"8px 10px", borderRadius:10, fontWeight:700}}>
              {ok}
            </div>
          )}

          <label className="field">
            <span>First name</span>
            <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Your name" />
          </label>

          <button className="prof-btn primary" disabled={!valid || saving} onClick={onSave}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </main>
    </div>
  );
}
