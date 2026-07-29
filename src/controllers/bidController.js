// src/controllers/bidController.js
import pool from "../config/db.js";
import * as Bid from "../models/bidModel.js";
import { incrementBidCount } from "../middleware/subscriptionMiddleware.js";
import { getIO } from "../config/socketSetup.js";
import { createNotification } from "./notificationController.js";
import {
  createUserActivityLog,
  ActivityActions,
  EntityTypes,
} from "../models/userActivityModel.js";

// 🟢 Submit a new bid (Entrepreneur only)
export const submitBid = async (req, res) => {
  try {
    const { job_id, amount, message } = req.body;

    console.log('\n========================================');
    console.log('🔍 BID SUBMISSION DEBUG');
    console.log('========================================');
    console.log('📋 Job ID from request:', job_id);
    console.log('💰 Amount:', amount);
    console.log('👤 User ID from token:', req.user.id);
    console.log('🏢 Entrepreneur ID from middleware:', req.entrepreneur_profile_id);

    // Validate required fields
    if (!job_id || !amount) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ 
        message: "Job ID and amount are required" 
      });
    }

    const entrepreneur_id = req.entrepreneur_profile_id;

    // Starter plan: cannot bid on projects over $2,500
    if (req.subscription.plan_type === 'starter') {
      const jobBudgetQuery = await pool.query(
        `SELECT budget_min, budget_max FROM jobs WHERE id = $1`,
        [job_id]
      );
      if (jobBudgetQuery.rows[0]) {
        const jobBudget = parseFloat(jobBudgetQuery.rows[0].budget_max || jobBudgetQuery.rows[0].budget_min || 0);
        if (jobBudget > 2500) {
          return res.status(403).json({
            message: "Starter plan cannot bid on projects over $2,500. Upgrade to Basic or Premium to bid on larger projects.",
            action: 'upgrade_plan'
          });
        }
      }
    }

    // Note: Stripe Connect onboarding is optional at bid time
    // Entrepreneur will be prompted to complete it after bid approval
    console.log('\n🔍 Checking for existing bid...');
    console.log('   - job_id:', job_id);
    console.log('   - entrepreneur_id:', entrepreneur_id);

    // Check if entrepreneur already bid on this job
    const existingBid = await pool.query(
      `SELECT id, created_at FROM bids WHERE job_id = $1 AND entrepreneur_id = $2`,
      [job_id, entrepreneur_id]
    );

    console.log('\n📊 Database query result:');
    console.log('   Rows found:', existingBid.rows.length);
    if (existingBid.rows.length > 0) {
      console.log('   Existing bid:', existingBid.rows[0]);
    }

    if (existingBid.rows[0]) {
      console.log('\n❌ BLOCKING BID - Already exists!');
      console.log('========================================\n');
      return res.status(400).json({ 
        message: "You have already submitted a bid for this job",
        debug: {
          existing_bid_id: existingBid.rows[0].id,
          created_at: existingBid.rows[0].created_at
        }
      });
    }

    console.log('\n✅ No existing bid found - Creating new bid...');

    // Create the bid
    const newBid = await Bid.createBid({
      job_id,
      entrepreneur_id,
      amount,
      message: message || ""
    });

    console.log('✅ Bid created successfully:', newBid.id);

    // Increment bid count for starter and basic plan users
    const { plan_type } = req.subscription;
    if (plan_type === 'starter' || plan_type === 'basic') {
      const bidLimit = plan_type === 'starter' ? 15 : 30;
      await incrementBidCount(entrepreneur_id);
      req.bidsRemaining = req.bidsRemaining - 1;
      console.log(`📊 Bid count incremented: ${(bidLimit - req.bidsRemaining)}/${bidLimit}`);
    }

    // 🔔 Send socket notification to whichever owner the job belongs to.
    //   * Manager-owned job → notify the PM (legacy path)
    //   * Admin-owned job   → notify the admin (new path, via admin_user_id)
    try {
      // Get job + owner info. admin_owner_id is set for admin-owned jobs.
      const jobResult = await pool.query(
        `SELECT j.title, j.manager_id, j.admin_owner_id,
                p.building_name,
                u.id as manager_user_id
         FROM jobs j
         LEFT JOIN properties p ON j.property_id = p.id
         LEFT JOIN manager_profiles mp ON j.manager_id = mp.id
         LEFT JOIN users u ON mp.user_id = u.id
         WHERE j.id = $1`,
        [job_id]
      );

      // Get entrepreneur details
      const entrepreneurResult = await pool.query(
        `SELECT u.id as user_id, u.first_name, u.last_name, ep.license_number, ep.company_name
         FROM entrepreneur_profiles ep
         JOIN users u ON ep.user_id = u.id
         WHERE ep.id = $1`,
        [entrepreneur_id]
      );

      if (jobResult.rows[0] && entrepreneurResult.rows[0]) {
        const job = jobResult.rows[0];
        const entrepreneur = entrepreneurResult.rows[0];
        const io = getIO();
        const displayName = entrepreneur.company_name || `${entrepreneur.first_name} ${entrepreneur.last_name}`;

        // Build the payload once — reused for socket emit + DB persist.
        const newBidPayload = {
          bidId: newBid.id,
          bidderName: displayName,
          bidderId: entrepreneur_id,
          jobId: job_id,
          jobTitle: job.title,
          propertyName: job.building_name || '',
          bidAmount: amount,
          licenseNumber: entrepreneur.license_number || 'N/A',
        };

        // ────────────────────────────────────────────────────────────────
        // Path 1: PM-owned job
        // ────────────────────────────────────────────────────────────────
        if (job.manager_user_id) {
          if (io) {
            const managerRoom = job.manager_user_id.toString();
            io.to(managerRoom).emit('new_bid', newBidPayload);
            console.log('✅ new_bid emitted to manager room:', managerRoom);
          }
          try {
            await createNotification({
              userId: job.manager_user_id,
              type: 'bid',
              bidderId: entrepreneur.user_id,
              bidderName: displayName,
              jobId: job_id,
              jobTitle: job.title,
              propertyName: job.building_name || '',
              bidAmount: amount,
              licenseNumber: entrepreneur.license_number || 'N/A',
            });
            console.log(`💾 Bid notification saved for manager ${job.manager_user_id}`);
          } catch (notifDbError) {
            console.error('❌ Failed to save manager bid notification:', notifDbError);
          }
        }

        // ────────────────────────────────────────────────────────────────
        // Path 2: Admin-owned job
        // Notify via the admin socket room (we use the admin user id as the
        // room name on connect) + persist a row with admin_user_id set.
        // ────────────────────────────────────────────────────────────────
        if (job.admin_owner_id) {
          if (io) {
            const adminRoom = `admin:${job.admin_owner_id}`;
            io.to(adminRoom).emit('new_bid', newBidPayload);
            console.log('✅ new_bid emitted to admin room:', adminRoom);
          }
          try {
            await createNotification({
              adminUserId: job.admin_owner_id,
              type: 'bid',
              bidderId: entrepreneur.user_id,
              bidderName: displayName,
              jobId: job_id,
              jobTitle: job.title,
              propertyName: job.building_name || '',
              bidAmount: amount,
              licenseNumber: entrepreneur.license_number || 'N/A',
            });
            console.log(`💾 Bid notification saved for admin ${job.admin_owner_id}`);
          } catch (notifDbError) {
            console.error('❌ Failed to save admin bid notification:', notifDbError);
          }
        }
      }
    } catch (notifyError) {
      // Don't fail the bid submission if notification fails
      console.error('⚠️ Failed to send bid notification:', notifyError.message);
    }

    console.log('========================================\n');

    // Log user activity
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    await createUserActivityLog(
      req.user.id,
      ActivityActions.BID_SUBMITTED,
      EntityTypes.BID,
      newBid.id,
      { job_id: job_id, amount: amount },
      ipAddress,
      userAgent
    );

    res.status(201).json({
      message: "Bid submitted successfully",
      bid: newBid,
      subscription: {
        plan_type: plan_type,
        bids_remaining: req.bidsRemaining
      }
    });

  } catch (err) {
    console.error("❌ Error submitting bid:", err);
    console.log('========================================\n');
    res.status(500).json({ message: "Server error" });
  }
};

