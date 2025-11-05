// api/adminUpdateUser.js  (CommonJS)

const {
  auth,
  fdb,
  FieldValue,
  applyCors,
  requireAdmin,
  sendJson,
} = require("./_adminCore.js");

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  try {
    await requireAdmin(req);

    const { uid, displayName } = req.body || {};
    if (!uid) return sendJson(res, 400, { error: "uid_required" });

    const dn = String(displayName || "").trim();

    // Update in Auth
    await auth.updateUser(uid, { displayName: dn || undefined });

    // Mirror in Firestore
    await fdb
      .collection("users")
      .doc(uid)
      .set(
        {
          displayName: dn || null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return sendJson(res, 200, { ok: true });
  } catch (e) {
    const code = e?.status || 500;
    return sendJson(res, code, { error: e?.message || "internal" });
  }
};
