// controllers/emailController.js
//
// Admin/staff broadcast: email every verified entrepreneur. Delegates the
// actual send to the central mailerService so the sender identity is
// consistent across the app (chat notifications, promoter emails, this
// broadcast — all go through the same Workspace mailbox).
import pool from '../config/db.js';
import { sendEmail, isMailerReady, getMailerIdentity } from '../services/mailerService.js';

export const sendEmailToAllEntrepreneurs = async (req, res) => {
  const { subject, message, html } = req.body;
  const startedAt = Date.now();

  const identity = getMailerIdentity();

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("📢 URGENT BROADCAST — sendEmailToAllEntrepreneurs()");
  console.log(`   mailer: ${identity.host}:${identity.port} as ${identity.user || "(unset)"}`);
  console.log(`   from  : ${identity.from || `(default) "Intervos" <${identity.user}>`}`);
  console.log(`   subject: ${subject || "(none)"}`);
  console.log(`   text length: ${message?.length ?? 0}  html: ${html ? "yes" : "no"}`);

  if (!isMailerReady()) {
    console.warn("   ⚠️  Mailer NOT ready — aborting. Check EMAIL_USER / EMAIL_PASSWORD in .env.");
    console.log("══════════════════════════════════════════════════════════\n");
    return res.status(503).json({
      message: "Mailer not configured — set EMAIL_USER / EMAIL_PASSWORD in .env.",
    });
  }

  try {
    const result = await pool.query(`
      SELECT u.email
      FROM users u
      JOIN entrepreneur_profiles e ON e.user_id = u.id
      WHERE u.email_verified = true;
    `);

    const entrepreneurs = result.rows;
    console.log(`   recipients found in DB: ${entrepreneurs.length}`);

    if (entrepreneurs.length === 0) {
      console.warn("   ⚠️  Nothing to send — no verified entrepreneurs.");
      console.log("══════════════════════════════════════════════════════════\n");
      return res.status(404).json({ message: "No entrepreneurs found." });
    }

    // Fan out in parallel — mailerService already logs each send. We tally
    // successes and failures so the endpoint response + this final log line
    // both reflect the actual outcome.
    let sent = 0;
    let failed = 0;
    const failures = [];

    await Promise.all(
      entrepreneurs.map(async (e, idx) => {
        console.log(`   → [${idx + 1}/${entrepreneurs.length}] sending to ${e.email}`);
        try {
          const info = await sendEmail(e.email, subject, message, html || undefined);
          if (info) {
            sent += 1;
          } else {
            // sendEmail returned undefined = internal error, already logged.
            failed += 1;
            failures.push(e.email);
          }
        } catch (err) {
          failed += 1;
          failures.push(e.email);
          console.error(`     ❌ throw on ${e.email}: ${err.message}`);
        }
      })
    );

    const elapsed = Date.now() - startedAt;
    console.log(`   ✅ done in ${elapsed}ms — sent: ${sent}, failed: ${failed}`);
    if (failures.length > 0) {
      console.log(`   failed recipients: ${failures.join(", ")}`);
    }
    console.log("══════════════════════════════════════════════════════════\n");

    res.status(200).json({
      message: `Email sent to ${sent} of ${entrepreneurs.length} entrepreneurs.`,
      sent,
      failed,
      failures,
    });
  } catch (error) {
    console.error("   💥 Broadcast crashed:", error);
    console.log("══════════════════════════════════════════════════════════\n");
    res.status(500).json({ message: "Error sending emails", error: error.message });
  }
};
