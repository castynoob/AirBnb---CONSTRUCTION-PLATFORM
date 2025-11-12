// src/controllers/supplierController.js
import pool from "../config/db.js";
import { uploadToSupabase, deleteFromSupabase, getPublicUrl, extractFilePathFromUrl, generateUniqueFileName } from '../utils/supabaseHelpers.js';
import { BUCKETS } from '../config/supabase.js';
import * as supplierModel from '../models/supplierModel.js';

// ========================================
// PROFILE MANAGEMENT
// ========================================

/**
 * Get supplier profile for logged-in user
 * GET /api/users/supplier/profile
 */
export const getSupplierProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const profile = await supplierModel.getSupplierProfileByUserId(userId);

    if (!profile) {
      return res.status(404).json({ message: "Supplier profile not found" });
    }

    res.status(200).json({
      message: "Supplier profile fetched successfully",
      profile
    });
  } catch (error) {
    console.error("Error fetching supplier profile:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get supplier profile by supplier ID
 * GET /api/suppliers/:id
 */
export const getSupplierProfileById = async (req, res) => {
  try {
    const supplierId = req.params.id;

    const profile = await supplierModel.getSupplierProfileById(supplierId);

    if (!profile) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    res.status(200).json({
      message: "Supplier profile fetched successfully",
      profile
    });
  } catch (error) {
    console.error("Error fetching supplier by ID:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get all suppliers (for entrepreneurs)
 * GET /api/suppliers
 */
export const getAllSuppliers = async (req, res) => {
  try {
    const { search } = req.query;

    let suppliers;
    if (search) {
      suppliers = await supplierModel.searchSuppliers(search);
    } else {
      suppliers = await supplierModel.getAllSuppliers();
    }

    res.status(200).json({
      message: "Suppliers fetched successfully",
      suppliers,
      count: suppliers.length
    });
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Update supplier profile
 * PUT /api/users/supplier/profile
 */
export const updateSupplierProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      company_name,
      address,
      phone,
      website,
      business_license,
      years_in_business,
      delivery_areas
    } = req.body;

    // Validate required fields
    if (!company_name || !address || !business_license) {
      return res.status(400).json({
        message: "Missing required fields: company_name, address, business_license"
      });
    }

    // Check if profile exists
    const existingProfile = await supplierModel.getSupplierProfileByUserId(userId);

    let profile;
    if (existingProfile) {
      // Update existing profile
      profile = await supplierModel.updateSupplierProfile(userId, {
        company_name,
        address,
        phone,
        website,
        business_license,
        years_in_business: years_in_business ? parseInt(years_in_business) : null,
        delivery_areas: delivery_areas || []
      });
    } else {
      // Create new profile
      profile = await supplierModel.createSupplierProfile({
        userId,
        company_name,
        address,
        phone,
        website,
        business_license,
        years_in_business: years_in_business ? parseInt(years_in_business) : null,
        delivery_areas: delivery_areas || []
      });
    }

    res.status(200).json({
      message: "Supplier profile updated successfully",
      profile
    });
  } catch (error) {
    console.error("Error updating supplier profile:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Upload supplier profile picture
 * POST /api/users/supplier/profile-picture
 */
export const uploadSupplierProfilePicture = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    // Get existing profile
    const profile = await supplierModel.getSupplierProfileByUserId(userId);

    if (!profile) {
      return res.status(404).json({ message: "Supplier profile not found" });
    }

    // Delete old image if exists
    if (profile.catalog_pdf_url) {
      try {
        const oldFilePath = extractFilePathFromUrl(profile.catalog_pdf_url, BUCKETS.PROFILE_IMAGES);
        if (oldFilePath) {
          await deleteFromSupabase(BUCKETS.PROFILE_IMAGES, oldFilePath);
        }
      } catch (error) {
        console.error("Error deleting old profile picture:", error);
      }
    }

    // Upload new image
    const fileName = generateUniqueFileName(req.file.originalname);
    const uploadResult = await uploadToSupabase({
      fileBuffer: req.file.buffer,
      bucket: BUCKETS.PROFILE_IMAGES,
      filePath: fileName,
      contentType: req.file.mimetype,
      upsert: false
    });

    if (!uploadResult.success) {
      return res.status(500).json({
        message: "Failed to upload profile picture",
        error: uploadResult.error
      });
    }

    const imageUrl = getPublicUrl(BUCKETS.PROFILE_IMAGES, uploadResult.data.path);

    // Update profile with new image URL
    await pool.query(
      'UPDATE supplier_profiles SET catalog_pdf_url = $1, updated_at = NOW() WHERE user_id = $2',
      [imageUrl, userId]
    );

    res.status(200).json({
      message: "Profile picture uploaded successfully",
      imageUrl
    });
  } catch (error) {
    console.error("Error uploading supplier profile picture:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Upload supplier catalog PDF
 * POST /api/users/supplier/catalog
 */
export const uploadCatalogPDF = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ message: "No catalog file provided" });
    }

    // Verify it's a PDF
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ message: "Only PDF files are allowed for catalogs" });
    }

    // Get existing profile
    const profile = await supplierModel.getSupplierProfileByUserId(userId);

    if (!profile) {
      return res.status(404).json({ message: "Supplier profile not found. Please create a profile first." });
    }

    // Delete old catalog if exists
    if (profile.catalog_pdf_url) {
      try {
        const oldFilePath = extractFilePathFromUrl(profile.catalog_pdf_url, BUCKETS.DOCUMENTS);
        if (oldFilePath) {
          await deleteFromSupabase(BUCKETS.DOCUMENTS, oldFilePath);
        }
      } catch (error) {
        console.error("Error deleting old catalog:", error);
      }
    }

    // Upload new catalog
    const fileName = generateUniqueFileName(req.file.originalname);
    const uploadResult = await uploadToSupabase({
      fileBuffer: req.file.buffer,
      bucket: BUCKETS.DOCUMENTS,
      filePath: fileName,
      contentType: req.file.mimetype,
      upsert: false
    });

    if (!uploadResult.success) {
      return res.status(500).json({
        message: "Failed to upload catalog",
        error: uploadResult.error
      });
    }

    const catalogUrl = getPublicUrl(BUCKETS.DOCUMENTS, uploadResult.data.path);

    // Update profile with new catalog URL
    const updatedProfile = await supplierModel.updateCatalogUrl(userId, catalogUrl);

    res.status(200).json({
      message: "Catalog uploaded successfully",
      catalogUrl,
      profile: updatedProfile
    });
  } catch (error) {
    console.error("Error uploading catalog:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ========================================
// SUPPLIER REQUESTS
// ========================================

/**
 * Create a material request (Entrepreneur → Supplier)
 * POST /api/supplier-requests
 */
export const createMaterialRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { supplier_id, request_details } = req.body;
    const file = req.file; // Uploaded PDF file (optional)

    // Validate: either text details OR file must be provided
    if (!supplier_id) {
      return res.status(400).json({
        message: "Missing required field: supplier_id"
      });
    }

    if (!request_details && !file) {
      return res.status(400).json({
        message: "Please provide either request details (text) or upload a PDF file"
      });
    }

    // Get entrepreneur profile
    const entrepreneurResult = await pool.query(
      'SELECT id FROM entrepreneur_profiles WHERE user_id = $1',
      [userId]
    );

    if (entrepreneurResult.rows.length === 0) {
      return res.status(404).json({ message: "Entrepreneur profile not found" });
    }

    const entrepreneurId = entrepreneurResult.rows[0].id;

    let requestFileUrl = null;

    // Handle file upload if provided
    if (file) {
      try {
        // Validate file type
        if (file.mimetype !== 'application/pdf') {
          return res.status(400).json({
            message: "Only PDF files are allowed"
          });
        }

        // Generate unique filename
        const uniqueFileName = generateUniqueFileName(file.originalname);
        const filePath = `supplier-requests/${supplier_id}/${uniqueFileName}`;

        // Upload to Supabase DOCUMENTS bucket
        const uploadResult = await uploadToSupabase({
          fileBuffer: file.buffer,
          bucket: BUCKETS.DOCUMENTS,
          filePath: filePath,
          contentType: file.mimetype,
          upsert: false,
        });

        if (!uploadResult.success) {
          return res.status(500).json({
            message: "Failed to upload file",
            error: uploadResult.error
          });
        }

        // Get public URL
        requestFileUrl = getPublicUrl(BUCKETS.DOCUMENTS, uploadResult.data.path);

        console.log(`[Upload] ✓ Request file uploaded: ${requestFileUrl}`);
      } catch (uploadError) {
        console.error("Error uploading request file:", uploadError);
        return res.status(500).json({
          message: "Failed to upload file",
          error: uploadError.message
        });
      }
    }

    // Create request with either text details or file URL
    const request = await supplierModel.createSupplierRequest({
      entrepreneurId,
      supplierId: supplier_id,
      requestDetails: request_details || null,
      requestFileUrl
    });

    res.status(201).json({
      message: "Material request created successfully",
      request
    });
  } catch (error) {
    console.error("Error creating material request:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Get all requests for supplier
 * GET /api/supplier-requests
 */
export const getMySupplierRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get supplier profile
    const profile = await supplierModel.getSupplierProfileByUserId(userId);

    if (!profile) {
      return res.status(404).json({ message: "Supplier profile not found" });
    }

    const requests = await supplierModel.getSupplierRequests(profile.id);

    res.status(200).json({
      message: "Requests fetched successfully",
      requests,
      count: requests.length
    });
  } catch (error) {
    console.error("Error fetching supplier requests:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get all requests made by entrepreneur
 * GET /api/my-supplier-requests
 */
export const getMyEntrepreneurRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get entrepreneur profile
    const entrepreneurResult = await pool.query(
      'SELECT id FROM entrepreneur_profiles WHERE user_id = $1',
      [userId]
    );

    if (entrepreneurResult.rows.length === 0) {
      return res.status(404).json({ message: "Entrepreneur profile not found" });
    }

    const entrepreneurId = entrepreneurResult.rows[0].id;
    const requests = await supplierModel.getEntrepreneurRequests(entrepreneurId);

    res.status(200).json({
      message: "Requests fetched successfully",
      requests,
      count: requests.length
    });
  } catch (error) {
    console.error("Error fetching entrepreneur requests:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get request by ID
 * GET /api/supplier-requests/:id
 */
export const getRequestById = async (req, res) => {
  try {
    const requestId = req.params.id;

    const request = await supplierModel.getRequestById(requestId);

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    res.status(200).json({
      message: "Request fetched successfully",
      request
    });
  } catch (error) {
    console.error("Error fetching request:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Update request status
 * PUT /api/supplier-requests/:id/status
 */
export const updateRequestStatus = async (req, res) => {
  try {
    const requestId = req.params.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    const validStatuses = ['pending', 'in-progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const request = await supplierModel.updateRequestStatus(requestId, status);

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    res.status(200).json({
      message: "Request status updated successfully",
      request
    });
  } catch (error) {
    console.error("Error updating request status:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ========================================
// INVOICES
// ========================================

/**
 * Create invoice for a request
 * POST /api/supplier-invoices
 */
export const createInvoice = async (req, res) => {
  try {
    const { requestId, items, totalAmount, deliveryTerms } = req.body;

    if (!requestId || !items || !totalAmount) {
      return res.status(400).json({
        message: "Missing required fields: requestId, items, totalAmount"
      });
    }

    // Verify request exists
    const request = await supplierModel.getRequestById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    // Create invoice
    const invoice = await supplierModel.createInvoice({
      requestId,
      items,
      totalAmount,
      deliveryTerms
    });

    res.status(201).json({
      message: "Invoice created successfully",
      invoice
    });
  } catch (error) {
    console.error("Error creating invoice:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get invoice by request ID
 * GET /api/supplier-invoices/request/:requestId
 */
export const getInvoiceByRequestId = async (req, res) => {
  try {
    const requestId = req.params.requestId;

    const invoice = await supplierModel.getInvoiceByRequestId(requestId);

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    res.status(200).json({
      message: "Invoice fetched successfully",
      invoice
    });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get all invoices for supplier
 * GET /api/supplier-invoices
 */
export const getSupplierInvoices = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get supplier profile
    const profile = await supplierModel.getSupplierProfileByUserId(userId);

    if (!profile) {
      return res.status(404).json({ message: "Supplier profile not found" });
    }

    const invoices = await supplierModel.getSupplierInvoices(profile.id);

    res.status(200).json({
      message: "Invoices fetched successfully",
      invoices,
      count: invoices.length
    });
  } catch (error) {
    console.error("Error fetching supplier invoices:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get all invoices for entrepreneur
 * GET /api/my-supplier-invoices
 */
export const getEntrepreneurInvoices = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get entrepreneur profile
    const entrepreneurResult = await pool.query(
      'SELECT id FROM entrepreneur_profiles WHERE user_id = $1',
      [userId]
    );

    if (entrepreneurResult.rows.length === 0) {
      return res.status(404).json({ message: "Entrepreneur profile not found" });
    }

    const entrepreneurId = entrepreneurResult.rows[0].id;
    const invoices = await supplierModel.getEntrepreneurInvoices(entrepreneurId);

    res.status(200).json({
      message: "Invoices fetched successfully",
      invoices,
      count: invoices.length
    });
  } catch (error) {
    console.error("Error fetching entrepreneur invoices:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Update invoice status
 * PUT /api/supplier-invoices/:id/status
 */
export const updateInvoiceStatus = async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    const validStatuses = ['pending', 'approved', 'rejected', 'paid'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const invoice = await supplierModel.updateInvoiceStatus(invoiceId, status);

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    res.status(200).json({
      message: "Invoice status updated successfully",
      invoice
    });
  } catch (error) {
    console.error("Error updating invoice status:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get supplier statistics
 * GET /api/supplier-stats
 */
export const getSupplierStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get supplier profile
    const profile = await supplierModel.getSupplierProfileByUserId(userId);

    if (!profile) {
      return res.status(404).json({ message: "Supplier profile not found" });
    }

    const stats = await supplierModel.getSupplierStats(profile.id);

    res.status(200).json({
      message: "Stats fetched successfully",
      stats
    });
  } catch (error) {
    console.error("Error fetching supplier stats:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export default {
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
};
