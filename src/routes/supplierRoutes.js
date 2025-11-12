// src/routes/supplierRoutes.js
import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { uploadImage, uploadCatalog, uploadRequestFile, handleUploadError } from "../middleware/uploadMiddleware.js";
import { cacheMiddleware, invalidateCache } from "../middleware/cacheMiddleware.js";
import { USER_KEYS, TTL } from "../utils/cacheKeys.js";
import {
  getSupplierProfile,
  getSupplierProfileById,
  getAllSuppliers,
  updateSupplierProfile,
  uploadSupplierProfilePicture,
  uploadCatalogPDF,
  createMaterialRequest,
  getMySupplierRequests,
  getMyEntrepreneurRequests,
  getRequestById,
  updateRequestStatus,
  createInvoice,
  getInvoiceByRequestId,
  getSupplierInvoices,
  getEntrepreneurInvoices,
  updateInvoiceStatus,
  getSupplierStats
} from "../controllers/supplierController.js";

const router = express.Router();

// ========================================
// SUPPLIER PROFILE ROUTES
// ========================================

/**
 * Get logged-in supplier's profile
 * GET /api/users/supplier/profile
 * Auth: supplier only
 */
router.get(
  "/users/supplier/profile",
  authenticateToken,
  authorizeRoles("supplier"),
  cacheMiddleware((req) => `supplier:profile:${req.user.id}`, TTL.ONE_HOUR),
  getSupplierProfile
);

/**
 * Update supplier profile
 * PUT /api/users/supplier/profile
 * Auth: supplier only
 */
router.put(
  "/users/supplier/profile",
  authenticateToken,
  authorizeRoles("supplier"),
  invalidateCache((req) => [`supplier:profile:${req.user.id}`, `suppliers:list`]),
  updateSupplierProfile
);

/**
 * Upload supplier profile picture
 * POST /api/users/supplier/profile-picture
 * Auth: supplier only
 */
router.post(
  "/users/supplier/profile-picture",
  authenticateToken,
  authorizeRoles("supplier"),
  uploadImage,
  handleUploadError,
  invalidateCache((req) => [`supplier:profile:${req.user.id}`, `suppliers:list`]),
  uploadSupplierProfilePicture
);

/**
 * Upload catalog PDF
 * POST /api/users/supplier/catalog
 * Auth: supplier only
 */
router.post(
  "/users/supplier/catalog",
  authenticateToken,
  authorizeRoles("supplier"),
  uploadCatalog,
  handleUploadError,
  invalidateCache((req) => [`supplier:profile:${req.user.id}`, `suppliers:list`]),
  uploadCatalogPDF
);

// ========================================
// SUPPLIER BROWSING ROUTES (For Entrepreneurs)
// ========================================

/**
 * Get all suppliers (for entrepreneurs to browse)
 * GET /api/suppliers?search=query
 * Auth: entrepreneur only
 */
router.get(
  "/suppliers",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  cacheMiddleware(() => `suppliers:list`, TTL.TEN_MINUTES),
  getAllSuppliers
);

/**
 * Get supplier by ID
 * GET /api/suppliers/:id
 * Auth: entrepreneur only
 */
router.get(
  "/suppliers/:id",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  cacheMiddleware((req) => `supplier:${req.params.id}`, TTL.ONE_HOUR),
  getSupplierProfileById
);

// ========================================
// MATERIAL REQUEST ROUTES
// ========================================

/**
 * Create material request (Entrepreneur → Supplier)
 * POST /api/supplier-requests
 * Auth: entrepreneur only
 */
router.post(
  "/supplier-requests",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  uploadRequestFile, // Handle optional file upload (PDF)
  handleUploadError, // Handle upload errors
  invalidateCache((req) => [`supplier:requests:${req.body.supplier_id}`, `entrepreneur:requests:${req.user.id}`]),
  createMaterialRequest
);

/**
 * Get all requests for supplier
 * GET /api/supplier-requests
 * Auth: supplier only
 */
