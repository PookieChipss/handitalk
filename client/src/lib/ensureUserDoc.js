// src/lib/ensureUserDoc.js
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Ensure the user's profile doc exists.
 * - Safe to call repeatedly.
 * - Does nothing if user is null or doc already exists.
 * - Writes a self-describing doc with { uid, email, displayName, ... }.
 */
export async function ensureUserDoc(user) {
  if (!user) return null;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return ref;

  const data = {
    uid: user.uid, // <- IMPORTANT: your rules require this on create
    email: user.email || null,
    displayName: (localStorage.getItem("pendingDisplayName") || user.displayName || "User").trim(),
    photoURL: user.photoURL || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    // NOTE: no "roles" here; only admins can write roles elsewhere.
  };

  try {
    await setDoc(ref, data); // create (no merge needed, but fine either way)
    return ref;
  } catch (e) {
    // If this was just-after-sign-in and the token isn't fresh yet,
    // refresh once and retry. Avoid retrying on other codes.
    const code = e?.code || "";
    if (code === "permission-denied" || code === "unauthenticated") {
      try {
        // user can be stale but still valid for a refresh here
        await user.getIdToken(true);
        await setDoc(ref, data);
        return ref;
      } catch (e2) {
        console.error("[ensureUserDoc] still failed:", e2);
        throw e2;
      }
    }
    console.error("[ensureUserDoc] failed:", e);
    throw e;
  } finally {
    localStorage.removeItem("pendingDisplayName");
  }
}
