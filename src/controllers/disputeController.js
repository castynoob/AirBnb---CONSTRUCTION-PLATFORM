// ============================================
// USER DISPUTE CONTROLLER
// Allows users to file and view disputes
// ============================================

import pool from '../config/db.js';

const disputeController = {
  /**
   * Create a new dispute
   * POST /api/disputes
   */
  async createDispute(req, res) {
    try {
      const userId = req.user.id;
      const { type, job_id, reported_id, reason } = req.body;

      // Validate required fields
      if (!type || !reason) {
        return res.status(400).json({
          success: false,
          message: 'Dispute type and reason are required'
        });
      }

      // Validate dispute type
      const validTypes = [
        'job_quality',
        'payment',
        'non_delivery',
        'review_dispute',
        'contract_violation',
        'other'
      ];

      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid dispute type'
        });
      }

      // If job_id is provided, verify user is involved in the job
      if (job_id) {
        const jobCheck = await pool.query(
          `SELECT id, manager_id, assigned_contractor_id, title
           FROM jobs
           WHERE id = $1 AND (manager_id = $2 OR assigned_contractor_id = $2)`,
          [job_id, userId]
        );

        if (jobCheck.rows.length === 0) {
          return res.status(403).json({
            success: false,
            message: 'You are not involved in this job'
          });
        }
      }

      // Create the dispute
      const result = await pool.query(
        `INSERT INTO disputes (reporter_id, reported_id, job_id, type, reason, status, priority)
         VALUES ($1, $2, $3, $4, $5, 'open', 'medium')
         RETURNING *`,
        [userId, reported_id || null, job_id || null, type, reason]
      );

      const dispute = result.rows[0];

      console.log('📝 User dispute created:', {
        disputeId: dispute.id,
        disputeNumber: dispute.dispute_number,
        type,
        reporterId: userId
      });

      res.status(201).json({
        success: true,
        message: 'Dispute filed successfully. Our team will review it within 24-48 hours.',
        dispute: {
          id: dispute.id,
          dispute_number: dispute.dispute_number,
          type: dispute.type,
          status: dispute.status,
          created_at: dispute.created_at
        }
      });
    } catch (error) {
      console.error('❌ Error creating dispute:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create dispute',
        error: error.message
      });
    }
  },

  /**
   * Get user's filed disputes
   * GET /api/disputes/my-disputes
   */
  async getMyDisputes(req, res) {
    try {
      const userId = req.user.id;
      const { status } = req.query;

      let query = `
        SELECT
          d.id,
          d.dispute_number,
          d.type,
          d.reason,
          d.status,
          d.priority,
          d.resolution,
          d.resolution_type,
          d.created_at,
          d.updated_at,
          d.resolved_at,
          j.title as job_title,
          ru.first_name as reported_first_name,
          ru.last_name as reported_last_name
        FROM disputes d
        LEFT JOIN jobs j ON d.job_id = j.id
        LEFT JOIN users ru ON d.reported_id = ru.id
        WHERE d.reporter_id = $1
      `;
      const params = [userId];

      if (status) {
        query += ` AND d.status = $2`;
        params.push(status);
      }

      query += ` ORDER BY d.created_at DESC`;

      const result = await pool.query(query, params);

      res.json({
        success: true,
        disputes: result.rows
      });
    } catch (error) {
      console.error('❌ Error fetching user disputes:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch disputes',
        error: error.message
      });
    }
  },

  /**
   * Get a single dispute by ID
   * GET /api/disputes/:disputeId
   */
  async getDispute(req, res) {
    try {
      const userId = req.user.id;
      const { disputeId } = req.params;

      const result = await pool.query(
        `SELECT
          d.id,
          d.dispute_number,
          d.type,
          d.reason,
          d.evidence,
          d.status,
          d.priority,
          d.resolution,
          d.resolution_type,
          d.created_at,
          d.updated_at,
          d.resolved_at,
          j.title as job_title,
          j.status as job_status,
          ru.first_name as reported_first_name,
          ru.last_name as reported_last_name,
          ru.email as reported_email
        FROM disputes d
        LEFT JOIN jobs j ON d.job_id = j.id
        LEFT JOIN users ru ON d.reported_id = ru.id
        WHERE d.id = $1 AND (d.reporter_id = $2 OR d.reported_id = $2)`,
        [disputeId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Dispute not found'
        });
      }

      res.json({
        success: true,
        dispute: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Error fetching dispute:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dispute',
        error: error.message
      });
    }
  },

  /**
   * Get user's jobs for dispute form
   * GET /api/jobs/my-jobs
   */
  async getMyJobs(req, res) {
    try {
      const userId = req.user.id;

      const result = await pool.query(
        `SELECT id, title, status, created_at
         FROM jobs
         WHERE manager_id = $1 OR assigned_contractor_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [userId]
      );

      res.json({
        success: true,
        jobs: result.rows
      });
    } catch (error) {
      console.error('❌ Error fetching user jobs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch jobs',
        error: error.message
      });
    }
  }
};

export default disputeController;
