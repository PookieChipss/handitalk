import admin from "firebase-admin";

const saStr = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!saStr) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing");

let creds;
try {
  // raw JSON
  creds = JSON.parse(saStr);
} catch {
  // maybe base64 of JSON
  const json = Buffer.from(saStr, "base64").toString("utf8");
  creds = JSON.parse(json);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(creds),
  });
}

export const auth = admin.auth();
export const db = admin.firestore ? admin.firestore() : null;
