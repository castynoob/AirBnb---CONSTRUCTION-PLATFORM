// services/mailerService.js
//
// Generic transactional email sender used for user-to-user notifications
// (new chat messages, etc). Uses SMTP against the app's dedicated Google
// Workspace mailbox, so mail arrives from a real @yourdomain address the
// recipient trusts and can reply to.
//
// Env vars required:
//   EMAIL_HOST      — e.g. "smtp.gmail.com"
//   EMAIL_PORT      — 465 (SSL) or 587 (STARTTLS)
//   EMAIL_USER      — full mailbox address (from@yourdomain.com)
//   EMAIL_PASSWORD  — Google App Password (16 chars, no spaces), NOT the
//                     regular account password — Gmail SMTP rejects those.
//   EMAIL_FROM      — display "From" header; falls back to EMAIL_USER.
//
// Verification / password-reset still go through SendGrid via emailConfig.js.
// This module is only used for ad-hoc notifications (see messageController).
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Single-source SMTP config. Used for every transactional email in the app:
// chat notifications, broadcast entrepreneur mails, promoter notifications.
const EMAIL_HOST = process.env.EMAIL_HOST || "smtp.gmail.com";
const EMAIL_PORT = Number(process.env.EMAIL_PORT || 587);
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASSWORD;

let transporter = null;
if (EMAIL_HOST && EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_PORT === 465, // SSL on 465, STARTTLS on 587
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
  console.log(`✅ Mailer SMTP configured (${EMAIL_HOST}:${EMAIL_PORT} as ${EMAIL_USER})`);
  // Probe the credentials NOW instead of finding out on the first send. On
  // failure, keep the transporter around so per-send errors still surface
  // (matches nodemailer's own behaviour if verify is skipped) but log a very
  // loud warning so the operator sees it at boot time.
  transporter.verify()
    .then(() => console.log(`✅ Mailer credentials accepted by ${EMAIL_HOST}`))
    .catch((err) => {
      console.error("");
      console.error("❌❌❌ MAILER CREDENTIAL PROBE FAILED ❌❌❌");
      console.error(`   host: ${EMAIL_HOST}:${EMAIL_PORT}`);
      console.error(`   user: ${EMAIL_USER}`);
      console.error(`   error: ${err.message}`);
      console.error("   → Every send WILL fail with the same error until this is resolved.");
      console.error("   → If host is smtp.gmail.com: EMAIL_PASSWORD must be a Google App Password");
      console.error("     generated on the SAME account as EMAIL_USER, not the regular password.");
      console.error("");
    });
} else {
  console.warn(
    "⚠️ Mailer SMTP not configured — set EMAIL_HOST/EMAIL_PORT/EMAIL_USER/EMAIL_PASSWORD in .env."
  );
}

// Exposed so callers can guard early if desired.
export const isMailerReady = () => transporter !== null;

// Snapshot of the SMTP identity currently in use — for diagnostic logging.
// Does NOT include the password, only host/port/user.
export const getMailerIdentity = () => ({
  host: EMAIL_HOST,
  port: EMAIL_PORT,
  user: EMAIL_USER || null,
  from: process.env.EMAIL_FROM || null,
  ready: transporter !== null,
});

export const sendEmail = async (to, subject, text, html) => {
  if (!transporter) {
    console.warn(`⚠️ Dropping email to ${to} ("${subject}") — mailer not configured.`);
    return;
  }
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"Intervos" <${EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
    console.log(`✅ Email sent to ${to} (id=${info.messageId})`);
    return info;
  } catch (error) {
    console.error(`❌ Failed to send to ${to}:`, error.message);
  }
};



