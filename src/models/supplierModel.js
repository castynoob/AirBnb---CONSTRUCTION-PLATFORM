// src/models/supplierModel.js
import pool from "../config/db.js";

/**
 * Get supplier profile by user ID
 */
export const getSupplierProfileByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT sp.*, u.email, u.phone
     FROM supplier_profiles sp
     JOIN users u ON sp.user_id = u.id
     WHERE sp.user_id = $1`,
    [userId]
  );
  return result.rows[0];
};

/**
 * Get supplier profile by supplier profile ID
 */
export const getSupplierProfileById = async (supplierId) => {
  const result = await pool.query(
    `SELECT sp.*, u.email, u.phone, u.first_name, u.last_name
     FROM supplier_profiles sp
     JOIN users u ON sp.user_id = u.id
     WHERE sp.id = $1`,
    [supplierId]
  );
  return result.rows[0];
};

/**
 * Create supplier profile
 */
export const createSupplierProfile = async ({
  userId,
  company_name,
  address,
  phone,
  website,
  business_license,
  years_in_business,
  delivery_areas
}) => {
  const result = await pool.query(
    `INSERT INTO supplier_profiles
      (user_id, company_name, address, phone, website, business_license, years_in_business, delivery_areas)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [userId, company_name, address, phone, website, business_license, years_in_business, delivery_areas]
  );
  return result.rows[0];
};

/**
 * Update supplier profile
 */
export const updateSupplierProfile = async (userId, {
  company_name,
  address,
  phone,
  website,
  business_license,
  years_in_business,
  delivery_areas
}) => {
  const result = await pool.query(
    `UPDATE supplier_profiles
     SET company_name = $1,
         address = $2,
         phone = $3,
         website = $4,
         business_license = $5,
         years_in_business = $6,
         delivery_areas = $7,
         updated_at = NOW()
     WHERE user_id = $8
     RETURNING *`,
    [company_name, address, phone, website, business_license, years_in_business, delivery_areas, userId]
  );
  return result.rows[0];
};

/**
 * Update catalog PDF URL
 */
export const updateCatalogUrl = async (userId, catalogUrl) => {
  const result = await pool.query(
    `UPDATE supplier_profiles
     SET catalog_pdf_url = $1,
         updated_at = NOW()
     WHERE user_id = $2
     RETURNING *`,
    [catalogUrl, userId]
  );
  return result.rows[0];
};

/**
 * Get all suppliers (for entrepreneurs to browse)
 */
export const getAllSuppliers = async () => {
  const result = await pool.query(
    `SELECT sp.*, u.email, u.phone, u.first_name, u.last_name
     FROM supplier_profiles sp
     JOIN users u ON sp.user_id = u.id
     ORDER BY sp.created_at DESC`
  );
  return result.rows;
};

/**
 * Search suppliers by company name or areas
 */
export const searchSuppliers = async (searchTerm) => {
  const result = await pool.query(
    `SELECT sp.*, u.email, u.phone, u.first_name, u.last_name
     FROM supplier_profiles sp
     JOIN users u ON sp.user_id = u.id
     WHERE sp.company_name ILIKE $1
        OR EXISTS (
          SELECT 1 FROM unnest(sp.delivery_areas) AS area
          WHERE area ILIKE $1
        )
     ORDER BY sp.created_at DESC`,
    [`%${searchTerm}%`]
  );
  return result.rows;
};

// ========================================
// SUPPLIER REQUESTS
// ========================================

/**
 * Create a material request from entrepreneur to supplier
 */
