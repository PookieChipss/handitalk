// src/AppRouter.jsx
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { auth } from "./lib/firebase";

// Public pages
import Signup from "./pages/Signup.jsx";
import Otp from "./pages/Otp.jsx";
import Login from "./pages/Login.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPasswordOtp from "./pages/ResetPasswordOtp.jsx";

// Protected pages
import Home from "./pages/Home.jsx";
import Learn from "./pages/Learn.jsx";
import LearnCategory from "./pages/LearnCategory.jsx"; // NEW
import Therapy from "./pages/Therapy.jsx";
import Progress from "./pages/Progress.jsx";
import SignToText from "./pages/SignToText.jsx";

function RequireAuth() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  useEffect(() => auth.onAuthStateChanged(u => { setAuthed(!!u); setReady(true); }), []);
  if (!ready) return <div style={{ padding: 20 }}>Loading…</div>;
  return authed ? <Outlet /> : <Navigate to="/login" replace />;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/signup" element={<Signup />} />
        <Route path="/otp" element={<Otp />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ForgotPassword />} />
        <Route path="/reset-password-otp" element={<ResetPasswordOtp />} />

        {/* Protected shell */}
        <Route element={<RequireAuth />}>
          <Route path="/home" element={<Home />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/:category" element={<LearnCategory />} /> {/* important */}
          <Route path="/therapy" element={<Therapy />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/sign-to-text" element={<SignToText />} />
          {/* any unknown protected route -> home (not /login) */}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>

        {/* Default */}
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
