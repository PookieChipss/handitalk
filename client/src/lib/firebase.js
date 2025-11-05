// client/src/lib/firebase.js
// Robust Firebase bootstrap for Vite/React (single init, stable SDK).
// - Pins to modular SDK usage
// - Auth persistence: local (survives reloads in same profile)
// - Firestore: NO IndexedDB persistence by default (prevents 10.14.x "Unexpected state")
//   You can re-enable via VITE_FB_PERSISTENCE=1 if you need offline cache.

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// ---- Config (env with sensible fallbacks for your project) ----
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDCHlVK6KAHsMdGI2bI3gHM8LkMBNUEdE8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "handitalk-29b68.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "handitalk-29b68",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "handitalk-29b68.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "564428159777",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:564428159777:web:f5a7b0617765fdd2261c60",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// ---- Single app instance (important for HMR / multiple imports) ----
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ---- Auth (persist across reloads in same profile) ----
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((e) => {
  // Non-fatal (e.g., in private mode); keep going without persistence
  console.warn("Auth persistence fallback:", e?.message || e);
});

// ---- Firestore ----
const db = getFirestore(app);

// Optional: enable offline persistence ONLY if explicitly requested.
// This avoids the "INTERNAL ASSERTION FAILED: Unexpected state" seen in 10.14.x
// and multi-tab dev with HMR. Turn on by setting VITE_FB_PERSISTENCE=1.
if (import.meta.env.VITE_FB_PERSISTENCE === "1") {
  // Lazy import to keep base path clean
  import("firebase/firestore").then(({ enableIndexedDbPersistence }) => {
    enableIndexedDbPersistence(db).catch((e) => {
      console.warn("IndexedDB persistence disabled (reason):", e?.message || e);
    });
  });
}

// ---- Storage (uploads for videos/models/covers) ----
const storage = getStorage(app);

export { app, auth, db, storage };
