import nodemailer from "nodemailer";

function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;

  if (SMTP_HOST) {
    const port = Number(SMTP_PORT || 587);
    const secure = String(SMTP_SECURE || "false") === "true" || port === 465;
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }

  // Default to Gmail (requires App Password)
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function sendMail(to, subject, html) {
  const transporter = createTransporter();
  await transporter.verify(); // surface SMTP errors early
  const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
  const info = await transporter.sendMail({ from, to, subject, html });
  return info;
}
