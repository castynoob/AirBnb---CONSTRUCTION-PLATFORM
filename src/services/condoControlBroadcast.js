// =============================================================================
// Condo Control (and similar condo-mgmt platform) email bridge
// =============================================================================
//
// Ships an INTERVOS announcement into a community's Condo Control feed by
// email. This is a "neighbour" integration — no formal partnership with
// Condo Control is required. Condo Control (like BuildingLink, TownSq, etc.)
// accepts inbound emails to a per-community mailbox and reposts them as
// announcements to residents.
//
// Not being an official partner means we have to trust that:
//   * The manager pastes the correct ingestion address on each property.
//   * The receiving platform accepts arbitrary sender addresses (most do).
//   * Condo Control does not change their ingestion format silently.
//
// If they ever formalise a partnership, only queryCondoControl() below needs
// to change — swap the sendEmail for an API call and update the caller.
// =============================================================================

import pool from "../config/db.js";
import { sendEmail, isMailerReady } from "./mailerService.js";

const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Render an announcement into the plain-text + HTML shape that generic
// email-ingesting platforms tend to accept without special formatting.
// Priority + type are surfaced as prefix tags because Condo Control's inbound
// parser tends to strip most non-standard headers.
const composeMessage = ({ announcement, property, senderName }) => {
  const priorityTag =
    announcement.priority && announcement.priority !== "normal"
      ? `[${String(announcement.priority).toUpperCase()}] `
      : "";
  const typeTag = announcement.type ? `[${announcement.type}] ` : "";

  const subject = `${priorityTag}${typeTag}${announcement.title}`.trim();
  const location = property?.building_name || property?.address || "your community";

  const text = [
    `${announcement.title}`,
    "",
    announcement.content,
    "",
    "---",
    `Property: ${location}`,
    `Posted by: ${senderName || "Property Manager"}`,
    `Via: INTERVOS`,
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:640px;color:#0f223d;">
      <h2 style="margin:0 0 8px 0;">${escapeHtml(announcement.title)}</h2>
      ${announcement.type || announcement.priority ? `<div style="margin:0 0 16px 0;font-size:12px;color:#64748b;">
        ${announcement.priority && announcement.priority !== "normal" ? `<span style="display:inline-block;padding:2px 8px;background:#fef2f2;color:#991b1b;border-radius:4px;font-weight:700;text-transform:uppercase;margin-right:6px;">${escapeHtml(announcement.priority)}</span>` : ""}
        ${announcement.type ? `<span style="display:inline-block;padding:2px 8px;background:#f0f9ff;color:#075985;border-radius:4px;font-weight:600;text-transform:capitalize;">${escapeHtml(announcement.type)}</span>` : ""}
      </div>` : ""}
      <div style="white-space:pre-wrap;line-height:1.5;font-size:14px;">${escapeHtml(announcement.content)}</div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="margin:0;font-size:12px;color:#64748b;">
        Property: <strong>${escapeHtml(location)}</strong><br>
        Posted by: ${escapeHtml(senderName || "Property Manager")}<br>
        Delivered via <strong>INTERVOS</strong>.
      </p>
    </div>
  `;

  return { subject, text, html };
};

/**
 * Send an announcement to a property's Condo Control (or equivalent) inbox.
 * Non-throwing: any failure is logged and the caller keeps going — the
 * announcement was already saved on the INTERVOS side and residents still see
 * it in-app.
 *
 * Returns:
 *   { ok: true }                            when the email is dispatched.
 *   { ok: false, reason: 'not-configured' } when the property has no address.
 *   { ok: false, reason: 'mailer-down' }    when SMTP isn't ready.
 *   { ok: false, reason: 'error' }          when sending threw.
 */
export const broadcastAnnouncementToCondoControl = async ({
  announcement,
  propertyId,
  senderName,
}) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, building_name, address, condo_control_email
       FROM properties
       WHERE id = $1`,
      [propertyId]
    );
    const property = rows[0];
    if (!property?.condo_control_email) {
      return { ok: false, reason: "not-configured" };
    }
    if (!isMailerReady()) {
      console.warn("⚠️ Condo Control broadcast skipped — mailer not configured.");
      return { ok: false, reason: "mailer-down" };
    }

    const { subject, text, html } = composeMessage({
      announcement,
      property,
      senderName,
    });

    await sendEmail(property.condo_control_email, subject, text, html);
    console.log(
      `📤 Announcement "${announcement.title}" broadcast to Condo Control at ${property.condo_control_email}`
    );
    return { ok: true };
  } catch (err) {
    console.error("❌ Condo Control broadcast failed:", err.message);
    return { ok: false, reason: "error" };
  }
};
