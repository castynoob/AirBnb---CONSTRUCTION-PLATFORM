/**
 * Validation utilities for request parameters
 */

/**
 * Validates if a string is a valid UUID v4 format
 * @param {string} id - The ID to validate
 * @returns {boolean} - True if valid UUID, false otherwise
 */
export const isValidUUID = (id) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

/**
 * Validates UUID parameter and sends error response if invalid
 * @param {string} id - The ID to validate
 * @param {object} res - Express response object
 * @param {string} resourceName - Name of the resource (e.g., 'property', 'job')
 * @returns {boolean} - True if valid, false if invalid (and response sent)
 */
export const validateUUID = (id, res, resourceName = 'resource') => {
  // Check for null, undefined, or invalid string values
  if (!id || id === 'null' || id === 'undefined') {
    res.status(400).json({
      message: `Invalid ${resourceName} ID`
    });
    return false;
  }

  // Validate UUID format
  if (!isValidUUID(id)) {
    res.status(400).json({
      message: `Invalid ${resourceName} ID format`
    });
    return false;
  }

  return true;
};

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email format
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validates phone number (basic validation)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid phone format
 */
export const isValidPhone = (phone) => {
  // Allows formats: +1234567890, 123-456-7890, (123) 456-7890, etc.
  const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
  return phoneRegex.test(phone);
};

/**
 * Validates postal code (Canadian format)
 * @param {string} postalCode - Postal code to validate
 * @returns {boolean} - True if valid Canadian postal code
 */
export const isValidPostalCode = (postalCode) => {
  // Canadian postal code format: A1A 1A1 or A1A1A1
  const postalCodeRegex = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
  return postalCodeRegex.test(postalCode);
};

/**
 * Sanitizes string input to prevent XSS
 * @param {string} input - String to sanitize
 * @returns {string} - Sanitized string
 */
export const sanitizeString = (input) => {
  if (typeof input !== 'string') return input;

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Validates required fields in request body
 * @param {object} body - Request body
 * @param {string[]} requiredFields - Array of required field names
 * @returns {object} - { valid: boolean, missing: string[] }
 */
export const validateRequiredFields = (body, requiredFields) => {
  const missing = [];

  for (const field of requiredFields) {
    if (!body[field] || (typeof body[field] === 'string' && body[field].trim() === '')) {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing
  };
};
