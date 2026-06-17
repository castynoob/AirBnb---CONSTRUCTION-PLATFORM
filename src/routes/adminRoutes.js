import express from "express";
import {
  adminLogin,
  adminLogout,
  getCurrentAdmin,
  getDashboardStats,
  getDashboardCharts,
  getActivityFeed,
  getRevenueChart,
  getJobsChart,
  getUsersChart,
  getUsers,
  getUser,
  getUserActivityHandler,
  suspendUserHandler,
  activateUserHandler,
  getAuditLogsHandler,
  getJobs,
  getJob,
  getJobCategoriesHandler,
  flagJobHandler,
  unflagJobHandler,
  addJobNotesHandler,
  forceCloseJobHandler,
  getBids,
  getBid,
  getBidStatsHandler,
  flagBidHandler,
  unflagBidHandler,
  addBidNotesHandler,
  getProperties,
  getProperty,
  getPropertyStatsHandler,
  getPropertyCitiesHandler,
  getBuildingTypesHandler,
  flagPropertyHandler,
  unflagPropertyHandler,
  addPropertyNotesHandler,
  getTransactionStatsHandler,
  getBudgetUnlocks,
  getBudgetUnlock,
  getRevenueChartData,
  getSubscriptions,
  getSubscriptionStatsHandler,
  getSubscriptionGrowthHandler,
  getPlanDistributionHandler,
  getSubscriptionHandler,
  extendTrialHandler,
  endTrialHandler,
  cancelSubscriptionHandler,
  reactivateSubscriptionHandler,
  changePlanHandler,
  getSupportTicketsHandler,
  getSupportTicketHandler,
  getTicketMessagesHandler,
  addTicketMessageHandler,
  updateTicketStatusHandler,
  getDisputesHandler,
  getDisputeHandler,
  getDisputeStatsHandler,
  getDisputeTypesHandler,
  updateDisputeStatusHandler,
  resolveDisputeHandler,
  addDisputeNotesHandler,
  updateDisputePriorityHandler,
  escalateDisputeHandler,
} from "../controllers/adminController.js";
import {
  listManagers,
  adminCreateProperty,
  adminUpdateProperty,
  adminDeleteProperty,
  adminCreateJob,
  adminUpdateJob,
  adminDeleteJob,
} from "../controllers/adminPropertyJobController.js";
import {
  listMyProperties,
  listMyJobs,
} from "../controllers/adminOwnedController.js";
import {
  listAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
} from "../controllers/adminUserController.js";
import {
  adminParseInspection,
  adminCreateJobsFromInspection,
} from "../controllers/adminInspectionController.js";
import {
  getAdminNotifications,
  getAdminUnreadCount,
  markAdminNotificationAsRead,
  markAllAdminNotificationsAsRead,
  markJobNotificationsAsRead,
  deleteAdminNotification,
  clearAdminNotifications,
} from "../controllers/adminNotificationController.js";
import {
  listBidsOnMyJob,
  approveBidAsAdmin,
  declineBidAsAdmin,
  cancelBidApprovalAsAdmin,
  listMyContracts,
  confirmContractCompletionAsAdmin,
  validateProgressStageAsAdmin,
} from "../controllers/adminLifecycleController.js";
import {
  uploadExcel,
  handleUploadError,
  validateFileExists,
  logUpload,
} from "../middleware/uploadMiddleware.js";
import {
  authenticateAdmin,
  isAdminOrHigher,
  isModeratorOrHigher,
  isSuperAdmin,
} from "../middleware/adminAuth.js";

const router = express.Router();

// ============================================
// PUBLIC ROUTES (No auth required)
// ============================================
router.post("/login", adminLogin);

// ============================================
// PROTECTED ROUTES (Admin auth required)
// ============================================

// Auth
router.post("/logout", authenticateAdmin, adminLogout);
router.get("/me", authenticateAdmin, getCurrentAdmin);

// Dashboard
router.get("/dashboard/stats", authenticateAdmin, getDashboardStats);
router.get("/dashboard/charts", authenticateAdmin, getDashboardCharts);
router.get("/dashboard/activity", authenticateAdmin, getActivityFeed);
router.get("/dashboard/revenue", authenticateAdmin, getRevenueChart);
router.get("/dashboard/jobs", authenticateAdmin, getJobsChart);
router.get("/dashboard/users", authenticateAdmin, getUsersChart);

// User Management
router.get("/users", authenticateAdmin, isModeratorOrHigher, getUsers);
router.get("/users/:id", authenticateAdmin, isModeratorOrHigher, getUser);
router.get("/users/:id/activity", authenticateAdmin, isModeratorOrHigher, getUserActivityHandler);
router.post("/users/:id/suspend", authenticateAdmin, isAdminOrHigher, suspendUserHandler);
router.post("/users/:id/activate", authenticateAdmin, isAdminOrHigher, activateUserHandler);

