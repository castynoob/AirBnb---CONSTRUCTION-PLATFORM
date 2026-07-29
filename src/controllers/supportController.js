// ============================================
// SUPPORT TICKET CONTROLLER
// Handles user support tickets
// ============================================

import pool from '../config/db.js';
import {
  emailNewTicketToAdmin,
  emailUserReplyToAdmin,
} from '../config/supportEmail.js';

const supportController = {
  /**
   * Create a new support ticket
   * POST /api/support/tickets
   */
  async createTicket(req, res) {
    try {
      const userId = req.user.id;
      const { subject, description, category, priority } = req.body;

      // Validate required fields
      if (!subject || !description) {
        return res.status(400).json({
          success: false,
          message: 'Subject and description are required'
        });
      }

      // Create the ticket
      const result = await pool.query(
        `INSERT INTO support_tickets (user_id, subject, description, category, priority, status)
         VALUES ($1, $2, $3, $4, $5, 'open')
         RETURNING *`,
        [userId, subject, description, category || 'general', priority || 'medium']
      );

      const ticket = result.rows[0];

      console.log('📝 Support ticket created:', {
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        userId,
        category
      });

      // Fire-and-forget email to the routed admin inbox. Failure must NOT
      // break the API response; the ticket is already saved and visible in
      // the admin dashboard regardless.
      pool.query(
        'SELECT id, email, first_name, last_name, role FROM users WHERE id = $1',
        [userId]
      )
        .then((r) => {
          if (r.rows[0]) return emailNewTicketToAdmin({ ticket, user: r.rows[0] });
        })
        .catch((err) => console.error('⚠️ new-ticket email lookup failed:', err.message));

      res.status(201).json({
        success: true,
        message: 'Support ticket created successfully',
        ticket: {
          id: ticket.id,
          ticketNumber: ticket.ticket_number,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          createdAt: ticket.created_at
        }
      });
    } catch (error) {
      console.error('❌ Error creating support ticket:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create support ticket',
        error: error.message
      });
    }
  },

  /**
   * Get user's support tickets
   * GET /api/support/tickets
   */
  async getTickets(req, res) {
    try {
      const userId = req.user.id;
      const { status } = req.query;

      let query = `
        SELECT
          id, ticket_number, subject, description, category,
          priority, status, created_at, updated_at, resolved_at
        FROM support_tickets
        WHERE user_id = $1
      `;
      const params = [userId];

      if (status) {
        query += ` AND status = $2`;
        params.push(status);
      }

      query += ` ORDER BY created_at DESC`;

      const result = await pool.query(query, params);

      res.json({
        success: true,
        tickets: result.rows
      });
    } catch (error) {
      console.error('❌ Error fetching support tickets:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch support tickets',
        error: error.message
      });
    }
  },

  /**
   * Get a single support ticket by ID
   * GET /api/support/tickets/:ticketId
   */
  async getTicket(req, res) {
    try {
      const userId = req.user.id;
      const { ticketId } = req.params;

      const result = await pool.query(
        `SELECT
          st.id, st.ticket_number, st.subject, st.description,
          st.category, st.priority, st.status, st.created_at,
          st.updated_at, st.resolved_at,
          (
            SELECT json_agg(
              json_build_object(
                'id', tm.id,
                'message', tm.message,
                'sender_type', tm.sender_type,
                'is_internal', tm.is_internal,
                'created_at', tm.created_at
              ) ORDER BY tm.created_at ASC
            )
            FROM ticket_messages tm
            WHERE tm.ticket_id = st.id AND tm.is_internal = false
          ) as messages
        FROM support_tickets st
        WHERE st.id = $1 AND st.user_id = $2`,
        [ticketId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Support ticket not found'
        });
      }

      res.json({
        success: true,
        ticket: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Error fetching support ticket:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch support ticket',
        error: error.message
      });
    }
  },

  /**
   * Add a message to a support ticket
   * POST /api/support/tickets/:ticketId/messages
   */
  async addMessage(req, res) {
    try {
      const userId = req.user.id;
      const { ticketId } = req.params;
      const { message } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Message content is required'
        });
      }

      // Verify the ticket belongs to the user — grab ticket + user in one
      // trip so we can email the admin without a second lookup.
      const ticketCheck = await pool.query(
        `SELECT st.id, st.ticket_number, st.subject, st.category, st.priority, st.status,
                u.id AS uid, u.email, u.first_name, u.last_name, u.role
           FROM support_tickets st
           JOIN users u ON u.id = st.user_id
          WHERE st.id = $1 AND st.user_id = $2`,
        [ticketId, userId]
      );

      if (ticketCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Support ticket not found'
        });
      }

      const row = ticketCheck.rows[0];

      // Add the message
      const result = await pool.query(
        `INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message)
         VALUES ($1, 'user', $2, $3)
         RETURNING *`,
        [ticketId, userId, message.trim()]
      );

      // Update ticket updated_at
      await pool.query(
        'UPDATE support_tickets SET updated_at = NOW() WHERE id = $1',
        [ticketId]
      );

      // Fire-and-forget notify admin. Never blocks / crashes the reply.
      emailUserReplyToAdmin({
        ticket: {
          id: row.id,
          ticket_number: row.ticket_number,
          subject: row.subject,
          category: row.category,
          priority: row.priority,
          status: row.status,
        },
        user: { id: row.uid, email: row.email, first_name: row.first_name, last_name: row.last_name, role: row.role },
        messageText: message.trim(),
      }).catch((err) => console.error('⚠️ user-reply email failed:', err.message));

      res.status(201).json({
        success: true,
        message: 'Message added successfully',
        ticketMessage: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Error adding ticket message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add message',
        error: error.message
      });
    }
  },

  /**
   * Get messages for a support ticket
   * GET /api/support/tickets/:ticketId/messages
   */
  async getMessages(req, res) {
    try {
      const userId = req.user.id;
      const { ticketId } = req.params;

      // Verify the ticket belongs to the user
      const ticketCheck = await pool.query(
        'SELECT id FROM support_tickets WHERE id = $1 AND user_id = $2',
        [ticketId, userId]
      );

      if (ticketCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Support ticket not found'
        });
      }

      const result = await pool.query(
        `SELECT id, message, sender_type, created_at
         FROM ticket_messages
         WHERE ticket_id = $1 AND is_internal = false
         ORDER BY created_at ASC`,
        [ticketId]
      );

      res.json({
        success: true,
        messages: result.rows
      });
    } catch (error) {
      console.error('❌ Error fetching ticket messages:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch messages',
        error: error.message
      });
    }
  }
};

export default supportController;
