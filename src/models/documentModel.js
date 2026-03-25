// src/models/documentModel.js
import pool from "../config/db.js";

/**
 * Get all documents for a user with optional filters
 */
export const getDocumentsByOwner = async (ownerId, filters = {}) => {
  const { category, job_id, property_id, search } = filters;
  const values = [ownerId];
  let paramIndex = 2;

  let query = `
    SELECT d.*,
           j.title AS job_title,
           p.building_name AS property_name,
           p.address AS property_address
    FROM documents d
    LEFT JOIN jobs j ON d.job_id::text = j.id::text
    LEFT JOIN properties p ON d.property_id::text = p.id::text
    WHERE d.owner_id = $1
  `;

  if (category) {
    query += ` AND d.category = $${paramIndex}`;
    values.push(category);
    paramIndex++;
  }

  if (job_id) {
    query += ` AND d.job_id = $${paramIndex}`;
    values.push(job_id);
    paramIndex++;
  }

  if (property_id) {
    query += ` AND d.property_id = $${paramIndex}`;
    values.push(property_id);
    paramIndex++;
  }

  if (search) {
    query += ` AND (d.title ILIKE $${paramIndex} OR d.notes ILIKE $${paramIndex} OR d.file_name ILIKE $${paramIndex})`;
    values.push(`%${search}%`);
    paramIndex++;
  }

  query += ` ORDER BY d.created_at DESC`;

  const result = await pool.query(query, values);
  return result.rows;
};

/**
 * Get single document by ID
 */
export const getDocumentById = async (id) => {
  const result = await pool.query(
    `SELECT d.*,
            j.title AS job_title,
            p.building_name AS property_name,
            p.address AS property_address
     FROM documents d
     LEFT JOIN jobs j ON d.job_id::text = j.id::text
     LEFT JOIN properties p ON d.property_id::text = p.id::text
     WHERE d.id = $1`,
    [id]
  );
  return result.rows[0];
};

/**
 * Create a new document record
 */
export const createDocument = async (data) => {
  const {
    owner_id,
    job_id = null,
    property_id = null,
    contract_id = null,
    category,
    title,
    file_url,
    file_name,
    file_size = null,
    file_type = null,
    notes = null,
    expires_at = null,
  } = data;

  const result = await pool.query(
    `INSERT INTO documents (
      owner_id, job_id, property_id, contract_id,
      category, title, file_url, file_name, file_size, file_type,
      notes, expires_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
    ) RETURNING *`,
    [
      owner_id, job_id, property_id, contract_id,
      category, title, file_url, file_name, file_size, file_type,
      notes, expires_at,
    ]
  );
  return result.rows[0];
};

/**
 * Update document metadata (verify ownership)
 */
export const updateDocument = async (id, ownerId, data) => {
  const allowedFields = ['title', 'category', 'notes', 'expires_at', 'job_id', 'property_id'];
  const fields = Object.keys(data).filter((key) => allowedFields.includes(key));

  if (fields.length === 0) return null;

  const setClause = fields.map((key, idx) => `${key} = $${idx + 3}`).join(', ');
  const values = [id, ownerId, ...fields.map((key) => data[key])];

  const result = await pool.query(
    `UPDATE documents SET ${setClause}, updated_at = NOW()
     WHERE id = $1 AND owner_id = $2
     RETURNING *`,
    values
  );
  return result.rows[0];
};

/**
 * Delete document (verify ownership), return file_url for Supabase cleanup
 */
export const deleteDocument = async (id, ownerId) => {
  const result = await pool.query(
    `DELETE FROM documents WHERE id = $1 AND owner_id = $2 RETURNING *`,
    [id, ownerId]
  );
  return result.rows[0];
};

/**
 * Get all documents linked to a job
 */
export const getDocumentsByJob = async (jobId) => {
  const result = await pool.query(
    `SELECT d.*, u.first_name, u.last_name
     FROM documents d
     LEFT JOIN users u ON d.owner_id = u.id
     WHERE d.job_id = $1
     ORDER BY d.created_at DESC`,
    [jobId]
  );
  return result.rows;
};

/**
 * Get all documents linked to a property
 */
export const getDocumentsByProperty = async (propertyId) => {
  const result = await pool.query(
    `SELECT d.*, u.first_name, u.last_name
     FROM documents d
     LEFT JOIN users u ON d.owner_id = u.id
     WHERE d.property_id = $1
     ORDER BY d.created_at DESC`,
    [propertyId]
  );
  return result.rows;
};

/**
 * Get documents expiring within N days
 */
export const getExpiringDocuments = async (ownerId, daysAhead = 30) => {
  const result = await pool.query(
    `SELECT d.*,
            j.title AS job_title,
            p.building_name AS property_name
     FROM documents d
     LEFT JOIN jobs j ON d.job_id::text = j.id::text
     LEFT JOIN properties p ON d.property_id::text = p.id::text
     WHERE d.owner_id = $1
       AND d.expires_at IS NOT NULL
       AND d.expires_at <= NOW() + INTERVAL '1 day' * $2
       AND d.expires_at >= NOW()
     ORDER BY d.expires_at ASC`,
    [ownerId, daysAhead]
  );
  return result.rows;
};
