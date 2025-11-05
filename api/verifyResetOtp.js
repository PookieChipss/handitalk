// api/verifyResetOtp.js
// Forgot password — verify OTP first (checkOnly) then allow password reset

const { auth, db, sha, withHandler } = require("./_common.js");

module.exports = async (req, res) => withHandler(req, res, async () => {
  const { email, otp, newPassword, checkOnly } = req.body || {};
  if (!email || !otp) return res.status(400).json({ error: "email and otp required" });

  const user = await auth().getUserByEmail(email).catch(() => null);
  if (!user) return res.status(400).json({ error: "invalid_or_expired" });

  const ref = db().collection("password_resets").doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) return res.status(400).json({ error: "invalid_or_expired" });

  const { codeHash, exp } = snap.data() || {};
  if (!codeHash || !exp || exp < Date.now()) return res.status(400).json({ error: "invalid_or_expired" });
  if (sha(otp) !== codeHash) return res.status(400).json({ error: "invalid_or_expired" });

  // Step 1: verify-only
  if (checkOnly || !newPassword) {
    return res.json({ ok: true, verified: true });
  }

  // Step 2: finalize reset
  await auth().updateUser(user.uid, { password: newPassword });
  await ref.delete();

  res.json({ ok: true });
});
