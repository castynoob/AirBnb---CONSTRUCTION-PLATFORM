import multer from 'multer';

/**
 * File Upload Middleware using Multer
 *
 * Handles file uploads with validation for:
 * - File types (images, Excel files, PDFs)
 * - File sizes
 * - Multiple files
 */

// File size limits (in bytes)
const FILE_SIZE_LIMITS = {
  IMAGE: 5 * 1024 * 1024, // 5MB
  EXCEL: 10 * 1024 * 1024, // 10MB
  PDF: 10 * 1024 * 1024, // 10MB
};

// Allowed MIME types
const ALLOWED_MIME_TYPES = {
  IMAGES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  EXCEL: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'text/csv', // .csv
  ],
  PDF: ['application/pdf'],
};

/**
 * Configure multer for memory storage
 * Files are stored in memory as Buffer objects
 * This allows us to upload directly to Supabase without saving to disk
 */
const storage = multer.memoryStorage();

/**
 * Generic file filter function
 * @param {Array<string>} allowedTypes - Array of allowed MIME types
 * @returns {Function} Multer file filter function
 */
const createFileFilter = (allowedTypes) => {
  return (req, file, cb) => {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
        ),
        false
      );
    }
  };
};

/**
 * Image upload middleware
 * Accepts: JPG, PNG, WEBP
 * Max size: 5MB
 * Single file
 */
export const uploadImage = multer({
  storage,
  limits: {
    fileSize: FILE_SIZE_LIMITS.IMAGE,
  },
  fileFilter: createFileFilter(ALLOWED_MIME_TYPES.IMAGES),
}).single('image');

/**
 * Multiple images upload middleware
 * Accepts: JPG, PNG, WEBP
 * Max size: 5MB per file
 * Max files: 10
 */
export const uploadMultipleImages = multer({
  storage,
  limits: {
    fileSize: FILE_SIZE_LIMITS.IMAGE,
    files: 10,
  },
  fileFilter: createFileFilter(ALLOWED_MIME_TYPES.IMAGES),
}).array('images', 10);

/**
 * Excel file upload middleware
 * Accepts: XLSX, XLS, CSV
 * Max size: 10MB
 * Single file
 */
export const uploadExcel = multer({
  storage,
  limits: {
    fileSize: FILE_SIZE_LIMITS.EXCEL,
  },
  fileFilter: createFileFilter(ALLOWED_MIME_TYPES.EXCEL),
}).single('file');

/**
 * PDF file upload middleware
 * Accepts: PDF
 * Max size: 10MB
 * Single file
 */
export const uploadPDF = multer({
  storage,
  limits: {
    fileSize: FILE_SIZE_LIMITS.PDF,
  },
  fileFilter: createFileFilter(ALLOWED_MIME_TYPES.PDF),
}).single('file');

/**
 * Generic file upload middleware (any file type)
 * Use with caution - validate file types in controller
 * Max size: 10MB
 */
export const uploadAny = multer({
  storage,
  limits: {
    fileSize: FILE_SIZE_LIMITS.EXCEL,
  },
}).single('file');

/**
 * Multer error handler middleware
 * Catches multer errors and returns user-friendly messages
 *
 * Usage: Add after route handler
 * router.post('/upload', uploadImage, handleUploadError, controller);
 */
export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Multer-specific errors
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          error: 'File too large',
          message: 'File size exceeds the maximum allowed size',
          maxSize: err.field === 'image' ? '5MB' : '10MB',
        });

      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          error: 'Too many files',
          message: `Maximum ${err.limit} files allowed`,
        });

      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          error: 'Unexpected field',
          message: `Unexpected file field: ${err.field}`,
        });

      default:
        return res.status(400).json({
          error: 'Upload error',
          message: err.message,
        });
    }
  } else if (err) {
    // Other errors (e.g., invalid file type)
    return res.status(400).json({
      error: 'Invalid file',
      message: err.message,
    });
  }

  next();
};

/**
 * Validate file exists in request
 * Use as middleware before processing upload
 */
export const validateFileExists = (req, res, next) => {
  if (!req.file && !req.files) {
    return res.status(400).json({
      error: 'No file uploaded',
      message: 'Please provide a file to upload',
    });
  }
  next();
};

/**
 * Validate file type manually (use after uploadAny)
 * @param {Array<string>} allowedTypes - Array of allowed MIME types
 * @returns {Function} Express middleware
 */
export const validateFileType = (allowedTypes) => {
  return (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please provide a file to upload',
      });
    }

    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        error: 'Invalid file type',
        message: `Allowed types: ${allowedTypes.join(', ')}`,
        received: req.file.mimetype,
      });
    }

    next();
  };
};

/**
 * Rate limiting for file uploads
 * Prevents abuse by limiting uploads per user
 *
 * Note: This is a simple in-memory rate limiter
 * For production, use Redis-based rate limiting
 */
const uploadAttempts = new Map();

export const rateLimitUploads = (maxUploads = 10, windowMs = 60000) => {
  return (req, res, next) => {
    const userId = req.user?.id || req.ip;
    const now = Date.now();

    if (!uploadAttempts.has(userId)) {
      uploadAttempts.set(userId, []);
    }

    const attempts = uploadAttempts.get(userId);
    const recentAttempts = attempts.filter((time) => now - time < windowMs);

    if (recentAttempts.length >= maxUploads) {
      return res.status(429).json({
        error: 'Too many uploads',
        message: `Maximum ${maxUploads} uploads per minute. Please try again later.`,
      });
    }

    recentAttempts.push(now);
    uploadAttempts.set(userId, recentAttempts);

    next();
  };
};

/**
 * Log file upload details (for debugging)
 */
export const logUpload = (req, res, next) => {
  if (req.file) {
    console.log('[Upload]', {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: `${(req.file.size / 1024).toFixed(2)} KB`,
      userId: req.user?.id || 'anonymous',
    });
  } else if (req.files && req.files.length > 0) {
    console.log(`[Upload] ${req.files.length} files uploaded by user ${req.user?.id || 'anonymous'}`);
  }
  next();
};

export default {
  uploadImage,
  uploadMultipleImages,
  uploadExcel,
  uploadPDF,
  uploadAny,
  handleUploadError,
  validateFileExists,
  validateFileType,
  rateLimitUploads,
  logUpload,
};
