// =============================================================================
// Bid Addenda controller
// =============================================================================
//
// Endpoints (all require verifyToken; role check happens per-endpoint):
//   GET    /api/bids/:bidId/addenda
//   POST   /api/bids/:bidId/addenda                  { amount_delta, reason }
//   PATCH  /api/bids/:bidId/addenda/:id/accept        { response_note? }
//   PATCH  /api/bids/:bidId/addenda/:id/reject        { response_note? }
//   PATCH  /api/bids/:bidId/addenda/:id/withdraw
//
// Authorization rule: only the contractor who submitted the bid AND the PM
// who owns the job can touch its addenda. Any other user gets 403.
//
// Business rules:
//   * Both sides can PROPOSE. The counterparty is the responder.
//   * You can't respond to your own proposal (that's a withdraw).
//   * Withdrawing is allowed only by the proposer, only while pending.
//   * Accepting/rejecting is one-shot: guarded by expectedStatus in the model.
// =============================================================================

import pool from "../config/db.js";
import * as Addenda from "../models/bidAddendaModel.js";
import { createNotification } from "./notificationController.js";
import { sendEmail, isMailerReady } from "../services/mailerService.js";
import { getIO } from "../config/socketSetup.js";

// ---------------------------------------------------------------------------
// Small helper: look up both sides of a bid — the contractor (user_id behind
// entrepreneur_profiles) and the PM (user_id behind manager_profiles). Used
// for auth checks + to know who to notify on each addendum action.
// ---------------------------------------------------------------------------
const resolveBidParties = async (bid_id) => {
  const { rows } = await pool.query(
    `SELECT b.id                                AS bid_id,
            b.amount                            AS bid_amount,
            b.status                            AS bid_status,
            b.entrepreneur_id,
            ep.user_id                          AS contractor_user_id,
            j.title                             AS job_title,
            j.manager_id,
            mp.user_id                          AS manager_user_id,
            j.admin_owner_id
     FROM bids b
     JOIN jobs j                     ON j.id = b.job_id
     JOIN entrepreneur_profiles ep   ON ep.id = b.entrepreneur_id
     LEFT JOIN manager_profiles mp   ON mp.id = j.manager_id
     WHERE b.id = $1`,
    [bid_id]
  );
  return rows[0] || null;
};

const isPartyToBid = (parties, userId) =>
  parties && (parties.contractor_user_id === userId || parties.manager_user_id === userId);

const counterpartyOf = (parties, userId) =>
  parties.contractor_user_id === userId
    ? parties.manager_user_id
    : parties.contractor_user_id;

// ---------------------------------------------------------------------------
// Notifications — same pattern as new-bid notifications (bell + email).
// Fire-and-forget: mail/socket failures don't roll back the DB write.
// ---------------------------------------------------------------------------
const notifyAddendumEvent = async ({
  parties,
  addendum,
  recipientUserId,
  actorName,
  eventLabel, // "proposed" | "accepted" | "rejected" | "withdrew"
}) => {
  try {
    // Bell notification (uses the same notifications table entrepreneurs and
    // managers already read).
    await createNotification({
      userId: recipientUserId,
      type: "bid_addendum",
      senderId: addendum.responded_by_user_id || addendum.proposed_by_user_id,
      senderName: actorName,
      content: `${actorName} ${eventLabel} a bid addendum (${addendum.amount_delta >= 0 ? "+" : ""}$${Number(addendum.amount_delta).toFixed(2)}): ${addendum.reason}`,
      jobId: null,
      jobTitle: parties.job_title,
    });
  } catch (err) {
    console.error("⚠️ Addendum bell notification failed:", err.message);
  }

  // Socket emit for real-time UI updates on the recipient's open pages.
  try {
    const io = getIO();
    if (io && recipientUserId) {
      io.to(recipientUserId.toString()).emit("bid_addendum", {
        bidId: parties.bid_id,
        addendumId: addendum.id,
        eventLabel,
      });
    }
  } catch (_) {}

  // Email is best-effort; the message body mirrors the bell copy.
  if (!isMailerReady() || !recipientUserId) return;
  try {
    const {
      rows: [u],
    } = await pool.query(
      `SELECT email, first_name, email_notifications FROM users WHERE id = $1`,
      [recipientUserId]
    );
    if (!u?.email || u.email_notifications === false) return;

    const subject = `Bid addendum ${eventLabel} — ${parties.job_title || "your bid"}`;
    const text =
      `Hi ${u.first_name || "there"},\n\n` +
      `${actorName} ${eventLabel} a bid addendum on your bid` +
      (parties.job_title ? ` for "${parties.job_title}"` : "") +
      `.\n\n` +
      `Adjustment: ${addendum.amount_delta >= 0 ? "+" : ""}$${Number(addendum.amount_delta).toFixed(2)}\n` +
      `Reason: ${addendum.reason}\n\n` +
      `Open Intervos to review and respond.\n\n— Intervos`;
    await sendEmail(u.email, subject, text);
  } catch (err) {
    console.error("⚠️ Addendum email failed:", err.message);
  }
};

const displayNameForUser = async (userId) => {
  const {
    rows: [u],
  } = await pool.query(
    `SELECT first_name, last_name FROM users WHERE id = $1`,
    [userId]
  );
  if (!u) return "Someone";
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || "Someone";
};

// ============================================================================
// Handlers
// ============================================================================

