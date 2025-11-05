// signup — send OTP
const {
  db, getTransport, sendMailSafe,
  genOtp, sha, OTP_TTL_MS, withHandler
} = require("./_common.js");

module.exports = async (req, res) => withHandler(req, res, async () => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });

  const code = genOtp();
  const data = { codeHash: sha(code), exp: Date.now() + OTP_TTL_MS, createdAt: Date.now() };

  await db().collection("pending_signups").doc(email).set(data, { merge: true });

  const { transport, from } = getTransport();
  await sendMailSafe(transport, {
    from,
    to: email,
    subject: "HandiTalk OTP",
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
    html: `<div style="font-family:Arial,sans-serif">
             <h3>HandiTalk Email Verification</h3>
             <p>Your OTP code is <b style="font-size:20px;letter-spacing:3px">${code}</b></p>
             <p>This code expires in 10 minutes.</p>
           </div>`
  });

  res.json({ ok: true });
});
