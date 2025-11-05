// client/src/lib/firebase.js
// Firebase bootstrap for Vite/React with NO hardcoded secrets.
// - Single app instance (HMR safe)
// - Auth persistence: local
// - Firestore offline cache is opt-in via VITE_FB_PERSISTENCE=1

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Require env helper (prevents accidental missing keys)
const must = (k) => {
  const v = import.meta.env[k];
  if (!v) throw new Error(`Missing ${k}. Put it in client/.env.local (and your deploy env).`);
  return v;
};

const firebaseConfig = {
  apiKey:            must("VITE_FIREBASE_API_KEY"),
  authDomain:        must("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId:         must("VITE_FIREBASE_PROJECT_ID"),
  storageBucket:     must("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: must("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId:             must("VITE_FIREBASE_APP_ID"),
  // measurementId is optional: VITE_FIREBASE_MEASUREMENT_ID
};

// Single app instance (important for HMR / multiple imports)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Auth with local persistence
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((e) => {
  console.warn("Auth persistence fallback:", e?.message || e);
});

// Firestore
const db = getFirestore(app);

// Optional: enable offline persistence ONLY if explicitly requested.
// Avoids multi-tab/HMR IndexedDB edge cases unless you opt in.
if (import.meta.env.VITE_FB_PERSISTENCE === "1") {
  import("firebase/firestore").then(({ enableIndexedDbPersistence }) => {
    enableIndexedDbPersistence(db).catch((e) => {
      console.warn("IndexedDB persistence disabled:", e?.message || e);
    });
  });
}

// Storage
const storage = getStorage(app);

export { app, auth, db, storage };
