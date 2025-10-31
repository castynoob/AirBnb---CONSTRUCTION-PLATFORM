import { getSupabaseAdmin, BUCKETS } from '../config/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

/**
 * Supabase Storage Helper Functions
 *
 * Provides utility functions for uploading, deleting, and managing files
 * in Supabase storage buckets.
 */

/**
 * Generate a unique file name with timestamp and UUID
 * @param {string} originalName - Original file name
 * @returns {string} Unique file name
 */
export const generateUniqueFileName = (originalName) => {
  const timestamp = Date.now();
  const uuid = uuidv4().split('-')[0]; // Use first part of UUID
  const ext = path.extname(originalName);
  const nameWithoutExt = path.basename(originalName, ext).replace(/[^a-zA-Z0-9]/g, '_');
  return `${timestamp}-${uuid}-${nameWithoutExt}${ext}`;
};

/**
 * Sanitize file name (remove special characters)
 * @param {string} fileName - File name to sanitize
 * @returns {string} Sanitized file name
 */
export const sanitizeFileName = (fileName) => {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
};

/**
 * Upload file to Supabase storage
 *
 * @param {Object} params
 * @param {Buffer} params.fileBuffer - File buffer from multer
 * @param {string} params.bucket - Bucket name
 * @param {string} params.filePath - Path within bucket (e.g., "userId/filename.jpg")
 * @param {string} params.contentType - MIME type
 * @param {boolean} params.upsert - Whether to overwrite existing file (default: false)
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export const uploadToSupabase = async ({
  fileBuffer,
  bucket,
  filePath,
  contentType,
  upsert = false,
}) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return {
        success: false,
        error: 'Supabase not configured',
      };
    }

    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        contentType,
        upsert,
        cacheControl: '3600',
      });

    if (error) {
      console.error(`[Supabase] Upload error:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      data: {
        path: data.path,
        fullPath: data.fullPath,
      },
    };
  } catch (error) {
    console.error(`[Supabase] Upload exception:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Delete file from Supabase storage
 *
 * @param {string} bucket - Bucket name
 * @param {string} filePath - Path within bucket
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const deleteFromSupabase = async (bucket, filePath) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return {
        success: false,
        error: 'Supabase not configured',
      };
    }

    const { data, error } = await supabaseAdmin.storage.from(bucket).remove([filePath]);

    if (error) {
      console.error(`[Supabase] Delete error:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error(`[Supabase] Delete exception:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get public URL for a file
 *
 * @param {string} bucket - Bucket name
 * @param {string} filePath - Path within bucket
 * @returns {string|null} Public URL or null if not configured
 */
export const getPublicUrl = (bucket, filePath) => {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return null;
  }

  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(filePath);

  return data.publicUrl;
};

/**
 * Get signed URL for private files (expires after specified time)
 *
 * @param {string} bucket - Bucket name
 * @param {string} filePath - Path within bucket
 * @param {number} expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export const getSignedUrl = async (bucket, filePath, expiresIn = 3600) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return {
        success: false,
        error: 'Supabase not configured',
      };
    }

    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      console.error(`[Supabase] Signed URL error:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      url: data.signedUrl,
    };
  } catch (error) {
    console.error(`[Supabase] Signed URL exception:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * List files in a bucket path
 *
 * @param {string} bucket - Bucket name
 * @param {string} folderPath - Folder path (e.g., "userId/")
 * @returns {Promise<{success: boolean, files?: Array, error?: string}>}
 */
export const listFiles = async (bucket, folderPath = '') => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return {
        success: false,
        error: 'Supabase not configured',
      };
    }

    const { data, error } = await supabaseAdmin.storage.from(bucket).list(folderPath);

    if (error) {
      console.error(`[Supabase] List files error:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      files: data,
    };
  } catch (error) {
    console.error(`[Supabase] List files exception:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Download file from Supabase storage
 *
 * @param {string} bucket - Bucket name
 * @param {string} filePath - Path within bucket
 * @returns {Promise<{success: boolean, data?: Blob, error?: string}>}
 */
export const downloadFromSupabase = async (bucket, filePath) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return {
        success: false,
        error: 'Supabase not configured',
      };
    }

    const { data, error } = await supabaseAdmin.storage.from(bucket).download(filePath);

    if (error) {
      console.error(`[Supabase] Download error:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error(`[Supabase] Download exception:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Delete old file and upload new one (for replacing profile images, etc.)
 *
 * @param {Object} params
 * @param {Buffer} params.fileBuffer - New file buffer
 * @param {string} params.bucket - Bucket name
 * @param {string} params.oldFilePath - Path to old file (to delete)
 * @param {string} params.newFilePath - Path for new file
 * @param {string} params.contentType - MIME type
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export const replaceFile = async ({
  fileBuffer,
  bucket,
  oldFilePath,
  newFilePath,
  contentType,
}) => {
  try {
    // Delete old file if it exists
    if (oldFilePath) {
      await deleteFromSupabase(bucket, oldFilePath);
    }

    // Upload new file
    const result = await uploadToSupabase({
      fileBuffer,
      bucket,
      filePath: newFilePath,
      contentType,
      upsert: false,
    });

    return result;
  } catch (error) {
    console.error(`[Supabase] Replace file exception:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Extract file path from Supabase URL
 * Useful for deleting files when you only have the URL
 *
 * @param {string} url - Supabase storage URL
 * @param {string} bucket - Bucket name
 * @returns {string|null} File path or null if invalid URL
 */
export const extractFilePathFromUrl = (url, bucket) => {
  try {
    const bucketPath = `/storage/v1/object/public/${bucket}/`;
    const index = url.indexOf(bucketPath);

    if (index === -1) {
      return null;
    }

    return url.substring(index + bucketPath.length);
  } catch (error) {
    console.error(`[Supabase] Extract path error:`, error.message);
    return null;
  }
};

export default {
  generateUniqueFileName,
  sanitizeFileName,
  uploadToSupabase,
  deleteFromSupabase,
  getPublicUrl,
  getSignedUrl,
  listFiles,
  downloadFromSupabase,
  replaceFile,
  extractFilePathFromUrl,
};
