import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";
import {
  findAdminByEmail,
  findAdminById,
  updateAdminLastLogin,
  createAdminSession,
  deleteAdminSession,
  createAuditLog,
  getUserStats,
  getSubscriptionStats,
  getJobStats,
  getBidStats,
  getRevenueStats,
  getMonthlyRevenue,
  getRevenueByPeriod,
  getJobsOverTime,
  getJobsByPeriod,
  getUserRegistrationsOverTime,
  getUsersByPeriod,
  getRecentActivity,
  getAllUsers,
  getUserById,
  getAuditLogs,
  getAllJobs,
  getJobById,
  getJobBids,
  flagJob,
  unflagJob,
  addJobAdminNotes,
  forceCloseJob,
  getJobCategories,
  getAllBids,
  getBidByIdAdmin,
  getAdminBidStats,
  flagBid,
  unflagBid,
  addBidAdminNotes,
  getAllAdminProperties,
  getPropertyByIdAdmin,
  getAdminPropertyStats,
  getPropertyJobs,
  getPropertyCities,
  getBuildingTypes,
  flagProperty,
  unflagProperty,
  addPropertyAdminNotes,
  getTransactionStats,
  getAllBudgetUnlocks,
  getBudgetUnlockById,
  getTransactionRevenueOverTime,
  getAllSubscriptions,
  getDetailedSubscriptionStats,
  getSubscriptionGrowthOverTime,
  getPlanDistribution,
  getSubscriptionById,
  extendSubscriptionTrial,
  endSubscriptionTrial,
  cancelSubscription,
  reactivateSubscription,
  changeSubscriptionPlan,
  getAllSupportTickets,
  getSupportTicketById,
  getTicketMessagesAdmin,
  addAdminTicketMessage,
  updateTicketStatus,
  getAllDisputes,
  getDisputeById,
  getDisputeStats,
  updateDisputeStatus,
  resolveDispute,
  addDisputeAdminNotes,
  updateDisputePriority,
  escalateDispute,
  getDisputeTypes,
} from "../models/adminModel.js";
import { getUserActivityLogs } from "../models/userActivityModel.js";
import {
  createBulkNotifications,
  getUsersWhoBidOnJob,
  getJobOwnerUserId,
} from "../models/notificationModel.js";
import { declineAllBidsForJob } from "../models/bidModel.js";

dotenv.config();

// ============================================
// AUTHENTICATION
// ============================================

