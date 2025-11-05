import crypto from "crypto";

export const otpCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

export const sha256 = (s) =>
  crypto.createHash("sha256").update(String(s)).digest("hex");

export const now = () => Date.now();

export const ttlMs = () =>
  Number(process.env.OTP_EXP_MIN || 10) * 60 * 1000; // default 10 min

export const appName = () => process.env.APP_NAME || "HandiTalk";

export const emailHtml = (title, code) => `
  <div style="font-family:Arial,sans-serif;line-height:1.5">
    <h2>${title}</h2>
    <p>Your OTP code is:</p>
    <div style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</div>
    <p>This code expires in ${process.env.OTP_EXP_MIN || 10} minutes.</p>
  </div>
`;
