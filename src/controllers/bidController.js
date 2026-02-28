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

    // 🔔 Send socket notification to the property manager
    try {
      // Get job details and manager info
      const jobResult = await pool.query(
        `SELECT j.title, j.manager_id, p.building_name, u.id as manager_user_id
         FROM jobs j
         LEFT JOIN properties p ON j.property_id = p.id
         LEFT JOIN manager_profiles mp ON j.manager_id = mp.id
         LEFT JOIN users u ON mp.user_id = u.id
         WHERE j.id = $1`,
        [job_id]
      );

      // Get entrepreneur details
      const entrepreneurResult = await pool.query(
        `SELECT u.id as user_id, u.first_name, u.last_name, ep.license_number
         FROM entrepreneur_profiles ep
         JOIN users u ON ep.user_id = u.id
         WHERE ep.id = $1`,
        [entrepreneur_id]
      );

      if (jobResult.rows[0] && entrepreneurResult.rows[0]) {
        const job = jobResult.rows[0];
        const entrepreneur = entrepreneurResult.rows[0];
        const io = getIO();

        if (io && job.manager_user_id) {
          const managerRoom = job.manager_user_id.toString();
          const roomSockets = io.sockets.adapter.rooms.get(managerRoom);

          console.log('🔔 NEW BID NOTIFICATION DEBUG:');
          console.log('   Target manager user_id:', job.manager_user_id);
          console.log('   Target room name:', managerRoom);
          console.log('   Sockets in room:', roomSockets ? roomSockets.size : 0);
          console.log('   Socket IDs in room:', roomSockets ? Array.from(roomSockets) : []);

          // Log all connected sockets for debugging
          console.log('   📋 All connected sockets:');
          io.sockets.sockets.forEach((socket, socketId) => {
            console.log(`      - Socket ${socketId}: userId=${socket.userId}, rooms=[${Array.from(socket.rooms).join(', ')}]`);
          });

          io.to(managerRoom).emit('new_bid', {
            bidId: newBid.id,
            bidderName: `${entrepreneur.first_name} ${entrepreneur.last_name}`,
            bidderId: entrepreneur_id,
            jobId: job_id,
            jobTitle: job.title,
            propertyName: job.building_name || '',
            bidAmount: amount,
            licenseNumber: entrepreneur.license_number || 'N/A',
          });
          console.log('✅ new_bid event emitted to room:', managerRoom);

          // 💾 Save bid notification to database for persistence
          try {
            await createNotification({
              userId: job.manager_user_id,
              type: 'bid',
              bidderId: entrepreneur.user_id, // Use user_id, not entrepreneur_profile_id
              bidderName: `${entrepreneur.first_name} ${entrepreneur.last_name}`,
              jobId: job_id,
              jobTitle: job.title,
              propertyName: job.building_name || '',
              bidAmount: amount,
              licenseNumber: entrepreneur.license_number || 'N/A',
            });
            console.log(`💾 Bid notification saved to database for manager ${job.manager_user_id}`);
          } catch (notifDbError) {
            console.error('❌ Failed to save bid notification to DB:', notifDbError);
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
      `SELECT id FROM entrepreneur_profiles WHERE user_id = $1`,
      [req.user.id]
    );

    if (!entrepreneurProfile.rows[0]) {
      return res.status(403).json({ message: "Entrepreneur profile not found" });
    }

    // Check if this bid belongs to the entrepreneur
    if (bid.entrepreneur_id !== entrepreneurProfile.rows[0].id) {
      return res.status(403).json({
        message: "You can only delete your own bids"
      });
    }

    // Delete the bid
    const deletedBid = await Bid.deleteBid(id);

    // Log user activity - entrepreneur withdrawing bid
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
      message: "Bid deleted successfully",
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