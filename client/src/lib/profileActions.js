import {
  getAuth, EmailAuthProvider, reauthenticateWithCredential,
  updateProfile, updateEmail, sendEmailVerification,
  updatePassword, signOut, deleteUser
} from "firebase/auth";
import {
  getFirestore, doc, updateDoc, setDoc, getDoc,
  collection, query, where, getDocs, writeBatch
} from "firebase/firestore";
import { auth } from "@/lib/firebase"; // your existing export
const db = getFirestore();

async function reauth(email, password) {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Not signed in");
  const cred = EmailAuthProvider.credential(email || user.email, password);
  await reauthenticateWithCredential(user, cred);
  return user;
}

/** Edit personal data (displayName + email) */
export async function updatePersonalData({ displayName, email, password }) {
  const user = await reauth(email, password);

  // 1) update displayName
  if (displayName && displayName !== user.displayName) {
    await updateProfile(user, { displayName });
  }

  // 2) update email (requires reauth just done)
  if (email && email !== user.email) {
    await updateEmail(user, email);
    // Optional: enforce verification after email change
    try { await sendEmailVerification(user); } catch {}
  }

  // 3) mirror to Firestore users/{uid}
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const payload = { displayName: displayName || user.displayName, email: user.email, updatedAt: Date.now() };
  await (snap.exists() ? updateDoc(ref, payload) : setDoc(ref, payload));
}

/** Change password in-session — no OTP needed if reauthed */
export async function changePassword({ email, currentPassword, newPassword }) {
  await reauth(email, currentPassword);
  const user = getAuth().currentUser;
  await updatePassword(user, newPassword);
}

/** Reset all progress: Firestore + localStorage */
export async function resetAllProgress(uid) {
  // 1) local
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith("learn.") || k.startsWith("progress.") || k.startsWith("therapy.") ||
        k.startsWith("app.sound.") || k.startsWith("app.childmode")) {
      localStorage.removeItem(k);
    }
  });

  // 2) Firestore (example collections—adjust names/paths)
  const batch = writeBatch(db);
  const collections = [
    ["learnProgress", "userId"],
    ["therapyProgress", "userId"],
    ["favorites", "userId"]
  ];
  for (const [col, field] of collections) {
    const q = query(collection(db, col), where(field, "==", uid));
    const qs = await getDocs(q);
    qs.forEach((d) => batch.delete(d.ref));
  }
  await batch.commit();
}

/** Child mode: persist & notify app */
export async function setChildMode(flag) {
  localStorage.setItem("app.childmode", flag ? "1" : "0");
  window.dispatchEvent(new CustomEvent("app:childmode", { detail: flag }));
  // Optional: also mirror to Firestore user settings if you want cross-device sync
}

/** Global volume: persist & broadcast */
export function setGlobalVolume(v) {
  localStorage.setItem("app.sound.volume", String(v));
  window.dispatchEvent(new CustomEvent("app:volume", { detail: v }));
}

/** Logout with confirm */
export async function logoutWithConfirm(navigate) {
  if (!confirm("Are you sure you want to log out?")) return;
  await signOut(auth);
  navigate("/login", { replace: true });
}

/** Full account delete + cascading cleanup
 *  NOTE: best practice is a Callable Cloud Function that deletes all user-owned data server-side.
 *  This client version attempts to delete known docs, then deletes the auth user.
 */
export async function deleteAccountCascade() {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Not signed in");

  // attempt to wipe user-owned docs first
  await resetAllProgress(user.uid);

  // finally delete the auth user (reauth may be required if session is old)
  try {
    await deleteUser(user);
  } catch (e) {
    // if requires recent login, ask UI to collect password and call reauth + retry
    throw e;
  }
}
