import { getSupabaseAdmin, BUCKETS } from '../config/supabase.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Upload a file to Supabase storage for message attachments
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - Original filename
 * @param {string} mimeType - File MIME type
 * @param {string} userId - User ID for organizing files
 * @returns {Promise<{url: string, fileName: string, size: number, type: string}>}
 */
export const uploadMessageFile = async (fileBuffer, fileName, mimeType, userId) => {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  // Generate unique filename
  const fileExt = fileName.split('.').pop();
  const uniqueFileName = `${userId}/${uuidv4()}.${fileExt}`;

  // Upload to Supabase
  const { data, error } = await supabase.storage
    .from(BUCKETS.MESSAGE_ATTACHMENTS)
    .upload(uniqueFileName, fileBuffer, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('[MessageUpload] Upload error:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKETS.MESSAGE_ATTACHMENTS)
    .getPublicUrl(uniqueFileName);

  return {
    url: urlData.publicUrl,
    fileName: fileName,
    size: fileBuffer.length,
    type: mimeType,
  };
};

/**
 * Delete a file from Supabase storage
 * @param {string} fileUrl - Full URL of the file to delete
 * @returns {Promise<void>}
 */
export const deleteMessageFile = async (fileUrl) => {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  // Extract file path from URL
  const urlParts = fileUrl.split(`${BUCKETS.MESSAGE_ATTACHMENTS}/`);
  if (urlParts.length < 2) {
    throw new Error('Invalid file URL');
  }

  const filePath = urlParts[1];

  const { error } = await supabase.storage
    .from(BUCKETS.MESSAGE_ATTACHMENTS)
    .remove([filePath]);

  if (error) {
    console.error('[MessageUpload] Delete error:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
};

/**
 * Validate file for upload
 * @param {number} fileSize - File size in bytes
 * @param {string} mimeType - File MIME type
 * @returns {{valid: boolean, error?: string}}
 */
export const validateMessageFile = (fileSize, mimeType) => {
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip',
  ];

  if (fileSize > MAX_SIZE) {
    return { valid: false, error: 'File size exceeds 10MB limit' };
  }

  if (!ALLOWED_TYPES.includes(mimeType)) {
    return { valid: false, error: 'File type not supported' };
  }

  return { valid: true };
};