// Admin Login
export const adminLogin = async (req, res) => {
  console.log("[Admin Login] Request received");
  console.log("[Admin Login] Body:", JSON.stringify(req.body));

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      console.log("[Admin Login] Missing email or password");
      return res.status(400).json({ message: "Email and password are required" });
    }

    console.log("[Admin Login] Looking for admin with email:", email);
    const admin = await findAdminByEmail(email);
    console.log("[Admin Login] Admin found:", admin ? "Yes" : "No");

    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (admin.status !== "active") {
      return res.status(403).json({ message: "Account is suspended" });
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Create access token (1 hour for admin)
    const accessToken = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Create refresh token
    const refreshToken = crypto.randomBytes(64).toString("hex");
    const refreshTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store session
    await createAdminSession(
      admin.id,
      refreshTokenHash,
      req.ip,
      req.get("User-Agent"),
      expiresAt
    );

    // Update last login
    await updateAdminLastLogin(admin.id);

    // Log the login action
    await createAuditLog(
      admin.id,
      "admin_login",
      "admin_user",
      admin.id,
      { email: admin.email },
      req.ip,
      req.get("User-Agent")
    );

    res.json({
      message: "Login successful",
      accessToken,
      refreshToken,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        avatar_url: admin.avatar_url,
      },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Admin Logouts
export const adminLogout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
      await deleteAdminSession(tokenHash);
    }

    // Log the logout action
    if (req.admin) {
      await createAuditLog(
        req.admin.id,
        "admin_logout",
        "admin_user",
        req.admin.id,
        null,
        req.ip,
        req.get("User-Agent")
      );
    }

    res.json({ message: "Logout successful" });
  } catch (err) {
    console.error("Admin logout error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get current admin
export const getCurrentAdmin = async (req, res) => {
  try {
    const admin = await findAdminById(req.admin.id);

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.json({ admin });
  } catch (err) {
    console.error("Get admin error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ============================================
// DASHBOARD
// ============================================

// Get dashboard statistics
export const getDashboardStats = async (req, res) => {
  try {
    const [userStats, subscriptionStats, jobStats, bidStats, revenueStats] = await Promise.all([
      getUserStats(),
      getSubscriptionStats(),
      getJobStats(),
      getBidStats(),
      getRevenueStats(),
    ]);

    res.json({
      users: userStats,
      subscriptions: subscriptionStats,
      jobs: jobStats,
      bids: bidStats,
      revenue: revenueStats,
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get dashboard charts data
export const getDashboardCharts = async (req, res) => {
  try {
    const { days = 30, months = 12 } = req.query;

    const [jobsOverTime, monthlyRevenue, userRegistrations] = await Promise.all([
      getJobsOverTime(parseInt(days)),
      getMonthlyRevenue(parseInt(months)),
      getUserRegistrationsOverTime(parseInt(days)),
    ]);

    res.json({
      jobsOverTime,
      monthlyRevenue,
      userRegistrations,
    });
  } catch (err) {
    console.error("Dashboard charts error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get recent activity feed
export const getActivityFeed = async (req, res) => {
  try {
    const { limit = 20, types, roles } = req.query;

    // Parse filter arrays from query params
    const filters = {
      types: types ? types.split(",") : [],
      roles: roles ? roles.split(",") : [],
    };

    const rawActivity = await getRecentActivity(parseInt(limit), filters);

    // Transform data to match frontend expectations
    const activities = rawActivity.map((item) => {
      let user_name = "";
      let description = "";

      switch (item.type) {
        case "user_registered":
          user_name = item.title;
          description = `registered as ${item.subtitle}`;
          break;
        case "job_posted":
          user_name = "A property manager";
          description = `posted a new job: "${item.title}"`;
          break;
        case "bid_submitted":
          user_name = "An entrepreneur";
          description = `submitted a bid of ${item.title}`;
          break;
        case "subscription_created":
          user_name = "A user";
          description = `subscribed to ${item.title}`;
          break;
        default:
          user_name = item.title || "A user";
          description = item.subtitle || "performed an action";
      }

      return {
        type: item.type,
        user_name,
        description,
        created_at: item.timestamp,
      };
    });

    res.json({ activities });
  } catch (err) {
    console.error("Activity feed error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get revenue data by time period (day, week, month, year) with optional date range
export const getRevenueChart = async (req, res) => {
  try {
    const { period = 'month', startDate, endDate } = req.query;
    const validPeriods = ['day', 'week', 'month', 'year'];

    if (!validPeriods.includes(period)) {
      return res.status(400).json({ message: "Invalid period. Use: day, week, month, or year" });
    }

    const revenueData = await getRevenueByPeriod(period, startDate || null, endDate || null);
    res.json({ revenueData, period, startDate, endDate });
  } catch (err) {
    console.error("Revenue chart error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get jobs data by time period (day, week, month, year) with optional date range
export const getJobsChart = async (req, res) => {
  try {
    const { period = 'day', startDate, endDate } = req.query;
    const validPeriods = ['day', 'week', 'month', 'year'];

    if (!validPeriods.includes(period)) {
      return res.status(400).json({ message: "Invalid period. Use: day, week, month, or year" });
    }

    const jobsData = await getJobsByPeriod(period, startDate || null, endDate || null);
    res.json({ jobsData, period, startDate, endDate });
  } catch (err) {
    console.error("Jobs chart error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get users data by time period (day, week, month, year) with optional date range
export const getUsersChart = async (req, res) => {
  try {
    const { period = 'day', startDate, endDate } = req.query;
    const validPeriods = ['day', 'week', 'month', 'year'];

    if (!validPeriods.includes(period)) {
      return res.status(400).json({ message: "Invalid period. Use: day, week, month, or year" });
    }

    const usersData = await getUsersByPeriod(period, startDate || null, endDate || null);
    res.json({ usersData, period, startDate, endDate });
  } catch (err) {
    console.error("Users chart error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ============================================
// USER MANAGEMENT
// ============================================

// Get all users
export const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 50, role, emailVerified, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const filters = {};
    if (role) filters.role = role;
    if (emailVerified !== undefined) filters.emailVerified = emailVerified === "true";
    if (search) filters.search = search;

    const { users, total } = await getAllUsers(parseInt(limit), offset, filters);

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Get users error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get user by ID
export const getUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await getUserById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user });
  } catch (err) {
    console.error("Get user error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get user activity
export const getUserActivityHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0, action, entityType, startDate, endDate } = req.query;

    const filters = {};
    if (action) filters.action = action;
    if (entityType) filters.entityType = entityType;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const activities = await getUserActivityLogs(id, parseInt(limit), parseInt(offset), filters);

    res.json({ activities });
  } catch (err) {
    console.error("Get user activity error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Suspend user
export const suspendUserHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const user = await getUserById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Log the suspension
    await createAuditLog(
      req.admin.id,
      "user_suspended",
      "user",
      id,
      { reason, user_email: user.email },
      req.ip,
      req.get("User-Agent")
    );

    res.json({ message: "User suspended successfully" });
  } catch (err) {
    console.error("Suspend user error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Activate user
export const activateUserHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await getUserById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Log the activation
    await createAuditLog(
      req.admin.id,
      "user_activated",
      "user",
      id,
      { user_email: user.email },
      req.ip,
      req.get("User-Agent")
    );

    res.json({ message: "User activated successfully" });
  } catch (err) {
    console.error("Activate user error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ============================================
// AUDIT LOGS
// ============================================

// Get audit logs
export const getAuditLogsHandler = async (req, res) => {
  try {
    const { page = 1, limit = 50, adminId, action, entityType, startDate, endDate } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const filters = {};
    if (adminId) filters.adminId = adminId;
    if (action) filters.action = action;
    if (entityType) filters.entityType = entityType;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const logs = await getAuditLogs(parseInt(limit), offset, filters);

    res.json({ logs });
  } catch (err) {
    console.error("Get audit logs error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ============================================
// JOB MANAGEMENT
// ============================================

// Get all jobs
export const getJobs = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, category, urgency, search, isFlagged } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const filters = {};
    if (status) filters.status = status;
    if (category) filters.category = category;
    if (urgency) filters.urgency = urgency;
    if (search) filters.search = search;
    if (isFlagged !== undefined) filters.isFlagged = isFlagged === "true";

    const { jobs, total } = await getAllJobs(parseInt(limit), offset, filters);

    res.json({
      jobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Get jobs error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get job by ID with details
export const getJob = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await getJobById(id);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Get bids for this job
    const bids = await getJobBids(id);

    res.json({ job, bids });
  } catch (err) {
    console.error("Get job error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get job categories
export const getJobCategoriesHandler = async (req, res) => {
  try {
    const categories = await getJobCategories();
    res.json({ categories });
  } catch (err) {
    console.error("Get job categories error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Flag a job
export const flagJobHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ message: "Flag reason is required" });
    }

    const job = await getJobById(id);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    await flagJob(id, reason, req.admin.id);

    // Log the action
    await createAuditLog(
      req.admin.id,
      "job_flagged",
      "job",
      id,
      { reason, job_title: job.title },
      req.ip,
      req.get("User-Agent")
    );

    res.json({ message: "Job flagged successfully" });
  } catch (err) {
    console.error("Flag job error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Unflag a job
export const unflagJobHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const job = await getJobById(id);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    await unflagJob(id);

    // Log the action
    await createAuditLog(
      req.admin.id,
      "job_unflagged",
      "job",
      id,
      { job_title: job.title },
      req.ip,
      req.get("User-Agent")
    );

    res.json({ message: "Job unflagged successfully" });
  } catch (err) {
    console.error("Unflag job error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Add admin notes to a job
export const addJobNotesHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const job = await getJobById(id);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    await addJobAdminNotes(id, notes);

    // Log the action
    await createAuditLog(
      req.admin.id,
      "job_notes_updated",
      "job",
      id,
      { job_title: job.title },
      req.ip,
      req.get("User-Agent")
    );

    res.json({ message: "Admin notes updated successfully" });
  } catch (err) {
    console.error("Add job notes error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Force close a job
export const forceCloseJobHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ message: "Close reason is required" });
    }

    const job = await getJobById(id);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    if (job.status === "Closed" || job.status === "Completed") {
      return res.status(400).json({ message: "Job is already closed or completed" });
    }

    await forceCloseJob(id, reason, req.admin.id);

    // Decline all pending bids for this job
    const declinedBids = await declineAllBidsForJob(id);
    console.log(`Declined ${declinedBids.length} pending bids for job ${id}`);

    // Log the action
    await createAuditLog(
      req.admin.id,
      "job_force_closed",
      "job",
      id,
      { reason, job_title: job.title, previous_status: job.status, bids_declined: declinedBids.length },
      req.ip,
      req.get("User-Agent")
    );

    // Send in-app notifications to affected users
    try {
      const notifications = [];

      // Notify the property manager (job owner)
      const jobOwner = await getJobOwnerUserId(id);
      if (jobOwner) {
        notifications.push({
          userId: jobOwner.user_id,
          type: "job_closed",
          content: `Your job "${job.title}" has been closed by an administrator. Reason: ${reason}`,
          jobId: id,
          jobTitle: job.title
        });
      }

      // Notify entrepreneurs who bid on the job
      const bidders = await getUsersWhoBidOnJob(id);
      for (const bidder of bidders) {
        notifications.push({
          userId: bidder.user_id,
          type: "job_closed",
          content: `The job "${job.title}" you bid on has been closed by an administrator.`,
          jobId: id,
          jobTitle: job.title
        });
      }

      // Send all notifications
      if (notifications.length > 0) {
        await createBulkNotifications(notifications);
      }
    } catch (notificationErr) {
      // Log notification error but don't fail the request
      console.error("Failed to send notifications:", notificationErr);
    }

    res.json({ message: "Job closed successfully" });
  } catch (err) {
    console.error("Force close job error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ============================================
// BID MANAGEMENT
// ============================================

// Get all bids
export const getBids = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, search, minAmount, maxAmount, startDate, endDate, isFlagged } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const filters = {};
    if (status) filters.status = status;
    if (search) filters.search = search;
    if (minAmount) filters.minAmount = parseFloat(minAmount);
    if (maxAmount) filters.maxAmount = parseFloat(maxAmount);
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (isFlagged !== undefined) filters.isFlagged = isFlagged === "true";

    const { bids, total } = await getAllBids(parseInt(limit), offset, filters);

    res.json({
      bids,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Get bids error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get bid by ID with details
export const getBid = async (req, res) => {
  try {
    const { id } = req.params;
    const bid = await getBidByIdAdmin(id);

    if (!bid) {
      return res.status(404).json({ message: "Bid not found" });
    }

    res.json({ bid });
  } catch (err) {
    console.error("Get bid error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get bid statistics
export const getBidStatsHandler = async (req, res) => {
  try {
    const stats = await getAdminBidStats();
    res.json({ stats });
  } catch (err) {
    console.error("Get bid stats error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Flag a bid
export const flagBidHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ message: "Flag reason is required" });
    }

    const bid = await getBidByIdAdmin(id);
    if (!bid) {
      return res.status(404).json({ message: "Bid not found" });
    }

    await flagBid(id, reason, req.admin.id);

    // Log the action
    await createAuditLog(
      req.admin.id,
      "bid_flagged",
      "bid",
      id,
      { reason, bid_amount: bid.amount, job_title: bid.job_title, entrepreneur: bid.entrepreneur_company },
      req.ip,
      req.get("User-Agent")
    );

    res.json({ message: "Bid flagged successfully" });
  } catch (err) {
    console.error("Flag bid error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Unflag a bid
export const unflagBidHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const bid = await getBidByIdAdmin(id);
    if (!bid) {
      return res.status(404).json({ message: "Bid not found" });
    }

    await unflagBid(id);

    // Log the action
    await createAuditLog(
      req.admin.id,
      "bid_unflagged",
      "bid",
      id,
      { bid_amount: bid.amount, job_title: bid.job_title },
      req.ip,
      req.get("User-Agent")
    );

    res.json({ message: "Bid unflagged successfully" });
  } catch (err) {
    console.error("Unflag bid error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Add admin notes to a bid
export const addBidNotesHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const bid = await getBidByIdAdmin(id);
    if (!bid) {
      return res.status(404).json({ message: "Bid not found" });
    }

    await addBidAdminNotes(id, notes);

    // Log the action
    await createAuditLog(
      req.admin.id,
      "bid_notes_updated",
      "bid",
      id,
      { job_title: bid.job_title },
      req.ip,
      req.get("User-Agent")
    );

    res.json({ message: "Admin notes updated successfully" });
  } catch (err) {
    console.error("Add bid notes error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ============================================
// PROPERTY MANAGEMENT
// ============================================

// Get all properties
export const getProperties = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, city, buildingType, hasActiveJobs, isFlagged } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const filters = {};
    if (search) filters.search = search;
    if (city) filters.city = city;
    if (buildingType) filters.buildingType = buildingType;
    if (hasActiveJobs) filters.hasActiveJobs = hasActiveJobs;
    if (isFlagged !== undefined) filters.isFlagged = isFlagged === "true";

    const { properties, total } = await getAllAdminProperties(parseInt(limit), offset, filters);

    res.json({
      properties,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Get properties error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get property by ID with details
export const getProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const property = await getPropertyByIdAdmin(id);

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    // Get jobs for this property
    const jobs = await getPropertyJobs(id);

    res.json({ property, jobs });
  } catch (err) {
    console.error("Get property error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get property statistics
export const getPropertyStatsHandler = async (req, res) => {
  try {
    const stats = await getAdminPropertyStats();
    res.json({ stats });
  } catch (err) {
    console.error("Get property stats error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get cities for filter dropdown
export const getPropertyCitiesHandler = async (req, res) => {
  try {
    const cities = await getPropertyCities();
    res.json({ cities });
  } catch (err) {
    console.error("Get cities error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get building types for filter dropdown
export const getBuildingTypesHandler = async (req, res) => {
  try {
    const buildingTypes = await getBuildingTypes();
    res.json({ buildingTypes });
  } catch (err) {
    console.error("Get building types error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Flag a property
export const flagPropertyHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ message: "Flag reason is required" });
    }

    const property = await getPropertyByIdAdmin(id);
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    await flagProperty(id, reason, req.admin.id);

    // Log the action
    await createAuditLog(
      req.admin.id,
      "property_flagged",
      "property",
      id,
      { reason, address: property.address, city: property.city, manager: property.manager_company },
      req.ip,
      req.get("User-Agent")
    );

    res.json({ message: "Property flagged successfully" });
  } catch (err) {
    console.error("Flag property error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Unflag a property
export const unflagPropertyHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const property = await getPropertyByIdAdmin(id);
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    await unflagProperty(id);

    // Log the action
    await createAuditLog(
      req.admin.id,
      "property_unflagged",
      "property",
      id,
      { address: property.address, city: property.city },
      req.ip,
      req.get("User-Agent")
    );

    res.json({ message: "Property unflagged successfully" });
  } catch (err) {
    console.error("Unflag property error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Add admin notes to a property
export const addPropertyNotesHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const property = await getPropertyByIdAdmin(id);
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    await addPropertyAdminNotes(id, notes);

    // Log the action
    await createAuditLog(
      req.admin.id,
      "property_notes_updated",
      "property",
      id,
      { address: property.address },
      req.ip,
      req.get("User-Agent")
    );

    res.json({ message: "Admin notes updated successfully" });
  } catch (err) {
    console.error("Add property notes error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ============================================
// TRANSACTIONS / PAYMENTS MANAGEMENT
// ============================================

// Get transaction statistics
export const getTransactionStatsHandler = async (req, res) => {
  try {
    const stats = await getTransactionStats();
    res.json({ stats });
  } catch (err) {
    console.error("Get transaction stats error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get all budget unlocks (payments)
export const getBudgetUnlocks = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, search, dateFrom, dateTo, minAmount, maxAmount } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const filters = {};
    if (status) filters.status = status;
    if (search) filters.search = search;
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;
    if (minAmount) filters.minAmount = parseFloat(minAmount);
    if (maxAmount) filters.maxAmount = parseFloat(maxAmount);

    const { transactions, total } = await getAllBudgetUnlocks(parseInt(limit), offset, filters);

    res.json({
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Get budget unlocks error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get budget unlock by ID
export const getBudgetUnlock = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await getBudgetUnlockById(id);

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    res.json({ transaction });
  } catch (err) {
    console.error("Get budget unlock error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get revenue chart data for budget unlocks
export const getRevenueChartData = async (req, res) => {
  try {
    const { period = 'day' } = req.query;
    const validPeriods = ['day', 'week', 'month'];

    if (!validPeriods.includes(period)) {
      return res.status(400).json({ message: "Invalid period. Use: day, week, or month" });
    }

    const revenueData = await getTransactionRevenueOverTime(period);
    res.json({ revenueData, period });
  } catch (err) {
    console.error("Get revenue chart data error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get all subscriptions
export const getSubscriptions = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, plan_type, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const filters = {};
    if (status) filters.status = status;
    if (plan_type) filters.plan_type = plan_type;
    if (search) filters.search = search;

    const { subscriptions, total } = await getAllSubscriptions(parseInt(limit), offset, filters);

    res.json({
      subscriptions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Get subscriptions error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get subscription stats
export const getSubscriptionStatsHandler = async (req, res) => {
  try {
    const stats = await getDetailedSubscriptionStats();
    res.json({ stats });
  } catch (err) {
    console.error("Get subscription stats error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get subscription growth chart data
export const getSubscriptionGrowthHandler = async (req, res) => {
  try {
    const { period = 'day' } = req.query;
    const validPeriods = ['day', 'week', 'month'];
    const selectedPeriod = validPeriods.includes(period) ? period : 'day';

    const growthData = await getSubscriptionGrowthOverTime(selectedPeriod);
    res.json({ growthData, period: selectedPeriod });
  } catch (err) {
    console.error("Get subscription growth error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get plan distribution for pie chart
export const getPlanDistributionHandler = async (req, res) => {
  try {
    const distribution = await getPlanDistribution();
    res.json({ distribution });
  } catch (err) {
    console.error("Get plan distribution error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get single subscription by ID
export const getSubscriptionHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const subscription = await getSubscriptionById(id);

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    res.json({ subscription });
  } catch (err) {
    console.error("Get subscription error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Extend trial period
export const extendTrialHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { days = 7 } = req.body;

    if (days < 1 || days > 90) {
      return res.status(400).json({ message: "Days must be between 1 and 90" });
    }

    const subscription = await extendSubscriptionTrial(id, days);

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    // Create audit log
    await createAuditLog(
      req.admin.id,
      "extend_trial",
      "subscription",
      id,
      { days_extended: days }
    );

    res.json({ message: `Trial extended by ${days} days`, subscription });
  } catch (err) {
    console.error("Extend trial error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// End trial immediately
export const endTrialHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { convertToActive = false } = req.body;

    const subscription = await endSubscriptionTrial(id, convertToActive);

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    // Create audit log
    await createAuditLog(
      req.admin.id,
      "end_trial",
      "subscription",
      id,
      { converted_to_active: convertToActive }
    );

    res.json({
      message: convertToActive ? "Trial ended, subscription activated" : "Trial ended, subscription canceled",
      subscription
    });
  } catch (err) {
    console.error("End trial error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Cancel subscription
export const cancelSubscriptionHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { immediate = false } = req.body;

    const subscription = await cancelSubscription(id, immediate);

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    // Create audit log
    await createAuditLog(
      req.admin.id,
      "cancel_subscription",
      "subscription",
      id,
      { immediate }
    );

    res.json({
      message: immediate ? "Subscription canceled immediately" : "Subscription will cancel at period end",
      subscription
    });
  } catch (err) {
    console.error("Cancel subscription error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Reactivate subscription
export const reactivateSubscriptionHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const subscription = await reactivateSubscription(id);

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    // Create audit log
    await createAuditLog(
      req.admin.id,
      "reactivate_subscription",
      "subscription",
      id,
      {}
    );

    res.json({ message: "Subscription reactivated", subscription });
  } catch (err) {
    console.error("Reactivate subscription error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Change subscription plan
export const changePlanHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { planType } = req.body;

    if (!['basic', 'premium'].includes(planType)) {
      return res.status(400).json({ message: "Invalid plan type. Must be 'basic' or 'premium'" });
    }

    const subscription = await changeSubscriptionPlan(id, planType);

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    // Create audit log
    await createAuditLog(
      req.admin.id,
      "change_plan",
      "subscription",
      id,
      { new_plan: planType }
    );

    res.json({ message: `Plan changed to ${planType}`, subscription });
  } catch (err) {
    console.error("Change plan error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ============================================
// SUPPORT TICKET MANAGEMENT
// ============================================

// Get all support tickets
export const getSupportTicketsHandler = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, priority, category } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await getAllSupportTickets(parseInt(limit), offset, {
      search,
      status,
      priority,
      category,
    });

    res.json({
      tickets: result.tickets,
      pagination: {
        ...result.pagination,
        page: parseInt(page),
      },
    });
  } catch (err) {
    console.error("Get support tickets error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get single support ticket
export const getSupportTicketHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const ticket = await getSupportTicketById(id);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    res.json({ ticket });
  } catch (err) {
    console.error("Get support ticket error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get ticket messages
export const getTicketMessagesHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const messages = await getTicketMessagesAdmin(id);

    res.json({ messages });
  } catch (err) {
    console.error("Get ticket messages error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Add admin reply to ticket
export const addTicketMessageHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, isInternal = false } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Message is required" });
    }

    const ticketMessage = await addAdminTicketMessage(id, req.admin.id, message.trim(), isInternal);

    // Create audit log
    await createAuditLog(
      req.admin.id,
      "reply_ticket",
      "support_ticket",
      id,
      { is_internal: isInternal }
    );

    res.status(201).json({ message: "Reply sent", ticketMessage });
  } catch (err) {
    console.error("Add ticket message error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Update ticket status
export const updateTicketStatusHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['open', 'in_progress', 'waiting_on_user', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const ticket = await updateTicketStatus(id, status, req.admin.id);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Create audit log
    await createAuditLog(
      req.admin.id,
      "update_ticket_status",
      "support_ticket",
      id,
      { new_status: status }
    );

    res.json({ message: "Status updated", ticket });
  } catch (err) {
    console.error("Update ticket status error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ============================================
// DISPUTE MANAGEMENT
// ============================================

// Get all disputes
export const getDisputesHandler = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, type, priority } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await getAllDisputes(parseInt(limit), offset, {
      search,
      status,
      type,
      priority,
    });

    res.json({
      disputes: result.disputes,
      pagination: {
        ...result.pagination,
        page: parseInt(page),
      },
    });
  } catch (err) {
    console.error("Get disputes error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get single dispute
export const getDisputeHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const dispute = await getDisputeById(id);

    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    res.json({ dispute });
  } catch (err) {
    console.error("Get dispute error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get dispute stats
export const getDisputeStatsHandler = async (req, res) => {
  try {
    const stats = await getDisputeStats();
    res.json({ stats });
  } catch (err) {
    console.error("Get dispute stats error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get dispute types for filter
export const getDisputeTypesHandler = async (req, res) => {
  try {
    const types = await getDisputeTypes();
    res.json({ types });
  } catch (err) {
    console.error("Get dispute types error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Update dispute status
export const updateDisputeStatusHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['open', 'under_review', 'resolved', 'closed', 'escalated'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const dispute = await updateDisputeStatus(id, status, req.admin.id);

    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    // Create audit log
    await createAuditLog(
      req.admin.id,
      "update_dispute_status",
      "dispute",
      id,
      { new_status: status }
    );

    res.json({ message: "Status updated", dispute });
  } catch (err) {
    console.error("Update dispute status error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Resolve dispute
export const resolveDisputeHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution, resolutionType } = req.body;

    if (!resolution || !resolutionType) {
      return res.status(400).json({ message: "Resolution and resolution type are required" });
    }

    const validResolutionTypes = [
      'side_with_reporter',
      'side_with_reported',
      'mutual_resolution',
      'escalated',
      'refund_issued',
      'user_suspended'
    ];
    if (!validResolutionTypes.includes(resolutionType)) {
      return res.status(400).json({ message: "Invalid resolution type" });
    }

    const dispute = await resolveDispute(id, resolution, resolutionType, req.admin.id);

    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    // Create audit log
    await createAuditLog(
      req.admin.id,
      "resolve_dispute",
      "dispute",
      id,
      { resolution_type: resolutionType }
    );

    res.json({ message: "Dispute resolved", dispute });
  } catch (err) {
    console.error("Resolve dispute error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Add admin notes to dispute
export const addDisputeNotesHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const dispute = await addDisputeAdminNotes(id, notes);

    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    // Create audit log
    await createAuditLog(
      req.admin.id,
      "add_dispute_notes",
      "dispute",
      id,
      {}
    );

    res.json({ message: "Notes updated", dispute });
  } catch (err) {
    console.error("Add dispute notes error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Update dispute priority
export const updateDisputePriorityHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;

    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ message: "Invalid priority" });
    }

    const dispute = await updateDisputePriority(id, priority);

    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    // Create audit log
    await createAuditLog(
      req.admin.id,
      "update_dispute_priority",
      "dispute",
      id,
      { new_priority: priority }
    );

    res.json({ message: "Priority updated", dispute });
  } catch (err) {
    console.error("Update dispute priority error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Escalate dispute
export const escalateDisputeHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const dispute = await escalateDispute(id, req.admin.id);

    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    // Create audit log
    await createAuditLog(
      req.admin.id,
      "escalate_dispute",
      "dispute",
      id,
      {}
    );

    res.json({ message: "Dispute escalated", dispute });
  } catch (err) {
    console.error("Escalate dispute error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
