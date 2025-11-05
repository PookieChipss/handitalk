// src/auth/RequireAuth.jsx
import { Navigate, useLocation } from "react-router-dom";
import { onAuthStateChanged, getAuth } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth as sharedAuth } from "@/lib/firebase.js";

export default function RequireAuth({ children }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const location = useLocation();
  const auth = sharedAuth || getAuth();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setReady(true);
    });
    return () => unsub();
  }, [auth]);

  if (!ready) return <div style={{ padding: 20 }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}
