// api/adminDeleteUser.js  (CommonJS)

const {
  auth,
  fdb,
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
    await requireAdmin(req); // 401/403 with explicit message if token/role invalid

    const { uid } = req.body || {};
    if (!uid) return sendJson(res, 400, { error: "uid_required" });

    // Prevent deleting admins
    const snap = await fdb.collection("users").doc(uid).get();
    const d = snap.exists ? (snap.data() || {}) : {};
    if (d?.roles?.admin === true) {
      return sendJson(res, 400, { error: "cannot_delete_admin" });
    }

    // Delete from Firebase Auth (ignore if not found)
    try {
      await auth.deleteUser(uid);
    } catch (e) {
      if (e?.code !== "auth/user-not-found") throw e;
    }

    // Delete mirrored Firestore doc (best-effort)
    try {
      await fdb.collection("users").doc(uid).delete();
    } catch (_) {}

    return sendJson(res, 200, { ok: true });
  } catch (e) {
    return sendJson(res, e?.status || 500, { error: e?.message || "internal" });
  }
};