router.get(
  "/supplier-requests",
  authenticateToken,
  authorizeRoles("supplier"),
  cacheMiddleware((req) => `supplier:requests:${req.user.id}`, TTL.FIVE_MINUTES),
  getMySupplierRequests
);

/**
 * Get all requests made by entrepreneur
 * GET /api/my-supplier-requests
 * Auth: entrepreneur only
 */
router.get(
  "/my-supplier-requests",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  cacheMiddleware((req) => `entrepreneur:requests:${req.user.id}`, TTL.FIVE_MINUTES),
  getMyEntrepreneurRequests
);

/**
 * Get request by ID
 * GET /api/supplier-requests/:id
 * Auth: supplier or entrepreneur
 */
router.get(
  "/supplier-requests/:id",
  authenticateToken,
  authorizeRoles("supplier", "entrepreneur"),
  cacheMiddleware((req) => `supplier:request:${req.params.id}`, TTL.FIVE_MINUTES),
  getRequestById
);

/**
 * Update request status
 * PUT /api/supplier-requests/:id/status
 * Auth: supplier or entrepreneur
 */
router.put(
  "/supplier-requests/:id/status",
  authenticateToken,
  authorizeRoles("supplier", "entrepreneur"),
  invalidateCache((req) => [
    `supplier:request:${req.params.id}`,
    `supplier:requests:*`,
    `entrepreneur:requests:*`
  ]),
  updateRequestStatus
);

// ========================================
// INVOICE ROUTES
// ========================================

/**
 * Create invoice for a request
 * POST /api/supplier-invoices
 * Auth: supplier only
 */
router.post(
  "/supplier-invoices",
  authenticateToken,
  authorizeRoles("supplier"),
  invalidateCache((req) => [
    `supplier:invoices:*`,
    `entrepreneur:invoices:*`,
    `supplier:request:${req.body.requestId}`
  ]),
  createInvoice
);

/**
 * Get invoice by request ID
 * GET /api/supplier-invoices/request/:requestId
 * Auth: supplier or entrepreneur
 */
router.get(
  "/supplier-invoices/request/:requestId",
  authenticateToken,
  authorizeRoles("supplier", "entrepreneur"),
  cacheMiddleware((req) => `supplier:invoice:request:${req.params.requestId}`, TTL.FIVE_MINUTES),
  getInvoiceByRequestId
);

/**
 * Get all invoices for supplier
 * GET /api/supplier-invoices
 * Auth: supplier only
 */
router.get(
  "/supplier-invoices",
  authenticateToken,
  authorizeRoles("supplier"),
  cacheMiddleware((req) => `supplier:invoices:${req.user.id}`, TTL.FIVE_MINUTES),
  getSupplierInvoices
);

/**
 * Get all invoices for entrepreneur
 * GET /api/my-supplier-invoices
 * Auth: entrepreneur only
 */
router.get(
  "/my-supplier-invoices",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  cacheMiddleware((req) => `entrepreneur:invoices:${req.user.id}`, TTL.FIVE_MINUTES),
  getEntrepreneurInvoices
);

/**
 * Update invoice status
 * PUT /api/supplier-invoices/:id/status
 * Auth: supplier or entrepreneur
 */
router.put(
  "/supplier-invoices/:id/status",
  authenticateToken,
  authorizeRoles("supplier", "entrepreneur"),
  invalidateCache((req) => [
    `supplier:invoice:${req.params.id}`,
    `supplier:invoices:*`,
    `entrepreneur:invoices:*`
  ]),
  updateInvoiceStatus
);

// ========================================
// STATISTICS ROUTES
// ========================================

/**
 * Get supplier statistics
 * GET /api/supplier-stats
 * Auth: supplier only
 */
router.get(
  "/supplier-stats",
  authenticateToken,
  authorizeRoles("supplier"),
  cacheMiddleware((req) => `supplier:stats:${req.user.id}`, TTL.FIVE_MINUTES),
  getSupplierStats
);

export default router;
