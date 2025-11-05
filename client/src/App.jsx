// src/App.jsx
import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";

/* firebase */
import { onAuthStateChanged, signOut, getAuth, getIdTokenResult } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDocFromServer } from "firebase/firestore";

/* ensure user profile doc */
import { ensureUserDoc } from "@/lib/ensureUserDoc";

/* global styles */
import "@/styles/theme.css";
import "@/styles/kid-mode.css";

/* Public pages */
import Login from "@/pages/Login.jsx";
import SignUp from "@/pages/SignUp.jsx";
import OTP from "@/pages/OTP.jsx";
import ResetPasswordOtp from "@/pages/ResetPasswordOtp.jsx";

/* Protected (user) pages */
import Home from "@/pages/Home.jsx";
import SignToText from "@/pages/SignToText.jsx";
import TextToSign from "@/pages/TextToSign.jsx";
import Learn from "@/pages/Learn.jsx";
import LearnCategory from "@/pages/LearnCategory.jsx";
import Therapy from "@/pages/Therapy.jsx";
import SpeechPractice from "@/pages/SpeechPractice.jsx";
import Progress from "@/pages/Progress.jsx";

/* Profile */
import Profile from "@/pages/Profile.jsx";
import ProfileEdit from "@/pages/ProfileEdit.jsx";
import ProfilePassword from "@/pages/ProfilePassword.jsx";
import ProfileReset from "@/pages/ProfileReset.jsx";
import ProfileDelete from "@/pages/ProfileDelete.jsx";

/* Shells */
import RequireAuth from "@/auth/RequireAuth.jsx";
import MobileLayout from "@/components/MobileLayout.jsx";

/* Admin shell & pages */
import AdminGate from "@/admin/AdminGate.jsx";
import AdminShell from "@/admin/AdminShell.jsx";
import ModuleManager from "@/admin/pages/ModuleManager.jsx";
import ContentManager from "@/admin/pages/ContentManager.jsx";
import UserManager from "@/admin/pages/UserManager.jsx";

/* ───── Admin whitelist (bootstrap) ───── */
const WL_UIDS = (import.meta.env.VITE_ADMIN_UIDS || "")
  .split(",").map(s => s.trim()).filter(Boolean);
const WL_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

/* App-wide listeners – do NOT toggle kid here */
function AppListeners({ children }) {
  useEffect(() => {
    function setVol(v) {
      const num = Number(v ?? localStorage.getItem("app.sound.volume") ?? 0.7);
      window.__globalVolume = isNaN(num) ? 0.7 : num;
    }
    setVol();
    const onVol = (e) => setVol(e.detail);
    window.addEventListener("app:volume", onVol);
    return () => window.removeEventListener("app:volume", onVol);
  }, []);
  return children;
}

/* Central admin resolver (fresh, safe) */
async function resolveIsAdmin(user) {
  if (!user) return false;

  // 1) custom claim (if you ever set it)
  try {
    const tok = await getIdTokenResult(user, true);
    if (tok.claims?.admin) return true;
  } catch {}

  // 2) whitelist
  const email = (user.email || "").toLowerCase();
  if (WL_UIDS.includes(user.uid) || WL_EMAILS.includes(email)) return true;

  // 3) Firestore role — FORCE SERVER (avoid cache)
  try {
    const ref = doc(db, "users", user.uid);
    const snap = await getDocFromServer(ref);
    const d = snap.exists() ? snap.data() : {};
    return d?.roles?.admin === true || String(d?.role || "").toLowerCase() === "admin";
  } catch {
    return false;
  }
}

/** Auth pages wrapper */
function AuthShell({ children }) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  // visual mode for auth pages
  useEffect(() => {
    document.body.classList.remove("kid");
    document.body.dataset.childmode = "0";
    document.body.classList.add("auth");
    return () => document.body.classList.remove("auth");
  }, []);

  // ensure we are signed out on public pages once
  useEffect(() => {
    (async () => {
      try { await signOut(auth); } catch {}
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    let isMounted = true;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      try { await ensureUserDoc(user); } catch (e) {
        console.error("[AuthShell] ensureUserDoc failed:", e?.code || e?.message);
      }

      const current = getAuth().currentUser;
      if (!current || current.uid !== user.uid) return;

      const isAdmin = await resolveIsAdmin(user);

      if (!isMounted) return;
      navigate(isAdmin ? "/admin" : "/home", { replace: true });
    });

    return () => { isMounted = false; unsub(); };
  }, [ready, navigate]);

  if (!ready) return null;
  return children;
}

/* If an admin lands on /home, bounce them to /admin */
function AdminAutoRedirect({ children }) {
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    let gone = false;
    (async () => {
      const u = getAuth().currentUser;
      if (!u) return;
      const admin = await resolveIsAdmin(u);
      if (!gone && admin && loc.pathname === "/home") {
        nav("/admin", { replace: true });
      }
    })();
    return () => { gone = true; };
  }, [nav, loc.pathname]);

  return children;
}

export default function App() {
  return (
    <AppListeners>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Public (Auth) */}
        <Route path="/login" element={<AuthShell><Login /></AuthShell>} />
        <Route path="/signup" element={<AuthShell><SignUp /></AuthShell>} />
        <Route path="/otp" element={<AuthShell><OTP /></AuthShell>} />
        <Route path="/reset-password" element={<AuthShell><ResetPasswordOtp /></AuthShell>} />

        {/* Protected app */}
        <Route element={<RequireAuth><MobileLayout /></RequireAuth>}>
          <Route path="/home" element={
            <AdminAutoRedirect>
              <Home />
            </AdminAutoRedirect>
          } />
          <Route path="/sign-to-text" element={<SignToText />} />
          <Route path="/text-to-sign" element={<TextToSign />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/:category" element={<LearnCategory />} />
          <Route path="/therapy" element={<Therapy />} />
          <Route path="/therapy/practice" element={<SpeechPractice />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/edit" element={<ProfileEdit />} />
          <Route path="/profile/password" element={<ProfilePassword />} />
          <Route path="/profile/reset" element={<ProfileReset />} />
          <Route path="/profile/delete" element={<ProfileDelete />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>

        {/* Admin */}
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminGate>
                <AdminShell />
              </AdminGate>
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="modules" replace />} />
          <Route path="modules" element={<ModuleManager />} />
          <Route path="content" element={<ContentManager />} />
          <Route path="users"   element={<UserManager />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AppListeners>
  );
}