export const createSupplierRequest = async ({
  entrepreneurId,
  supplierId,
  requestDetails,
  requestFileUrl
}) => {
  const result = await pool.query(
    `INSERT INTO supplier_requests
      (entrepreneur_id, supplier_id, request_details, request_file_url, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [entrepreneurId, supplierId, requestDetails, requestFileUrl]
  );
  return result.rows[0];
};

/**
 * Get all requests for a supplier
 */
export const getSupplierRequests = async (supplierId) => {
  const result = await pool.query(
    `SELECT sr.*,
            ep.company_name as entrepreneur_company_name,
            ep.user_id as entrepreneur_user_id,
            u.email as entrepreneur_email,
            u.phone as entrepreneur_phone
     FROM supplier_requests sr
     JOIN entrepreneur_profiles ep ON sr.entrepreneur_id = ep.id
     JOIN users u ON ep.user_id = u.id
     WHERE sr.supplier_id = $1
     ORDER BY sr.created_at DESC`,
    [supplierId]
  );
  return result.rows;
};

/**
 * Get all requests made by an entrepreneur
 */
export const getEntrepreneurRequests = async (entrepreneurId) => {
  const result = await pool.query(
    `SELECT sr.*,
            sp.company_name as supplier_company_name,
            sp.user_id as supplier_user_id,
            u.email as supplier_email,
            u.phone as supplier_phone
     FROM supplier_requests sr
     JOIN supplier_profiles sp ON sr.supplier_id = sp.id
     JOIN users u ON sp.user_id = u.id
     WHERE sr.entrepreneur_id = $1
     ORDER BY sr.created_at DESC`,
    [entrepreneurId]
  );
  return result.rows;
};

/**
 * Get request by ID
 */
export const getRequestById = async (requestId) => {
  const result = await pool.query(
    `SELECT sr.*,
            ep.company_name as entrepreneur_company_name,
            ep.user_id as entrepreneur_user_id,
            sp.company_name as supplier_company_name,
            sp.user_id as supplier_user_id
     FROM supplier_requests sr
     JOIN entrepreneur_profiles ep ON sr.entrepreneur_id = ep.id
     JOIN supplier_profiles sp ON sr.supplier_id = sp.id
     WHERE sr.id = $1`,
    [requestId]
  );
  return result.rows[0];
};

/**
 * Update request status
 */
export const updateRequestStatus = async (requestId, status) => {
  const result = await pool.query(
    `UPDATE supplier_requests
     SET status = $1
     WHERE id = $2
     RETURNING *`,
    [status, requestId]
  );
  return result.rows[0];
};

// ========================================
// SUPPLIER INVOICES
// ========================================

/**
 * Create invoice for a request
 */
export const createInvoice = async ({
  requestId,
  items,
  totalAmount,
  deliveryTerms
}) => {
  const result = await pool.query(
    `INSERT INTO supplier_invoices
      (request_id, items, total_amount, delivery_terms, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [requestId, items, totalAmount, deliveryTerms]
  );
  return result.rows[0];
};

/**
 * Get invoice by request ID
 */
export const getInvoiceByRequestId = async (requestId) => {
  const result = await pool.query(
    `SELECT si.*, sr.entrepreneur_id, sr.supplier_id
     FROM supplier_invoices si
     JOIN supplier_requests sr ON si.request_id = sr.id
     WHERE si.request_id = $1`,
    [requestId]
  );
  return result.rows[0];
};

/**
 * Get all invoices for a supplier
 */
export const getSupplierInvoices = async (supplierId) => {
  const result = await pool.query(
    `SELECT si.*, sr.request_details,
            ep.company_name as entrepreneur_company_name
     FROM supplier_invoices si
     JOIN supplier_requests sr ON si.request_id = sr.id
     JOIN entrepreneur_profiles ep ON sr.entrepreneur_id = ep.id
     WHERE sr.supplier_id = $1
     ORDER BY si.created_at DESC`,
    [supplierId]
  );
  return result.rows;
};

/**
 * Get all invoices received by entrepreneur
 */
export const getEntrepreneurInvoices = async (entrepreneurId) => {
  const result = await pool.query(
    `SELECT si.*, sr.request_details,
            sp.company_name as supplier_company_name
     FROM supplier_invoices si
     JOIN supplier_requests sr ON si.request_id = sr.id
     JOIN supplier_profiles sp ON sr.supplier_id = sp.id
     WHERE sr.entrepreneur_id = $1
     ORDER BY si.created_at DESC`,
    [entrepreneurId]
  );
  return result.rows;
};

/**
 * Update invoice status
 */
export const updateInvoiceStatus = async (invoiceId, status) => {
  const result = await pool.query(
    `UPDATE supplier_invoices
     SET status = $1
     WHERE id = $2
     RETURNING *`,
    [status, invoiceId]
  );
  return result.rows[0];
};

/**
 * Get supplier statistics
 */
export const getSupplierStats = async (supplierId) => {
  const result = await pool.query(
    `SELECT
      COUNT(sr.id) as total_requests,
      COUNT(CASE WHEN sr.status = 'pending' THEN 1 END) as pending_requests,
      COUNT(CASE WHEN sr.status = 'completed' THEN 1 END) as completed_requests,
      COUNT(si.id) as total_invoices
     FROM supplier_profiles sp
     LEFT JOIN supplier_requests sr ON sp.id = sr.supplier_id
     LEFT JOIN supplier_invoices si ON sr.id = si.request_id
     WHERE sp.id = $1
     GROUP BY sp.id`,
    [supplierId]
  );
  return result.rows[0] || {
    total_requests: 0,
    pending_requests: 0,
    completed_requests: 0,
    total_invoices: 0
  };
};

export default {
  getSupplierProfileByUserId,
  getSupplierProfileById,
  createSupplierProfile,
  updateSupplierProfile,
  updateCatalogUrl,
  getAllSuppliers,
  searchSuppliers,
  createSupplierRequest,
  getSupplierRequests,
  getEntrepreneurRequests,
  getRequestById,
  updateRequestStatus,
  createInvoice,
  getInvoiceByRequestId,
  getSupplierInvoices,
  getEntrepreneurInvoices,
  updateInvoiceStatus,
  getSupplierStats
};
