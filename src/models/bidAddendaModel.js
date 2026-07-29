// =============================================================================
// Bid Addenda model — post-submission price adjustments
// =============================================================================
//
// See migration 014 for schema. All queries below take/return plain rows;
// business rules live in the controller.
// =============================================================================

import pool from "../config/db.js";

// Insert a proposed addendum. Caller must have already resolved who the
// proposer is (contractor or PM) — we don't infer from bid ownership here.
export const createAddendum = async ({
  bid_id,
  proposed_by_user_id,
  amount_delta,
  reason,
}) => {
  const { rows } = await pool.query(
    `INSERT INTO bid_addenda (bid_id, proposed_by_user_id, amount_delta, reason)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [bid_id, proposed_by_user_id, amount_delta, reason]
  );
  return rows[0];
};

// Read one addendum by id. Used for auth checks in the controller.
export const getAddendumById = async (id) => {
  const { rows } = await pool.query(
    `SELECT * FROM bid_addenda WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
};

// List all addenda on a bid, newest first. The joined display name (first +
// last) lets the UI render "Proposed by <name>" without a second round-trip.
export const listAddendaByBid = async (bid_id) => {
  const { rows } = await pool.query(
    `SELECT a.*,
            (up.first_name || ' ' || up.last_name)  AS proposed_by_name,
            (ur.first_name || ' ' || ur.last_name)  AS responded_by_name
     FROM bid_addenda a
     LEFT JOIN users up ON up.id = a.proposed_by_user_id
     LEFT JOIN users ur ON ur.id = a.responded_by_user_id
     WHERE a.bid_id = $1
     ORDER BY a.created_at DESC`,
    [bid_id]
  );
  return rows;
};

// Transition an addendum's status. `expectedStatus` guards against races:
// a pending addendum can be accepted/rejected/withdrawn once. Concurrent
// clicks lose the race gracefully (returns null).
export const updateAddendumStatus = async ({
  id,
  new_status,
  responded_by_user_id,
  response_note = null,
  expectedStatus = "pending",
}) => {
  const { rows } = await pool.query(
    `UPDATE bid_addenda
     SET status               = $1,
         responded_by_user_id = $2,
         responded_at         = now(),
         response_note        = COALESCE($3, response_note),
         updated_at           = now()
     WHERE id = $4 AND status = $5
     RETURNING *`,
    [new_status, responded_by_user_id, response_note, id, expectedStatus]
  );
  return rows[0] || null;
};

// Effective bid amount = original bid.amount + SUM(accepted deltas).
// Returns { originalAmount, acceptedDelta, effectiveAmount, pendingCount }.
export const getEffectiveBidAmount = async (bid_id) => {
  const { rows } = await pool.query(
    `SELECT
       b.amount::numeric                                                        AS original_amount,
       COALESCE(SUM(a.amount_delta) FILTER (WHERE a.status = 'accepted'), 0)::numeric AS accepted_delta,
       COUNT(*) FILTER (WHERE a.status = 'pending')::int                        AS pending_count
     FROM bids b
     LEFT JOIN bid_addenda a ON a.bid_id = b.id
     WHERE b.id = $1
     GROUP BY b.amount`,
    [bid_id]
  );
  const row = rows[0];
  if (!row) return null;
  const originalAmount = Number(row.original_amount);
  const acceptedDelta = Number(row.accepted_delta);
  return {
    originalAmount,
    acceptedDelta,
    effectiveAmount: originalAmount + acceptedDelta,
    pendingCount: Number(row.pending_count),
  };
};

// -----------------------------------------------------------------------------
// Admin cross-platform listing
//
// Returns paginated addenda joined with:
//   - bid (amount, status)
//   - job (title, id, urgency)
//   - manager user (name, email)
//   - contractor user (name, email, company_name)
//   - proposed-by / responded-by names (may be either side)
//
// Filters: status, search (matches ticket text — job title, company, names,
// email, or addendum reason), from/to (created_at range).
// -----------------------------------------------------------------------------
export const getAllBidAddendaAdmin = async (filters = {}, { limit = 20, offset = 0 } = {}) => {
  const params = [];
  const where = ["1=1"];

  if (filters.status) {
    params.push(filters.status);
    where.push(`a.status = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    where.push(`a.created_at >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`a.created_at <= $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    const p = `$${params.length}`;
    where.push(`(
      j.title ILIKE ${p} OR
      ep.company_name ILIKE ${p} OR
      mgr.first_name ILIKE ${p} OR mgr.last_name ILIKE ${p} OR mgr.email ILIKE ${p} OR
      con.first_name ILIKE ${p} OR con.last_name ILIKE ${p} OR con.email ILIKE ${p} OR
      a.reason ILIKE ${p}
    )`);
  }

  const whereSql = where.join(" AND ");

  // Bids can be owned by a manager (jobs.manager_id → manager_profiles.user_id)
  // OR by an admin who created the job (jobs.admin_owner_id, a users.id). We
  // LEFT JOIN both and COALESCE display fields so either shape resolves.
  const baseFrom = `
    FROM bid_addenda a
    JOIN bids b ON b.id = a.bid_id
    LEFT JOIN jobs j ON j.id = b.job_id
    LEFT JOIN manager_profiles mp ON mp.id = j.manager_id
    LEFT JOIN users mgr ON mgr.id = COALESCE(mp.user_id, j.admin_owner_id)
    LEFT JOIN entrepreneur_profiles ep ON ep.id = b.entrepreneur_id
    LEFT JOIN users con ON con.id = ep.user_id
    LEFT JOIN users up ON up.id = a.proposed_by_user_id
    LEFT JOIN users ur ON ur.id = a.responded_by_user_id
    WHERE ${whereSql}
  `;

  const countRes = await pool.query(`SELECT COUNT(*)::int AS total ${baseFrom}`, params);
  const total = countRes.rows[0]?.total || 0;

  params.push(limit);
  params.push(offset);
  const rowsRes = await pool.query(
    `SELECT
       a.id, a.bid_id, a.amount_delta, a.reason, a.status,
       a.response_note, a.created_at, a.responded_at,
       (up.first_name || ' ' || up.last_name) AS proposed_by_name,
       up.email AS proposed_by_email,
       (ur.first_name || ' ' || ur.last_name) AS responded_by_name,
       b.amount AS bid_amount, b.status AS bid_status,
       j.id AS job_id, j.title AS job_title, j.urgency AS job_urgency,
       (mgr.first_name || ' ' || mgr.last_name) AS manager_name,
       mgr.email AS manager_email,
       (con.first_name || ' ' || con.last_name) AS contractor_name,
       con.email AS contractor_email,
       ep.company_name AS contractor_company
     ${baseFrom}
     ORDER BY a.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    addenda: rowsRes.rows,
    pagination: {
      total,
      limit,
      offset,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// Admin summary — status counts + total accepted $ delta over a window.
export const getBidAddendaStats = async () => {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending')::int    AS pending,
       COUNT(*) FILTER (WHERE status = 'accepted')::int   AS accepted,
       COUNT(*) FILTER (WHERE status = 'rejected')::int   AS rejected,
       COUNT(*) FILTER (WHERE status = 'withdrawn')::int  AS withdrawn,
       COALESCE(SUM(amount_delta) FILTER (WHERE status = 'accepted'), 0)::numeric AS accepted_delta_total,
       COUNT(*) FILTER (WHERE status = 'pending' AND created_at < NOW() - INTERVAL '48 hours')::int AS stale_pending
     FROM bid_addenda`
  );
  return rows[0];
};

// Quick guard used by the bid-approval flow: does this bid have any addendum
// still awaiting a response?
export const hasPendingAddenda = async (bid_id) => {
  const { rows } = await pool.query(
    `SELECT 1 FROM bid_addenda WHERE bid_id = $1 AND status = 'pending' LIMIT 1`,
    [bid_id]
  );
  return rows.length > 0;
};