// GET /api/bids/:bidId/addenda
export const listAddenda = async (req, res) => {
  try {
    const parties = await resolveBidParties(req.params.bidId);
    if (!parties) return res.status(404).json({ message: "Bid not found." });
    if (!isPartyToBid(parties, req.user.id)) {
      return res.status(403).json({ message: "Not authorized." });
    }
    const addenda = await Addenda.listAddendaByBid(req.params.bidId);
    const effective = await Addenda.getEffectiveBidAmount(req.params.bidId);
    return res.json({ addenda, effective });
  } catch (err) {
    console.error("❌ listAddenda:", err);
    return res.status(500).json({ message: err.message });
  }
};

// POST /api/bids/:bidId/addenda   { amount_delta, reason }
export const proposeAddendum = async (req, res) => {
  try {
    const { amount_delta, reason } = req.body || {};
    if (amount_delta == null || Number.isNaN(Number(amount_delta))) {
      return res.status(400).json({ message: "amount_delta is required and must be numeric." });
    }
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ message: "reason is required — explain what changed and why." });
    }
    const parties = await resolveBidParties(req.params.bidId);
    if (!parties) return res.status(404).json({ message: "Bid not found." });
    if (!isPartyToBid(parties, req.user.id)) {
      return res.status(403).json({ message: "Not authorized." });
    }
    // Refuse to add addenda to a bid that's already been approved/declined —
    // negotiation window is closed at that point.
    const bidStatus = String(parties.bid_status || "").toLowerCase();
    if (bidStatus !== "pending" && bidStatus !== "under_review") {
      return res.status(400).json({
        message: `Cannot add an addendum — this bid is already ${bidStatus}.`,
      });
    }

    const addendum = await Addenda.createAddendum({
      bid_id: req.params.bidId,
      proposed_by_user_id: req.user.id,
      amount_delta: Number(amount_delta),
      reason: String(reason).trim(),
    });

    const actorName = await displayNameForUser(req.user.id);
    const recipientUserId = counterpartyOf(parties, req.user.id);
    await notifyAddendumEvent({
      parties,
      addendum,
      recipientUserId,
      actorName,
      eventLabel: "proposed",
    });

    return res.status(201).json({ addendum });
  } catch (err) {
    console.error("❌ proposeAddendum:", err);
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/bids/:bidId/addenda/:id/accept    { response_note? }
// PATCH /api/bids/:bidId/addenda/:id/reject    { response_note? }
const respondFactory = (new_status, verb) => async (req, res) => {
  try {
    const parties = await resolveBidParties(req.params.bidId);
    if (!parties) return res.status(404).json({ message: "Bid not found." });
    if (!isPartyToBid(parties, req.user.id)) {
      return res.status(403).json({ message: "Not authorized." });
    }
    const addendum = await Addenda.getAddendumById(req.params.id);
    if (!addendum || addendum.bid_id !== req.params.bidId) {
      return res.status(404).json({ message: "Addendum not found for this bid." });
    }
    if (addendum.status !== "pending") {
      return res.status(400).json({
        message: `This addendum is already ${addendum.status} — nothing to ${verb}.`,
      });
    }
    if (addendum.proposed_by_user_id === req.user.id) {
      return res.status(400).json({
        message: "You proposed this addendum. Withdraw it instead of responding to it.",
      });
    }

    const updated = await Addenda.updateAddendumStatus({
      id: req.params.id,
      new_status,
      responded_by_user_id: req.user.id,
      response_note: req.body?.response_note || null,
      expectedStatus: "pending",
    });
    if (!updated) {
      // Lost the race — another tab responded first.
      return res.status(409).json({ message: "Addendum was already updated. Refresh and try again." });
    }

    const actorName = await displayNameForUser(req.user.id);
    await notifyAddendumEvent({
      parties,
      addendum: updated,
      recipientUserId: addendum.proposed_by_user_id,
      actorName,
      eventLabel: new_status, // "accepted" or "rejected"
    });

    return res.json({ addendum: updated });
  } catch (err) {
    console.error(`❌ ${verb}Addendum:`, err);
    return res.status(500).json({ message: err.message });
  }
};

export const acceptAddendum = respondFactory("accepted", "accept");
export const rejectAddendum = respondFactory("rejected", "reject");

// PATCH /api/bids/:bidId/addenda/:id/withdraw
export const withdrawAddendum = async (req, res) => {
  try {
    const parties = await resolveBidParties(req.params.bidId);
    if (!parties) return res.status(404).json({ message: "Bid not found." });
    if (!isPartyToBid(parties, req.user.id)) {
      return res.status(403).json({ message: "Not authorized." });
    }
    const addendum = await Addenda.getAddendumById(req.params.id);
    if (!addendum || addendum.bid_id !== req.params.bidId) {
      return res.status(404).json({ message: "Addendum not found for this bid." });
    }
    if (addendum.proposed_by_user_id !== req.user.id) {
      return res.status(403).json({ message: "Only the proposer can withdraw an addendum." });
    }
    if (addendum.status !== "pending") {
      return res.status(400).json({ message: `This addendum is already ${addendum.status}.` });
    }

    const updated = await Addenda.updateAddendumStatus({
      id: req.params.id,
      new_status: "withdrawn",
      responded_by_user_id: req.user.id,
      expectedStatus: "pending",
    });
    if (!updated) {
      return res.status(409).json({ message: "Addendum was already updated. Refresh and try again." });
    }

    const actorName = await displayNameForUser(req.user.id);
    await notifyAddendumEvent({
      parties,
      addendum: updated,
      recipientUserId: counterpartyOf(parties, req.user.id),
      actorName,
      eventLabel: "withdrew",
    });

    return res.json({ addendum: updated });
  } catch (err) {
    console.error("❌ withdrawAddendum:", err);
    return res.status(500).json({ message: err.message });
  }
};