// Job Management
router.get("/jobs", authenticateAdmin, isModeratorOrHigher, getJobs);
router.get("/jobs/categories", authenticateAdmin, getJobCategoriesHandler);
router.get("/jobs/:id", authenticateAdmin, isModeratorOrHigher, getJob);
router.post("/jobs/:id/flag", authenticateAdmin, isModeratorOrHigher, flagJobHandler);
router.post("/jobs/:id/unflag", authenticateAdmin, isModeratorOrHigher, unflagJobHandler);
router.post("/jobs/:id/notes", authenticateAdmin, isModeratorOrHigher, addJobNotesHandler);
router.post("/jobs/:id/close", authenticateAdmin, isAdminOrHigher, forceCloseJobHandler);

// Bid Management
router.get("/bids", authenticateAdmin, isModeratorOrHigher, getBids);
router.get("/bids/stats", authenticateAdmin, getBidStatsHandler);
router.get("/bids/:id", authenticateAdmin, isModeratorOrHigher, getBid);
router.post("/bids/:id/flag", authenticateAdmin, isModeratorOrHigher, flagBidHandler);
router.post("/bids/:id/unflag", authenticateAdmin, isModeratorOrHigher, unflagBidHandler);
router.post("/bids/:id/notes", authenticateAdmin, isModeratorOrHigher, addBidNotesHandler);

// Property Management
router.get("/properties", authenticateAdmin, isModeratorOrHigher, getProperties);
router.get("/properties/stats", authenticateAdmin, getPropertyStatsHandler);
router.get("/properties/cities", authenticateAdmin, getPropertyCitiesHandler);
router.get("/properties/building-types", authenticateAdmin, getBuildingTypesHandler);
router.get("/properties/:id", authenticateAdmin, isModeratorOrHigher, getProperty);
router.post("/properties/:id/flag", authenticateAdmin, isModeratorOrHigher, flagPropertyHandler);
router.post("/properties/:id/unflag", authenticateAdmin, isModeratorOrHigher, unflagPropertyHandler);
router.post("/properties/:id/notes", authenticateAdmin, isModeratorOrHigher, addPropertyNotesHandler);

// Property CRUD (admin self-owns OR acts on behalf of a property manager)
router.post("/properties", authenticateAdmin, isAdminOrHigher, adminCreateProperty);
router.put("/properties/:id", authenticateAdmin, isAdminOrHigher, adminUpdateProperty);
router.delete("/properties/:id", authenticateAdmin, isAdminOrHigher, adminDeleteProperty);

// Manager directory for the "act on behalf of" dropdown
router.get("/managers", authenticateAdmin, isAdminOrHigher, listManagers);

// Job CRUD (admin self-owns OR acts on behalf of a property manager)
router.post("/jobs", authenticateAdmin, isAdminOrHigher, adminCreateJob);
router.put("/jobs/:id", authenticateAdmin, isAdminOrHigher, adminUpdateJob);
router.delete("/jobs/:id", authenticateAdmin, isAdminOrHigher, adminDeleteJob);

// Admin-owned listings (the "My Properties" / "My Jobs" pages)
router.get("/my-properties", authenticateAdmin, isAdminOrHigher, listMyProperties);
router.get("/my-jobs", authenticateAdmin, isAdminOrHigher, listMyJobs);

// Job lifecycle — bids on admin-owned jobs + bid actions
router.get(
  "/my-jobs/:jobId/bids",
  authenticateAdmin, isAdminOrHigher, listBidsOnMyJob
);
router.patch(
  "/bids/:id/approve",
  authenticateAdmin, isAdminOrHigher, approveBidAsAdmin
);
router.patch(
  "/bids/:id/decline",
  authenticateAdmin, isAdminOrHigher, declineBidAsAdmin
);
router.patch(
  "/bids/:id/cancel-approval",
  authenticateAdmin, isAdminOrHigher, cancelBidApprovalAsAdmin
);

// Admin-owned contracts
router.get(
  "/my-contracts",
  authenticateAdmin, isAdminOrHigher, listMyContracts
);
router.post(
  "/contracts/:id/confirm-completion",
  authenticateAdmin, isAdminOrHigher, confirmContractCompletionAsAdmin
);

// Progress stage validation on an admin-owned job
router.put(
  "/progress/stage/:stageId/validate",
  authenticateAdmin, isAdminOrHigher, validateProgressStageAsAdmin
);

// Inspection upload (Excel → bulk job creation)
// Two-step flow: upload+parse returns the parsed jobs; then create-jobs persists them.
router.post(
  "/inspections/parse",
  authenticateAdmin,
  isAdminOrHigher,
  uploadExcel,
  handleUploadError,
  validateFileExists,
  logUpload,
  adminParseInspection
);
router.post(
  "/inspections/create-jobs",
  authenticateAdmin,
  isAdminOrHigher,
  adminCreateJobsFromInspection
);

