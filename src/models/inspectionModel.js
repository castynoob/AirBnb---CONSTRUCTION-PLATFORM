import db from '../config/db.js';

/**
 * Inspection Report Model
 * Handles database operations for inspection reports and Excel uploads
 */

const InspectionModel = {
  /**
   * Create a new inspection report record
   * @param {Object} data - Inspection data
   * @returns {Promise<Object>} Created inspection record
   */
  async create(data) {
    const {
      property_id,
      file_url,
      file_name,
      file_size,
      file_type,
      uploaded_by,
      parsed_job_count = 0,
      status = 'pending',
    } = data;

    const query = `
      INSERT INTO inspection_reports (
        property_id, file_url, file_name, file_size, file_type,
        uploaded_by, parsed_job_count, status, uploaded_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `;

    const values = [
      property_id,
      file_url,
      file_name,
      file_size,
      file_type,
      uploaded_by,
      parsed_job_count,
      status,
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  },

  /**
   * Get inspection by ID
   * @param {string} id - Inspection ID
   * @returns {Promise<Object|null>}
   */
  async getById(id) {
    const query = `
      SELECT ir.*, p.address as property_address, u.first_name, u.last_name
      FROM inspection_reports ir
      LEFT JOIN properties p ON ir.property_id = p.id
      LEFT JOIN users u ON ir.uploaded_by = u.id
      WHERE ir.id = $1
    `;

    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  },

  /**
   * Get all inspections for a property
   * @param {string} propertyId - Property ID
   * @returns {Promise<Array>}
   */
  async getByPropertyId(propertyId) {
    const query = `
      SELECT ir.*, u.first_name, u.last_name
      FROM inspection_reports ir
      LEFT JOIN users u ON ir.uploaded_by = u.id
      WHERE ir.property_id = $1
      ORDER BY ir.uploaded_at DESC
    `;

    const result = await db.query(query, [propertyId]);
    return result.rows;
  },

  /**
   * Get all inspections uploaded by a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>}
   */
  async getByUserId(userId) {
    const query = `
      SELECT ir.*, p.address as property_address
      FROM inspection_reports ir
      LEFT JOIN properties p ON ir.property_id = p.id
      WHERE ir.uploaded_by = $1
      ORDER BY ir.uploaded_at DESC
    `;

    const result = await db.query(query, [userId]);
    return result.rows;
  },

  /**
   * Update inspection status and parsed job count
   * @param {string} id - Inspection ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>}
   */
  async update(id, updates) {
    const { status, parsed_job_count } = updates;

    const query = `
      UPDATE inspection_reports
      SET
        status = COALESCE($2, status),
        parsed_job_count = COALESCE($3, parsed_job_count)
      WHERE id = $1
      RETURNING *
    `;

    const values = [id, status, parsed_job_count];
    const result = await db.query(query, values);
    return result.rows[0];
  },

  /**
   * Delete inspection by ID
   * @param {string} id - Inspection ID
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    const query = `DELETE FROM inspection_reports WHERE id = $1 RETURNING id`;
    const result = await db.query(query, [id]);
    return result.rowCount > 0;
  },

  /**
   * Get inspection statistics for a property
   * @param {string} propertyId - Property ID
   * @returns {Promise<Object>}
   */
  async getStatsByProperty(propertyId) {
    const query = `
      SELECT
        COUNT(*) as total_inspections,
        SUM(parsed_job_count) as total_jobs_parsed,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_inspections,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_inspections
      FROM inspection_reports
      WHERE property_id = $1
    `;

    const result = await db.query(query, [propertyId]);
    return result.rows[0];
  },
};

export default InspectionModel;