// ============================================
// 🚀 OPTIMIZED: Get ALL submissions for manager in ONE query
// Replaces the N+1 fetching pattern (jobs → bids → properties → reviews → contracts)
// ============================================
export const getManagerSubmissions = async (req, res) => {
  try {
    const { cursor, limit: rawLimit, status } = req.query;
    const limit = Math.min(parseInt(rawLimit) || 50, 100);

    // Get manager profile
    const managerResult = await pool.query(
      `SELECT id FROM manager_profiles WHERE user_id = $1`,
      [req.user.id]
    );
    if (!managerResult.rows[0]) {
      return res.status(403).json({ message: "Manager profile not found" });
    }
    const managerId = managerResult.rows[0].id;

    // Build WHERE clause for optional status filter
    const managerUserId = req.user.id;
    const conditions = [`j.manager_id = $1`, `b.status != 'declined'`, `(j.is_archived = false OR j.is_archived IS NULL)`];
    const params = [managerId];
    let paramIndex = 2;

    if (status && status !== 'all') {
      conditions.push(`b.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    // Cursor-based pagination (by bid created_at)
    if (cursor) {
      conditions.push(`b.created_at < $${paramIndex}`);
      params.push(new Date(cursor));
      paramIndex++;
    }

    // Single query: jobs + bids + entrepreneur profiles + properties + reviews + contracts
    const query = `
      SELECT
        -- Bid data
        b.id AS bid_id, b.job_id AS bid_job_id, b.entrepreneur_id, b.amount AS bid_amount,
        b.message AS bid_message, b.status AS bid_status,
        b.timeline_days AS bid_timeline_days,
        b.created_at AS bid_created_at, b.updated_at AS bid_updated_at,

        -- Job data
        j.id AS job_id, j.title AS job_title, j.description AS job_description,
        j.category, j.urgency, j.budget_min, j.budget_max,
        j.is_budget_hidden, j.is_emergency, j.status AS job_status,
        j.due_date, j.estimated_duration_days, j.property_id,
        j.manager_id, j.unit_id,
        j.created_at AS job_created_at, j.updated_at AS job_updated_at,

        -- Entrepreneur profile
        ep.user_id AS entrepreneur_user_id,
        ep.company_name, ep.license_number, ep.years_in_business,
        ep.specializations, ep.average_rating, ep.total_reviews,

        -- Entrepreneur user info
        u.first_name, u.last_name, u.email,

        -- Property info
        p.building_name AS property_building_name,
        p.address AS property_address,
        p.city AS property_city,
        p.province AS property_province,

        -- My review (PM's review of the entrepreneur)
        r.id AS review_id, r.rating AS review_rating,
        r.comment AS review_comment, r.review_created_at,
        r.rating_quality AS review_rating_quality, r.rating_timeliness AS review_rating_timeliness,
        r.rating_communication AS review_rating_communication, r.rating_value AS review_rating_value,

        -- Review received (entrepreneur's review of the PM)
        rr.id AS received_review_id, rr.rating AS received_review_rating,
        rr.comment AS received_review_comment, rr.received_review_created_at,
        rr.rating_quality AS received_review_rating_quality, rr.rating_timeliness AS received_review_rating_timeliness,
        rr.rating_communication AS received_review_rating_communication, rr.rating_value AS received_review_rating_value,

        -- Contract (for the job, if exists)
        c.id AS contract_id, c.status AS contract_status,
        c.contract_amount, c.contract_created_at,
        c.manager_completion_confirmed, c.contractor_completion_confirmed,
        c.mutual_confirmation_completed_at,
        c.manager_confirmed_at, c.contractor_confirmed_at,
        c.manager_completion_note, c.contractor_completion_note,
        -- Invoice (filled by contractor before completion)
        c.invoice_submitted_at, c.invoice_subtotal, c.invoice_gst,
        c.invoice_qst, c.invoice_total, c.invoice_notes,
        c.invoice_document_id, c.invoice_file_url, c.invoice_file_name

      FROM bids b
      JOIN jobs j ON b.job_id = j.id
      JOIN entrepreneur_profiles ep ON b.entrepreneur_id = ep.id
      JOIN users u ON ep.user_id = u.id
      LEFT JOIN properties p ON j.property_id = p.id
      LEFT JOIN LATERAL (
        SELECT id, rating, comment, created_at AS review_created_at,
               rating_quality, rating_timeliness, rating_communication, rating_value
        FROM reviews
        WHERE job_id = j.id AND reviewer_id = '${managerUserId.replace(/'/g, "''")}'::uuid
        ORDER BY created_at DESC
        LIMIT 1
      ) r ON true
      LEFT JOIN LATERAL (
        SELECT id, rating, comment, created_at AS received_review_created_at,
               rating_quality, rating_timeliness, rating_communication, rating_value
        FROM reviews
        WHERE job_id = j.id AND reviewed_user_id = '${managerUserId.replace(/'/g, "''")}'::uuid
        ORDER BY created_at DESC
        LIMIT 1
      ) rr ON true
      LEFT JOIN LATERAL (
        SELECT contracts.id, contracts.status, contracts.contract_amount,
               contracts.created_at AS contract_created_at,
               contracts.manager_completion_confirmed, contracts.contractor_completion_confirmed,
               contracts.mutual_confirmation_completed_at,
               contracts.manager_confirmed_at, contracts.contractor_confirmed_at,
               contracts.manager_completion_note, contracts.contractor_completion_note,
               contracts.invoice_submitted_at, contracts.invoice_subtotal,
               contracts.invoice_gst, contracts.invoice_qst, contracts.invoice_total,
               contracts.invoice_notes, contracts.invoice_document_id,
               d.file_url AS invoice_file_url, d.file_name AS invoice_file_name
        FROM contracts
        LEFT JOIN documents d ON contracts.invoice_document_id = d.id
        WHERE contracts.job_id = j.id
        ORDER BY contracts.created_at DESC
        LIMIT 1
      ) c ON true
      WHERE ${conditions.join(' AND ')}
      ORDER BY b.created_at DESC
      LIMIT $${paramIndex}
    `;
    params.push(limit + 1); // fetch one extra to check if there's a next page

    const result = await pool.query(query, params);
    const rows = result.rows;

    // Check if there's more data
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    // Get next cursor
    const nextCursor = hasMore ? data[data.length - 1].bid_created_at.toISOString() : null;

    // Transform rows into the shape the frontend expects
    const submissions = data.map(row => ({
      bid: {
        id: row.bid_id,
        job_id: row.bid_job_id,
        entrepreneur_id: row.entrepreneur_id,
        amount: row.bid_amount,
        message: row.bid_message,
        status: row.bid_status,
        // Entrepreneur's proposed delivery timeline (from the bid form). Was
        // missing here previously, which is why the manager's Bid Details modal
        // showed "N/A jours" even when the contractor entered a value.
        timeline_days: row.bid_timeline_days,
        created_at: row.bid_created_at,
        updated_at: row.bid_updated_at,
      },
      job: {
        id: row.job_id,
        title: row.job_title,
        description: row.job_description,
        category: row.category,
        urgency: row.urgency,
        budget_min: row.budget_min,
        budget_max: row.budget_max,
        is_budget_hidden: row.is_budget_hidden,
        is_emergency: row.is_emergency,
        status: row.job_status,
        due_date: row.due_date,
        estimated_duration_days: row.estimated_duration_days,
        property_id: row.property_id,
        manager_id: row.manager_id,
        unit_id: row.unit_id,
        created_at: row.job_created_at,
        updated_at: row.job_updated_at,
      },
      entrepreneur_profile: {
        id: row.entrepreneur_id,
        user_id: row.entrepreneur_user_id,
        entrepreneur_user_id: row.entrepreneur_user_id,
        company_name: row.company_name,
        license_number: row.license_number,
        years_in_business: row.years_in_business,
        specializations: row.specializations || [],
        average_rating: row.average_rating,
        total_reviews: row.total_reviews,
      },
      user: {
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
      },
      property_name: row.property_building_name || row.property_address || 'Unknown Property',
      property_address: row.property_address
        ? `${row.property_address}, ${row.property_city || ''}, ${row.property_province || ''}`.replace(/, ,/g, ',').replace(/,$/, '')
        : 'Unknown Location',
      review: row.review_id ? {
        id: row.review_id,
        rating: row.review_rating,
        comment: row.review_comment,
        created_at: row.review_created_at,
        rating_quality: row.review_rating_quality,
        rating_timeliness: row.review_rating_timeliness,
        rating_communication: row.review_rating_communication,
        rating_value: row.review_rating_value,
      } : null,
      received_review: row.received_review_id ? {
        id: row.received_review_id,
        rating: row.received_review_rating,
        comment: row.received_review_comment,
        created_at: row.received_review_created_at,
        rating_quality: row.received_review_rating_quality,
        rating_timeliness: row.received_review_rating_timeliness,
        rating_communication: row.received_review_rating_communication,
        rating_value: row.received_review_rating_value,
      } : null,
      contract: row.contract_id ? {
        id: row.contract_id,
        status: row.contract_status,
        contract_amount: row.contract_amount,
        created_at: row.contract_created_at,
        manager_completion_confirmed: row.manager_completion_confirmed,
        contractor_completion_confirmed: row.contractor_completion_confirmed,
        mutual_confirmation_completed_at: row.mutual_confirmation_completed_at,
        manager_confirmed_at: row.manager_confirmed_at,
        contractor_confirmed_at: row.contractor_confirmed_at,
        manager_completion_note: row.manager_completion_note,
        contractor_completion_note: row.contractor_completion_note,
        // Invoice (null until contractor submits)
        invoice_submitted_at: row.invoice_submitted_at,
        invoice_subtotal: row.invoice_subtotal != null ? parseFloat(row.invoice_subtotal) : null,
        invoice_gst:      row.invoice_gst      != null ? parseFloat(row.invoice_gst)      : null,
        invoice_qst:      row.invoice_qst      != null ? parseFloat(row.invoice_qst)      : null,
        invoice_total:    row.invoice_total    != null ? parseFloat(row.invoice_total)    : null,
        invoice_notes:    row.invoice_notes,
        invoice_document_id: row.invoice_document_id,
        invoice_file_url:    row.invoice_file_url,
        invoice_file_name:   row.invoice_file_name,
      } : null,
    }));

    // Also return status counts in one query. Each bucket must match what
    // the frontend tab actually shows: the client filters on job.status, so
    // the counts filter on job.status too (previously `approved` counted
    // every b.status = 'approved' row regardless of where the job was in
    // its lifecycle — leaving stale +1s on tabs whose list was empty).
    const countsResult = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE b.status != 'declined') AS total,
        COUNT(*) FILTER (WHERE b.status = 'pending') AS open,
        COUNT(*) FILTER (WHERE j.status = 'accepted' AND b.status = 'approved') AS approved,
        COUNT(*) FILTER (WHERE j.status = 'ongoing' AND b.status = 'approved') AS ongoing,
        COUNT(*) FILTER (WHERE j.status = 'completed' AND b.status = 'approved') AS completed,
        COUNT(*) FILTER (WHERE j.is_archived = true AND b.status != 'declined') AS archived
      FROM bids b
      JOIN jobs j ON b.job_id = j.id
      WHERE j.manager_id = $1`,
      [managerId]
    );

    res.json({
      submissions,
      pagination: {
        limit,
        hasMore,
        nextCursor,
      },
      counts: countsResult.rows[0] || {},
    });
  } catch (err) {
    console.error("❌ Error in getManagerSubmissions:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Keep all your other functions exactly as they are
// (getBidsForJob, getMyBids, approveBid, declineBid, toggleFavorite)

// 🟡 Get all bids for a job (Manager only)
export const getBidsForJob = async (req, res) => {
  try {
    const { job_id } = req.params;

    const managerProfile = await pool.query(
      `SELECT id FROM manager_profiles WHERE user_id = $1`,
      [req.user.id]
    );

    if (!managerProfile.rows[0]) {
      return res.status(403).json({ message: "Manager profile not found" });
    }

    const job = await pool.query(
      `SELECT * FROM jobs WHERE id = $1 AND manager_id = $2`,
      [job_id, managerProfile.rows[0].id]
    );

    if (!job.rows[0]) {
      return res.status(403).json({ 
        message: "You can only view bids for your own jobs" 
      });
    }

    const bids = await Bid.getBidsByJobId(job_id);

    res.json({ 
      job: job.rows[0],
      bids,
      total_bids: bids.length
    });

  } catch (err) {
    console.error("❌ Error getting bids:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔵 Get entrepreneur's own bids
export const getMyBids = async (req, res) => {
  try {
    const entrepreneurProfile = await pool.query(
      `SELECT id FROM entrepreneur_profiles WHERE user_id = $1`,
      [req.user.id]
    );

    if (!entrepreneurProfile.rows[0]) {
      return res.status(403).json({ 
        message: "Entrepreneur profile not found" 
      });
    }

    const bids = await Bid.getBidsByEntrepreneurId(
      entrepreneurProfile.rows[0].id
    );

    const pending = bids.filter(b => b.status === 'pending');
    const approved = bids.filter(b => b.status === 'approved');
    const declined = bids.filter(b => b.status === 'declined');

    res.json({ 
      bids: {
        all: bids,
        pending,
        approved,
        declined
      },
      summary: {
        total: bids.length,
        pending: pending.length,
        approved: approved.length,
        declined: declined.length
      }
    });

  } catch (err) {
    console.error("❌ Error getting my bids:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🟣 Approve bid (Manager only)
export const approveBid = async (req, res) => {
  try {
    const { id } = req.params;

    const bid = await Bid.getBidById(id);
    if (!bid) {
      return res.status(404).json({ message: "Bid not found" });
    }

    if (bid.status === 'approved') {
      return res.status(400).json({ message: "Bid is already approved" });
    }

    // Approval guard: refuse to approve while there are pending addenda.
    // The PM must accept or reject each proposed price adjustment first,
    // otherwise the "approved amount" is ambiguous.
    try {
      const { hasPendingAddenda, getEffectiveBidAmount } = await import("../models/bidAddendaModel.js");
      if (await hasPendingAddenda(id)) {
        const eff = await getEffectiveBidAmount(id);
        return res.status(400).json({
          code: "pending_addenda",
          message:
            "This bid has pending addenda that need a decision first. Accept or reject them before approving the bid.",
          pending_count: eff?.pendingCount || 1,
        });
      }
    } catch (guardErr) {
      // Guard failure shouldn't block approval — log and continue so PMs
      // aren't stranded by an unrelated addenda-table issue.
      console.error("⚠️ Addenda approval guard skipped:", guardErr.message);
    }

    const managerProfile = await pool.query(
      `SELECT id FROM manager_profiles WHERE user_id = $1`,
      [req.user.id]
    );

    if (!managerProfile.rows[0]) {
      return res.status(403).json({ message: "Manager profile not found" });
    }

    const job = await pool.query(
      `SELECT j.*, p.building_name FROM jobs j
       LEFT JOIN properties p ON j.property_id = p.id
       WHERE j.id = $1 AND j.manager_id = $2`,
      [bid.job_id, managerProfile.rows[0].id]
    );

    if (!job.rows[0]) {
      return res.status(403).json({
        message: "You can only approve bids for your own jobs"
      });
    }

    const updatedBid = await Bid.updateBidStatus(id, "approved");

    // Decline all other pending bids for this job
    const declinedBids = await Bid.declineOtherBids(bid.job_id, id);
    console.log(`📋 Declined ${declinedBids.length} other bid(s) for job ${bid.job_id}`);

    // 🔔 Send notifications to entrepreneurs
    try {
      const io = getIO();
      const jobData = job.rows[0];

      // Get approved entrepreneur's user info
      const approvedEntrepreneur = await pool.query(
        `SELECT ep.id as profile_id, u.id as user_id, u.first_name, u.last_name
         FROM entrepreneur_profiles ep
         JOIN users u ON ep.user_id = u.id
         WHERE ep.id = $1`,
        [bid.entrepreneur_id]
      );

      if (approvedEntrepreneur.rows[0] && io) {
        const entrepreneur = approvedEntrepreneur.rows[0];
        const entrepreneurRoom = entrepreneur.user_id.toString();
        const roomSockets = io.sockets.adapter.rooms.get(entrepreneurRoom);
        const managerUserId = req.user.id; // The manager who is approving

        console.log('🔔 BID APPROVED NOTIFICATION DEBUG:');
        console.log('   Manager user_id (who approved):', managerUserId);
        console.log('   Target entrepreneur user_id:', entrepreneur.user_id);
        console.log('   Target room name:', entrepreneurRoom);
        console.log('   Sockets in room:', roomSockets ? roomSockets.size : 0);
        console.log('   Are they the same user?:', managerUserId === entrepreneur.user_id);

        // SAFETY CHECK: Don't send bid_approved notification to the manager who approved it
        if (entrepreneur.user_id === managerUserId) {
          console.warn('⚠️ SKIPPING bid_approved notification - entrepreneur and manager are the same user!');
        } else {
          // Emit socket event to approved entrepreneur
          io.to(entrepreneurRoom).emit('bid_approved', {
            bidId: id,
            jobId: jobData.id,
            jobTitle: jobData.title,
            propertyName: jobData.building_name || '',
            bidAmount: bid.amount,
            message: `Your bid of $${Number(bid.amount).toLocaleString()} for "${jobData.title}" has been approved!`
          });
          console.log('✅ bid_approved notification sent to room:', entrepreneurRoom);

          // 💾 Save approved notification to database
          await createNotification({
            userId: entrepreneur.user_id,
            type: 'bid_approved',
            jobId: jobData.id,
            jobTitle: jobData.title,
            propertyName: jobData.building_name || '',
            bidAmount: bid.amount,
            content: `Your bid of $${Number(bid.amount).toLocaleString()} for "${jobData.title}" has been approved!`
          });
          console.log(`💾 bid_approved notification saved for entrepreneur ${entrepreneur.user_id}`);
        }
      }

      // 🔔 Notify all declined entrepreneurs
      const managerUserId = req.user.id; // The manager who is approving
      for (const declinedBid of declinedBids) {
        const declinedEntrepreneur = await pool.query(
          `SELECT ep.id as profile_id, u.id as user_id, u.first_name, u.last_name
           FROM entrepreneur_profiles ep
           JOIN users u ON ep.user_id = u.id
           WHERE ep.id = $1`,
          [declinedBid.entrepreneur_id]
        );

        if (declinedEntrepreneur.rows[0] && io) {
          const entrepreneur = declinedEntrepreneur.rows[0];
          const entrepreneurRoom = entrepreneur.user_id.toString();
          const roomSockets = io.sockets.adapter.rooms.get(entrepreneurRoom);

          console.log('🔔 BID DECLINED NOTIFICATION DEBUG (auto-decline):');
          console.log('   Manager user_id (who approved):', managerUserId);
          console.log('   Target entrepreneur user_id:', entrepreneur.user_id);
          console.log('   Target room name:', entrepreneurRoom);
          console.log('   Sockets in room:', roomSockets ? roomSockets.size : 0);
          console.log('   Are they the same user?:', managerUserId === entrepreneur.user_id);

          // SAFETY CHECK: Don't send bid_declined notification to the manager
          if (entrepreneur.user_id === managerUserId) {
            console.warn('⚠️ SKIPPING bid_declined notification - entrepreneur and manager are the same user!');
            continue;
          }

          // Emit socket event to declined entrepreneur
          io.to(entrepreneurRoom).emit('bid_declined', {
            bidId: declinedBid.id,
            jobId: jobData.id,
            jobTitle: jobData.title,
            propertyName: jobData.building_name || '',
            bidAmount: declinedBid.amount,
            reason: 'another_accepted',
            message: `Your bid for "${jobData.title}" was not selected. Another contractor was chosen for this job.`
          });
          console.log('✅ bid_declined notification sent to room:', entrepreneurRoom);

          // 💾 Save declined notification to database
          await createNotification({
            userId: entrepreneur.user_id,
            type: 'bid_declined',
            jobId: jobData.id,
            jobTitle: jobData.title,
            propertyName: jobData.building_name || '',
            bidAmount: declinedBid.amount,
            content: `Your bid for "${jobData.title}" was not selected. Another contractor was chosen for this job.`
          });
          console.log(`💾 bid_declined notification saved for entrepreneur ${entrepreneur.user_id}`);
        }
      }
    } catch (notifyError) {
      console.error('⚠️ Failed to send bid approval notifications:', notifyError.message);
    }

    // Log user activity - manager accepting bid
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    await createUserActivityLog(
      req.user.id,
      ActivityActions.BID_ACCEPTED,
      EntityTypes.BID,
      id,
      { job_id: bid.job_id, entrepreneur_id: bid.entrepreneur_id, amount: bid.amount },
      ipAddress,
      userAgent
    );

    res.json({
      message: "Bid approved successfully! Messaging is now unlocked.",
      bid: updatedBid,
      declined_bids: declinedBids.length
    });

  } catch (err) {
    console.error("❌ Error approving bid:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔴 Decline bid (Manager only)
export const declineBid = async (req, res) => {
  try {
    const { id } = req.params;

    const bid = await Bid.getBidById(id);
    if (!bid) {
      return res.status(404).json({ message: "Bid not found" });
    }

    if (bid.status === 'declined') {
      return res.status(400).json({ message: "Bid is already declined" });
    }

    const managerProfile = await pool.query(
      `SELECT id FROM manager_profiles WHERE user_id = $1`,
      [req.user.id]
    );

    if (!managerProfile.rows[0]) {
      return res.status(403).json({ message: "Manager profile not found" });
    }

    const job = await pool.query(
      `SELECT j.*, p.building_name FROM jobs j
       LEFT JOIN properties p ON j.property_id = p.id
       WHERE j.id = $1 AND j.manager_id = $2`,
      [bid.job_id, managerProfile.rows[0].id]
    );

    if (!job.rows[0]) {
      return res.status(403).json({
        message: "You can only decline bids for your own jobs"
      });
    }

    const updatedBid = await Bid.updateBidStatus(id, "declined");

    // 🔔 Send notification to declined entrepreneur
    try {
      const io = getIO();
      const jobData = job.rows[0];

      const entrepreneur = await pool.query(
        `SELECT ep.id as profile_id, u.id as user_id, u.first_name, u.last_name
         FROM entrepreneur_profiles ep
         JOIN users u ON ep.user_id = u.id
         WHERE ep.id = $1`,
        [bid.entrepreneur_id]
      );

      if (entrepreneur.rows[0] && io) {
        const entrepData = entrepreneur.rows[0];
        const entrepreneurRoom = entrepData.user_id.toString();
        const roomSockets = io.sockets.adapter.rooms.get(entrepreneurRoom);
        const managerUserId = req.user.id; // The manager who is declining

        console.log('🔔 BID DECLINED NOTIFICATION DEBUG (manual decline):');
        console.log('   Manager user_id (who declined):', managerUserId);
        console.log('   Target entrepreneur user_id:', entrepData.user_id);
        console.log('   Target room name:', entrepreneurRoom);
        console.log('   Sockets in room:', roomSockets ? roomSockets.size : 0);
        console.log('   Are they the same user?:', managerUserId === entrepData.user_id);

        // SAFETY CHECK: Don't send bid_declined notification to the manager
        if (entrepData.user_id === managerUserId) {
          console.warn('⚠️ SKIPPING bid_declined notification - entrepreneur and manager are the same user!');
        } else {
          // Emit socket event to declined entrepreneur
          io.to(entrepreneurRoom).emit('bid_declined', {
            bidId: id,
            jobId: jobData.id,
            jobTitle: jobData.title,
            propertyName: jobData.building_name || '',
            bidAmount: bid.amount,
            reason: 'manager_declined',
            message: `Your bid for "${jobData.title}" has been declined by the property manager.`
          });
          console.log('✅ bid_declined notification sent to room:', entrepreneurRoom);

          // 💾 Save declined notification to database
          await createNotification({
            userId: entrepData.user_id,
            type: 'bid_declined',
            jobId: jobData.id,
            jobTitle: jobData.title,
            propertyName: jobData.building_name || '',
            bidAmount: bid.amount,
            content: `Your bid for "${jobData.title}" has been declined by the property manager.`
          });
          console.log(`💾 bid_declined notification saved for entrepreneur ${entrepData.user_id}`);
        }
      }
    } catch (notifyError) {
      console.error('⚠️ Failed to send bid decline notification:', notifyError.message);
    }

    // Log user activity - manager rejecting bid
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    await createUserActivityLog(
      req.user.id,
      ActivityActions.BID_REJECTED,
      EntityTypes.BID,
      id,
      { job_id: bid.job_id, entrepreneur_id: bid.entrepreneur_id, amount: bid.amount },
      ipAddress,
      userAgent
    );

    res.json({
      message: "Bid declined",
      bid: updatedBid
    });

  } catch (err) {
    console.error("❌ Error declining bid:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✏️ Update bid (Entrepreneur only - pending bids only)
export const updateBid = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, message } = req.body;

    // Validate required fields
    if (!amount) {
      return res.status(400).json({ message: "Amount is required" });
    }

    // Get the bid
    const bid = await Bid.getBidById(id);
    if (!bid) {
      return res.status(404).json({ message: "Bid not found" });
    }

    // Check if bid is still pending
    if (bid.status !== 'pending') {
      return res.status(400).json({
        message: "Only pending bids can be edited"
      });
    }

    // Get entrepreneur profile
    const entrepreneurProfile = await pool.query(
      `SELECT id FROM entrepreneur_profiles WHERE user_id = $1`,
      [req.user.id]
    );

    if (!entrepreneurProfile.rows[0]) {
      return res.status(403).json({ message: "Entrepreneur profile not found" });
    }

    // Check if this bid belongs to the entrepreneur
    if (bid.entrepreneur_id !== entrepreneurProfile.rows[0].id) {
      return res.status(403).json({
        message: "You can only edit your own bids"
      });
    }

    // Update the bid
    const updatedBid = await Bid.updateBid(id, { amount, message: message || "" });

    res.json({
      message: "Bid updated successfully",
      bid: updatedBid
    });

  } catch (err) {
    console.error("❌ Error updating bid:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🗑️ Delete bid (Entrepreneur only - pending bids only)
export const deleteBid = async (req, res) => {
  try {
    const { id } = req.params;

    // Get the bid
    const bid = await Bid.getBidById(id);
    if (!bid) {
      return res.status(404).json({ message: "Bid not found" });
    }

    // Check if bid is still pending
    if (bid.status !== 'pending') {
      return res.status(400).json({
        message: "Only pending bids can be deleted"
      });
    }

    // Get entrepreneur profile
    const entrepreneurProfile = await pool.query(
      `SELECT ep.id, ep.company_name, u.first_name, u.last_name
       FROM entrepreneur_profiles ep
       JOIN users u ON ep.user_id = u.id
       WHERE ep.user_id = $1`,
      [req.user.id]
    );

    if (!entrepreneurProfile.rows[0]) {
      return res.status(403).json({ message: "Entrepreneur profile not found" });
    }

    const entrepreneur = entrepreneurProfile.rows[0];

    // Check if this bid belongs to the entrepreneur
    if (bid.entrepreneur_id !== entrepreneur.id) {
      return res.status(403).json({
        message: "You can only delete your own bids"
      });
    }

    // Get job + manager info for notification
    const jobResult = await pool.query(
      `SELECT j.title, j.manager_id, mp.user_id AS manager_user_id
       FROM jobs j
       JOIN manager_profiles mp ON j.manager_id = mp.id
       WHERE j.id = $1`,
      [bid.job_id]
    );

    // Delete the bid
    const deletedBid = await Bid.deleteBid(id);

    // Notify property manager
    if (jobResult.rows[0]) {
      const job = jobResult.rows[0];
      const entrepreneurName = entrepreneur.company_name || `${entrepreneur.first_name} ${entrepreneur.last_name}`;

      // Socket notification
      const io = getIO();
      if (io) {
        io.to(job.manager_user_id.toString()).emit('bid_withdrawn', {
          bidId: id,
          jobId: bid.job_id,
          jobTitle: job.title,
          entrepreneurName,
          amount: bid.amount,
        });
      }

      // Persist notification to database
      try {
        await createNotification({
          userId: job.manager_user_id,
          type: 'bid_withdrawn',
          senderId: req.user.id,
          senderName: entrepreneurName,
          content: `${entrepreneurName} withdrew their bid of $${Number(bid.amount).toLocaleString()} on "${job.title}"`,
          jobId: bid.job_id,
        });
      } catch (notifErr) {
        console.error('Failed to save bid withdrawal notification:', notifErr);
      }
    }

    // Log user activity
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    await createUserActivityLog(
      req.user.id,
      ActivityActions.BID_WITHDRAWN,
      EntityTypes.BID,
      id,
      { job_id: bid.job_id, amount: bid.amount },
      ipAddress,
      userAgent
    );

    res.json({
      message: "Bid withdrawn successfully",
      bid: deletedBid
    });

  } catch (err) {
    console.error("❌ Error deleting bid:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ⭐ Toggle favorite (Manager only)
export const toggleFavorite = async (req, res) => {
  try {
    const { id } = req.params;

    const bid = await Bid.getBidById(id);
    if (!bid) {
      return res.status(404).json({ message: "Bid not found" });
    }

    const managerProfile = await pool.query(
      `SELECT id FROM manager_profiles WHERE user_id = $1`,
      [req.user.id]
    );

    if (!managerProfile.rows[0]) {
      return res.status(403).json({ message: "Manager profile not found" });
    }

    const manager_id = managerProfile.rows[0].id;

    const job = await pool.query(
      `SELECT * FROM jobs WHERE id = $1 AND manager_id = $2`,
      [bid.job_id, manager_id]
    );

    if (!job.rows[0]) {
      return res.status(403).json({ 
        message: "You can only favorite bids for your own jobs" 
      });
    }

    const isFav = await Bid.isFavorited(manager_id, id);

    if (isFav) {
      await Bid.removeFromFavorites(manager_id, bid.entrepreneur_id, bid.job_id);
      res.json({ 
        message: "Removed from favorites", 
        favorited: false 
      });
    } else {
      await Bid.addToFavorites(manager_id, bid.entrepreneur_id, bid.job_id);
      res.json({ 
        message: "Added to favorites", 
        favorited: true 
      });
    }

  } catch (err) {
    console.error("❌ Error toggling favorite:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔄 Cancel bid approval (Manager only)
export const cancelBidApproval = async (req, res) => {
  try {
    const { id } = req.params;

    // Get the bid
    const bid = await Bid.getBidById(id);
    if (!bid) {
      return res.status(404).json({ message: "Bid not found" });
    }

    if (bid.status !== 'approved') {
      return res.status(400).json({ message: "Only approved bids can be cancelled" });
    }

    // Verify manager owns the job
    const managerProfile = await pool.query(
      `SELECT id FROM manager_profiles WHERE user_id = $1`,
      [req.user.id]
    );
    if (!managerProfile.rows[0]) {
      return res.status(403).json({ message: "Manager profile not found" });
    }

    const job = await pool.query(
      `SELECT j.*, p.building_name FROM jobs j
       LEFT JOIN properties p ON j.property_id = p.id
       WHERE j.id = $1 AND j.manager_id = $2`,
      [bid.job_id, managerProfile.rows[0].id]
    );
    if (!job.rows[0]) {
      return res.status(403).json({ message: "You can only cancel bids for your own jobs" });
    }

    const jobData = job.rows[0];

    // Status guard: only allow cancel when job is 'accepted' (not ongoing/completed)
    if (jobData.status === 'ongoing' || jobData.status === 'completed') {
      return res.status(400).json({
        message: `Cannot cancel acceptance for a job that is ${jobData.status}.`
      });
    }

    // Get the entrepreneur's user info for notifications
    const entrepreneur = await pool.query(
      `SELECT ep.id as profile_id, u.id as user_id, u.first_name, u.last_name
       FROM entrepreneur_profiles ep
       JOIN users u ON ep.user_id = u.id
       WHERE ep.id = $1`,
      [bid.entrepreneur_id]
    );
    const entrepreneurData = entrepreneur.rows[0];

    // 1. Revert bid status to pending
    await Bid.updateBidStatus(id, 'pending');

    // 2. Restore auto-declined bids back to pending
    const restoredBids = await Bid.restoreDeclinedBids(bid.job_id, id);
    console.log(`🔄 Restored ${restoredBids.length} declined bid(s) for job ${bid.job_id}`);

    // 3. Cancel active contract if exists
    const contractResult = await pool.query(
      `UPDATE contracts SET status = 'cancelled', updated_at = NOW()
       WHERE job_id = $1 AND status IN ('active', 'work_completed')
       RETURNING id`,
      [bid.job_id]
    );
    if (contractResult.rows.length > 0) {
      await pool.query(
        `INSERT INTO contract_events (contract_id, event_type, actor_user_id, actor_role, event_data)
         VALUES ($1, 'contract_cancelled', $2, 'manager', $3)`,
        [contractResult.rows[0].id, req.user.id, JSON.stringify({ reason: 'bid_approval_cancelled', job_title: jobData.title })]
      );
    }

    // 4. Revert job to Open
    await pool.query(
      `UPDATE jobs SET status = 'Open', has_contract = false, contract_status = null, entrepreneur_id = null, updated_at = NOW()
       WHERE id = $1`,
      [bid.job_id]
    );

    // 5. Notify the contractor whose bid was cancelled
    const io = getIO();
    if (entrepreneurData) {
      const cancelContent = `Your approved bid for "${jobData.title}" has been cancelled by the property manager. The job is now open for bidding again.`;

      await createNotification({
        userId: entrepreneurData.user_id,
        type: 'bid_approval_cancelled',
        jobId: bid.job_id,
        jobTitle: jobData.title,
        content: cancelContent,
        bidderId: entrepreneurData.user_id,
        bidAmount: bid.amount
      });

      if (io) {
        io.to(entrepreneurData.user_id.toString()).emit('bid_approval_cancelled', {
          bidId: id,
          jobId: bid.job_id,
          jobTitle: jobData.title,
          propertyName: jobData.building_name || '',
          bidAmount: bid.amount,
          message: cancelContent
        });
      }
    }

    // 6. Notify restored bidders that the job is open again
    for (const restoredBid of restoredBids) {
      const restoredEntrepreneur = await pool.query(
        `SELECT u.id as user_id FROM entrepreneur_profiles ep
         JOIN users u ON ep.user_id = u.id
         WHERE ep.id = $1`,
        [restoredBid.entrepreneur_id]
      );

      if (restoredEntrepreneur.rows[0]) {
        const reopenContent = `The job "${jobData.title}" is open for bidding again. Your bid has been restored.`;

        await createNotification({
          userId: restoredEntrepreneur.rows[0].user_id,
          type: 'job_reopened',
          jobId: bid.job_id,
          jobTitle: jobData.title,
          content: reopenContent
        });

        if (io) {
          io.to(restoredEntrepreneur.rows[0].user_id.toString()).emit('job_reopened', {
            jobId: bid.job_id,
            jobTitle: jobData.title,
            bidId: restoredBid.id,
            message: reopenContent
          });
        }
      }
    }

    // Log activity
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    await createUserActivityLog(
      req.user.id,
      'bid_acceptance_cancelled',
      EntityTypes.BID,
      id,
      { job_id: bid.job_id, job_title: jobData.title, entrepreneur_name: entrepreneurData ? `${entrepreneurData.first_name} ${entrepreneurData.last_name}` : 'Unknown', bids_restored: restoredBids.length },
      ipAddress,
      userAgent
    );

    res.json({
      message: "Bid approval cancelled successfully. Job is now open for bidding.",
      bids_restored: restoredBids.length
    });

  } catch (err) {
    console.error("❌ Error cancelling bid approval:", err);
    res.status(500).json({ message: "Server error" });
  }
};