// ============================================
// Admin notifications (bell feed for admin-owned jobs/contracts)
// ============================================
router.get(
  "/notifications",
  authenticateAdmin, isAdminOrHigher, getAdminNotifications
);
router.get(
  "/notifications/unread-count",
  authenticateAdmin, isAdminOrHigher, getAdminUnreadCount
);
router.patch(
  "/notifications/read-all",
  authenticateAdmin, isAdminOrHigher, markAllAdminNotificationsAsRead
);
router.patch(
  "/notifications/job/:jobId/read",
  authenticateAdmin, isAdminOrHigher, markJobNotificationsAsRead
);
router.patch(
  "/notifications/:id/read",
  authenticateAdmin, isAdminOrHigher, markAdminNotificationAsRead
);
router.delete(
  "/notifications/clear-all",
  authenticateAdmin, isAdminOrHigher, clearAdminNotifications
);
router.delete(
  "/notifications/:id",
  authenticateAdmin, isAdminOrHigher, deleteAdminNotification
);

// Admin user management (create/list/update/deactivate admin accounts)
// Listing & updating allowed for admin+; creating & deleting require super_admin
// to prevent privilege escalation through self-managed admin accounts.
router.get("/admins", authenticateAdmin, isAdminOrHigher, listAdmins);
router.post("/admins", authenticateAdmin, isSuperAdmin, createAdmin);
router.patch("/admins/:id", authenticateAdmin, isAdminOrHigher, updateAdmin);
router.delete("/admins/:id", authenticateAdmin, isSuperAdmin, deleteAdmin);

// Audit Logs
router.get("/audit-logs", authenticateAdmin, isAdminOrHigher, getAuditLogsHandler);

// Transaction / Payment Management
router.get("/transactions/stats", authenticateAdmin, isAdminOrHigher, getTransactionStatsHandler);
router.get("/transactions", authenticateAdmin, isAdminOrHigher, getBudgetUnlocks);
router.get("/transactions/revenue-chart", authenticateAdmin, isAdminOrHigher, getRevenueChartData);
router.get("/transactions/:id", authenticateAdmin, isAdminOrHigher, getBudgetUnlock);

// Subscription Management
router.get("/subscriptions", authenticateAdmin, isAdminOrHigher, getSubscriptions);
router.get("/subscriptions/stats", authenticateAdmin, isAdminOrHigher, getSubscriptionStatsHandler);
router.get("/subscriptions/growth", authenticateAdmin, isAdminOrHigher, getSubscriptionGrowthHandler);
router.get("/subscriptions/distribution", authenticateAdmin, isAdminOrHigher, getPlanDistributionHandler);
router.get("/subscriptions/:id", authenticateAdmin, isAdminOrHigher, getSubscriptionHandler);
router.post("/subscriptions/:id/extend-trial", authenticateAdmin, isAdminOrHigher, extendTrialHandler);
router.post("/subscriptions/:id/end-trial", authenticateAdmin, isAdminOrHigher, endTrialHandler);
router.post("/subscriptions/:id/cancel", authenticateAdmin, isAdminOrHigher, cancelSubscriptionHandler);
router.post("/subscriptions/:id/reactivate", authenticateAdmin, isAdminOrHigher, reactivateSubscriptionHandler);
router.post("/subscriptions/:id/change-plan", authenticateAdmin, isAdminOrHigher, changePlanHandler);

// Support Ticket Management
router.get("/support/tickets", authenticateAdmin, isModeratorOrHigher, getSupportTicketsHandler);
router.get("/support/tickets/:id", authenticateAdmin, isModeratorOrHigher, getSupportTicketHandler);
router.get("/support/tickets/:id/messages", authenticateAdmin, isModeratorOrHigher, getTicketMessagesHandler);
router.post("/support/tickets/:id/messages", authenticateAdmin, isModeratorOrHigher, addTicketMessageHandler);
router.patch("/support/tickets/:id/status", authenticateAdmin, isModeratorOrHigher, updateTicketStatusHandler);

// Dispute Management
router.get("/disputes", authenticateAdmin, isModeratorOrHigher, getDisputesHandler);
router.get("/disputes/stats", authenticateAdmin, isModeratorOrHigher, getDisputeStatsHandler);
router.get("/disputes/types", authenticateAdmin, isModeratorOrHigher, getDisputeTypesHandler);
router.get("/disputes/:id", authenticateAdmin, isModeratorOrHigher, getDisputeHandler);
router.patch("/disputes/:id/status", authenticateAdmin, isModeratorOrHigher, updateDisputeStatusHandler);
router.post("/disputes/:id/resolve", authenticateAdmin, isModeratorOrHigher, resolveDisputeHandler);
router.post("/disputes/:id/notes", authenticateAdmin, isModeratorOrHigher, addDisputeNotesHandler);
router.patch("/disputes/:id/priority", authenticateAdmin, isModeratorOrHigher, updateDisputePriorityHandler);
router.post("/disputes/:id/escalate", authenticateAdmin, isAdminOrHigher, escalateDisputeHandler);

export default router;
