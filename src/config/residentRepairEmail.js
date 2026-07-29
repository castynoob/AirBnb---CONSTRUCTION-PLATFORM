// =============================================================================
// Resident Repair email templates
// =============================================================================
// Fire-and-forget from the controller — if SendGrid hiccups the API response
// still succeeds. In-app bell notifications are the primary channel; these
// are the out-of-app catch.
// =============================================================================

import sgMail from "@sendgrid/mail";

const FROM = process.env.EMAIL_FROM;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const escapeHtml = (s) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const wrap = (headline, bodyHtml) => `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; background-color: #f8f9fb;">
    <div style="background: linear-gradient(135deg, #0D1B2A 0%, #1a3a5c 100%); padding: 24px 32px; border-radius: 10px 10px 0 0;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px;">INTERVOS</h1>
      <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px;">${headline}</p>
    </div>
    <div style="background-color: #ffffff; padding: 28px 32px; border-radius: 0 0 10px 10px;">
      ${bodyHtml}
    </div>
  </div>
`;

// New submission → tell the PM.
export const emailRepairSubmittedToPM = async ({ pmEmail, resident, propertyName, title, description, repairId }) => {
  if (!FROM || !pmEmail) return;
  const url = `${FRONTEND_URL}/repairs/pending`;
  const msg = {
    to: pmEmail,
    from: FROM,
    replyTo: resident.email || FROM,
    subject: `New repair request from ${resident.name} — "${title}"`,
    html: wrap(`New repair request at ${escapeHtml(propertyName || "your property")}`, `
      <p style="color: #6b7280; font-size: 13px; margin: 0 0 4px;">From <b>${escapeHtml(resident.name)}</b> &lt;${escapeHtml(resident.email)}&gt;</p>
      <h3 style="margin: 4px 0 12px; color: #0D1B2A; font-size: 16px;">${escapeHtml(title)}</h3>
      <div style="white-space: pre-wrap; color: #374151; font-size: 14px; line-height: 1.55; background: #f8f9fb; padding: 14px 16px; border-left: 3px solid #14919B; border-radius: 6px;">${escapeHtml(description)}</div>
      <p style="margin: 20px 0 0;">
        <a href="${url}" style="display: inline-block; padding: 10px 22px; background: #14919B; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">Review request</a>
      </p>
    `),
  };
  try {
    await sgMail.send(msg);
    console.log(`✅ Repair email → ${pmEmail} (submitted, repair ${repairId})`);
  } catch (err) {
    console.error("❌ SendGrid repair (submitted):", err.response?.body || err.message);
  }
};

// PM approved → tell the resident.
export const emailRepairApprovedToResident = async ({ residentEmail, title, note, repairId }) => {
  if (!FROM || !residentEmail) return;
  const url = `${FRONTEND_URL}/repairs/resident`;
  const msg = {
    to: residentEmail,
    from: FROM,
    subject: `Your repair request was approved — "${title}"`,
    html: wrap(`Approved`, `
      <p style="color: #374151; font-size: 14px; margin: 0 0 10px;">Your request <b>${escapeHtml(title)}</b> was approved and is now open for bids.</p>
      ${note ? `<p style="color: #6b7280; font-size: 13px; margin: 0 0 6px;">Note from your property manager:</p><div style="white-space: pre-wrap; color: #374151; font-size: 14px; line-height: 1.55; background: #f8f9fb; padding: 14px 16px; border-left: 3px solid #14919B; border-radius: 6px;">${escapeHtml(note)}</div>` : ""}
      <p style="margin: 20px 0 0;">
        <a href="${url}" style="display: inline-block; padding: 10px 22px; background: #14919B; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">View request</a>
      </p>
    `),
  };
  try { await sgMail.send(msg); } catch (err) { console.error("❌ SendGrid repair (approved):", err.response?.body || err.message); }
};

// PM rejected → tell the resident with the reason.
export const emailRepairRejectedToResident = async ({ residentEmail, title, note, repairId }) => {
  if (!FROM || !residentEmail) return;
  const url = `${FRONTEND_URL}/repairs/resident`;
  const msg = {
    to: residentEmail,
    from: FROM,
    subject: `Your repair request was declined — "${title}"`,
    html: wrap(`Declined`, `
      <p style="color: #374151; font-size: 14px; margin: 0 0 10px;">Your request <b>${escapeHtml(title)}</b> was declined by your property manager.</p>
      <p style="color: #6b7280; font-size: 13px; margin: 12px 0 6px;">Reason:</p>
      <div style="white-space: pre-wrap; color: #374151; font-size: 14px; line-height: 1.55; background: #fef2f2; padding: 14px 16px; border-left: 3px solid #dc2626; border-radius: 6px;">${escapeHtml(note || "No reason provided.")}</div>
      <p style="margin: 20px 0 0;">
        <a href="${url}" style="display: inline-block; padding: 10px 22px; background: #0F223D; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">View your requests</a>
      </p>
    `),
  };
  try { await sgMail.send(msg); } catch (err) { console.error("❌ SendGrid repair (rejected):", err.response?.body || err.message); }
};
