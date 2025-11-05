import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { onAuthStateChanged, getIdTokenResult } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

/**
 * Admin resolution order:
 *  1) Custom claim admin=true (if you ever set it)
 *  2) Whitelist via env (UIDs or emails)
 *  3) Firestore users/{uid}: roles.admin == true OR role == "admin"
 */
const WL_UIDS = (import.meta.env.VITE_ADMIN_UIDS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const WL_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || "")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

export default function AdminGate({ children }) {
  const [state, setState] = useState({ loading: true, allow: false });

  useEffect(() => {
    let gone = false;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (!gone) setState({ loading: false, allow: false });
        return;
      }

      try {
        // 1) Custom claims (works if you ever set them via Admin SDK)
        const tok = await getIdTokenResult(user, true);
        if (tok.claims?.admin) {
          if (!gone) setState({ loading: false, allow: true });
          return;
        }

        // 2) Whitelist (UIDs or emails from .env)
        const email = (user.email || "").toLowerCase();
        if (WL_UIDS.includes(user.uid) || WL_EMAILS.includes(email)) {
          if (!gone) setState({ loading: false, allow: true });
          return;
        }

        // 3) Firestore-based role
        const snap = await getDoc(doc(db, "users", user.uid));
        const d = snap.exists() ? snap.data() : {};
        const isAdmin =
          d?.roles?.admin === true ||
          String(d?.role || "").toLowerCase() === "admin";

        if (!gone) setState({ loading: false, allow: !!isAdmin });
      } catch (e) {
        console.error("[AdminGate] check failed:", e);
        if (!gone) setState({ loading: false, allow: false });
      }
    });

    return () => { gone = true; unsub(); };
  }, []);

  if (state.loading) return <div style={{ padding: 16 }}>Checking admin…</div>;
  if (!state.allow) return <Navigate to="/home" replace />; // signed-in users go to Home
  return children;
}
