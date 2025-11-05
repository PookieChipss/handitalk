// signup — verify OTP + create user
const { auth, db } = require("./_common.js");
const { sha, withHandler } = require("./_common.js");

module.exports = async (req, res) => withHandler(req, res, async () => {
  const { email, otp, password } = req.body || {};
  if (!email || !otp || !password)
    return res.status(400).json({ error: "email, otp, password required" });

  const ref = db().collection("pending_signups").doc(email);
  const snap = await ref.get();
  if (!snap.exists) return res.status(400).json({ error: "invalid_or_expired" });

  const { codeHash, exp } = snap.data() || {};
  if (!codeHash || !exp || exp < Date.now())
    return res.status(400).json({ error: "invalid_or_expired" });

  if (sha(otp) !== codeHash)
    return res.status(400).json({ error: "invalid_or_expired" });

  let user;
  try {
    user = await auth().getUserByEmail(email);
  } catch {
    user = await auth().createUser({ email, password, emailVerified: true });
  }

  await ref.delete();
  res.json({ ok: true, uid: user.uid });
});
