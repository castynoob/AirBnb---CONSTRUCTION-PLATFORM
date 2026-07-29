// =============================================================================
// Support ticket email bridge
// =============================================================================
//
// One place for every ticket-triggered email. Uses the same SendGrid instance
// as emailConfig.js. Every send is fire-and-forget with a try/catch — an
// email hiccup must NEVER break the ticket API.
//
// Routing:
//   * `SUPPORT_ROUTING_DEFAULT` (required for the emails to send at all) —
//     the catch-all inbox that owns anything without a specific route.
//   * `SUPPORT_ROUTING_<CATEGORY>` (optional) — override the destination for
//     a given category. Case-insensitive. Category comes from the ticket
//     itself (bug, billing, technical, feature_request, account, other, ...).
//     Example: SUPPORT_ROUTING_BILLING=billing@intervos.ai
//   * `SUPPORT_ROUTING_ALWAYS_CC` (optional) — the user's own inbox as a
//     silent watcher on every message, so the founder sees everything even
//     when a category route sends elsewhere.
//
// If `SUPPORT_ROUTING_DEFAULT` isn't set we log a warning and skip — no
// crashes, no half-sent mail. That way you can flip email on/off with a
// single env var.
// =============================================================================

import sgMail from "@sendgrid/mail";

const FROM = process.env.EMAIL_FROM;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// -----------------------------------------------------------------------------
// Routing
// -----------------------------------------------------------------------------
export const routeForCategory = (category) => {
  const defaultTo = process.env.SUPPORT_ROUTING_DEFAULT || null;
  if (!defaultTo) return null; // email disabled

  const cat = String(category || "").toUpperCase().replace(/-/g, "_");
  const override = process.env[`SUPPORT_ROUTING_${cat}`];
  const to = (override && override.trim()) || defaultTo;

  const alwaysCc = (process.env.SUPPORT_ROUTING_ALWAYS_CC || "").trim();
  const cc = alwaysCc && alwaysCc.toLowerCase() !== to.toLowerCase()
    ? [alwaysCc]
    : undefined;

  return { to, cc };
};

// -----------------------------------------------------------------------------
// Templates — deliberately plain. If you want a fancy layout later, swap in
// the same gradient-header pattern used by sendPasswordResetEmail.
// -----------------------------------------------------------------------------
const wrap = (title, bodyHtml) => `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; background-color: #f8f9fb;">
    <div style="background: linear-gradient(135deg, #0D1B2A 0%, #1a3a5c 100%); padding: 24px 32px; border-radius: 10px 10px 0 0;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px;">INTERVOS Support</h1>
      <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px;">${title}</p>
    </div>
    <div style="background-color: #ffffff; padding: 28px 32px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
      ${bodyHtml}
    </div>
    <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 12px 0;">
      &copy; ${new Date().getFullYear()} INTERVOS. This is an automated support notification.
    </p>
  </div>
`;

const ticketMetaRow = (label, value) => `
  <tr>
    <td style="padding: 4px 8px 4px 0; color: #6b7280; font-size: 13px;">${label}</td>
    <td style="padding: 4px 0; color: #0D1B2A; font-size: 13px;"><b>${value}</b></td>
  </tr>
`;

// -----------------------------------------------------------------------------
// Sends
// -----------------------------------------------------------------------------

