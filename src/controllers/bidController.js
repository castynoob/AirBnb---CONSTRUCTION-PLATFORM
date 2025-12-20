// src/controllers/bidController.js
import pool from "../config/db.js";
import * as Bid from "../models/bidModel.js";
import { incrementBidCount } from "../middleware/subscriptionMiddleware.js";  // ✅ ADD THIS

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

    // Increment bid count for basic plan users
    const { plan_type } = req.subscription;
    if (plan_type === 'basic') {
      await incrementBidCount(entrepreneur_id);
      req.bidsRemaining = req.bidsRemaining - 1; 
      console.log('📊 Bid count incremented:', (30 - req.bidsRemaining) + '/30');
    }

    console.log('========================================\n');

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

    const managerProfile = await pool.query(
      `SELECT id FROM manager_profiles WHERE user_id = $1`,
      [req.user.id]
    );

    if (!managerProfile.rows[0]) {
      return res.status(403).json({ message: "Manager profile not found" });
    }

    const job = await pool.query(
      `SELECT * FROM jobs WHERE id = $1 AND manager_id = $2`,
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
      `SELECT * FROM jobs WHERE id = $1 AND manager_id = $2`,
      [bid.job_id, managerProfile.rows[0].id]
    );

    if (!job.rows[0]) {
      return res.status(403).json({ 
        message: "You can only decline bids for your own jobs" 
      });
    }

    const updatedBid = await Bid.updateBidStatus(id, "declined");

    res.json({ 
      message: "Bid declined", 
      bid: updatedBid 
    });

  } catch (err) {
    console.error("❌ Error declining bid:", err);
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