// New ticket landed → tell the routed admin.
export const emailNewTicketToAdmin = async ({ ticket, user }) => {
  const route = routeForCategory(ticket.category);
  if (!route) return;
  if (!FROM) {
    console.warn("⚠️ EMAIL_FROM not set — skipping support email");
    return;
  }
  const adminUrl = `${FRONTEND_URL}/admin/support/${ticket.id}`;
  const msg = {
    to: route.to,
    ...(route.cc ? { cc: route.cc } : {}),
    from: FROM,
    replyTo: user.email,
    subject: `[Intervos Support #${ticket.ticket_number}] ${ticket.subject}`,
    html: wrap(`New ${String(ticket.priority || "medium").toUpperCase()} ticket from ${user.first_name} ${user.last_name}`, `
      <table style="border-collapse: collapse; margin-bottom: 18px;">
        ${ticketMetaRow("Ticket", `#${ticket.ticket_number}`)}
        ${ticketMetaRow("Category", ticket.category)}
        ${ticketMetaRow("Priority", ticket.priority)}
        ${ticketMetaRow("From", `${user.first_name} ${user.last_name} &lt;${user.email}&gt;`)}
        ${ticketMetaRow("Role", user.role || "—")}
      </table>
      <h3 style="margin: 0 0 8px; color: #0D1B2A; font-size: 16px;">${escapeHtml(ticket.subject)}</h3>
      <div style="white-space: pre-wrap; color: #374151; font-size: 14px; line-height: 1.55; background: #f8f9fb; padding: 14px 16px; border-left: 3px solid #14919B; border-radius: 6px;">${escapeHtml(ticket.description)}</div>
      <p style="margin: 22px 0 0;">
        <a href="${adminUrl}" style="display: inline-block; padding: 10px 22px; background: #14919B; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">Open in Admin</a>
      </p>
      <p style="color: #6b7280; font-size: 12px; margin: 16px 0 0;">Replying to this email will go directly to ${escapeHtml(user.email)}.</p>
    `),
  };
  try {
    await sgMail.send(msg);
    console.log(`✅ Support email → ${route.to} (new ticket #${ticket.ticket_number})`);
  } catch (err) {
    console.error("❌ SendGrid support (new ticket):", err.response?.body || err);
  }
};

// User posted a reply on their own ticket → tell the routed admin.
export const emailUserReplyToAdmin = async ({ ticket, user, messageText }) => {
  const route = routeForCategory(ticket.category);
  if (!route) return;
  if (!FROM) return;
  const adminUrl = `${FRONTEND_URL}/admin/support/${ticket.id}`;
  const msg = {
    to: route.to,
    ...(route.cc ? { cc: route.cc } : {}),
    from: FROM,
    replyTo: user.email,
    subject: `[Intervos Support #${ticket.ticket_number}] Reply from ${user.first_name} ${user.last_name}`,
    html: wrap(`New reply from ${user.first_name} ${user.last_name}`, `
      <p style="color: #6b7280; font-size: 13px; margin: 0 0 4px;">Ticket <b>#${ticket.ticket_number}</b> — ${escapeHtml(ticket.subject)}</p>
      <div style="white-space: pre-wrap; color: #374151; font-size: 14px; line-height: 1.55; background: #f8f9fb; padding: 14px 16px; border-left: 3px solid #14919B; border-radius: 6px; margin: 12px 0 20px;">${escapeHtml(messageText)}</div>
      <a href="${adminUrl}" style="display: inline-block; padding: 10px 22px; background: #14919B; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">Open in Admin</a>
    `),
  };
  try {
    await sgMail.send(msg);
    console.log(`✅ Support email → ${route.to} (user reply on #${ticket.ticket_number})`);
  } catch (err) {
    console.error("❌ SendGrid support (user reply):", err.response?.body || err);
  }
};

// Admin replied on a ticket → notify the user.
export const emailAdminReplyToUser = async ({ ticket, user, messageText }) => {
  if (!FROM) return;
  const userUrl = `${FRONTEND_URL}/customer-service?ticket=${ticket.id}`;
  const msg = {
    to: user.email,
    from: FROM,
    ...(process.env.SUPPORT_ROUTING_DEFAULT ? { replyTo: process.env.SUPPORT_ROUTING_DEFAULT } : {}),
    subject: `[Intervos Support #${ticket.ticket_number}] Update on "${ticket.subject}"`,
    html: wrap(`New response on your ticket`, `
      <p style="color: #6b7280; font-size: 13px; margin: 0 0 4px;">Ticket <b>#${ticket.ticket_number}</b> — ${escapeHtml(ticket.subject)}</p>
      <p style="color: #374151; font-size: 14px; margin: 12px 0 6px;">Our team responded:</p>
      <div style="white-space: pre-wrap; color: #374151; font-size: 14px; line-height: 1.55; background: #f8f9fb; padding: 14px 16px; border-left: 3px solid #14919B; border-radius: 6px; margin: 6px 0 20px;">${escapeHtml(messageText)}</div>
      <a href="${userUrl}" style="display: inline-block; padding: 10px 22px; background: #14919B; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">View & Reply</a>
    `),
  };
  try {
    await sgMail.send(msg);
    console.log(`✅ Support email → ${user.email} (admin reply on #${ticket.ticket_number})`);
  } catch (err) {
    console.error("❌ SendGrid support (admin reply):", err.response?.body || err);
  }
};

// Ticket status changed by an admin → notify the user.
export const emailStatusChangeToUser = async ({ ticket, user, previousStatus }) => {
  if (!FROM) return;
  if (previousStatus === ticket.status) return;
  const userUrl = `${FRONTEND_URL}/customer-service?ticket=${ticket.id}`;
  const pretty = (s) => String(s).replace(/_/g, " ");
  const msg = {
    to: user.email,
    from: FROM,
    ...(process.env.SUPPORT_ROUTING_DEFAULT ? { replyTo: process.env.SUPPORT_ROUTING_DEFAULT } : {}),
    subject: `[Intervos Support #${ticket.ticket_number}] Status changed to "${pretty(ticket.status)}"`,
    html: wrap(`Status update on your ticket`, `
      <p style="color: #6b7280; font-size: 13px; margin: 0 0 4px;">Ticket <b>#${ticket.ticket_number}</b> — ${escapeHtml(ticket.subject)}</p>
      <p style="color: #374151; font-size: 14px; margin: 12px 0 6px;">
        Status: <b style="text-transform: capitalize;">${pretty(previousStatus)}</b> → <b style="text-transform: capitalize; color: #14919B;">${pretty(ticket.status)}</b>
      </p>
      <a href="${userUrl}" style="display: inline-block; padding: 10px 22px; background: #14919B; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 14px;">View Ticket</a>
    `),
  };
  try {
    await sgMail.send(msg);
    console.log(`✅ Support email → ${user.email} (status ${previousStatus} → ${ticket.status} on #${ticket.ticket_number})`);
  } catch (err) {
    console.error("❌ SendGrid support (status change):", err.response?.body || err);
  }
};

// Small HTML escaper — user-supplied text (subject, description, replies) must
// not be rendered raw. No dependency on `he` etc; five-char replace is enough.
function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
