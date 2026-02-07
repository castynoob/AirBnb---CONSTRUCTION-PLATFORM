// ============================================
// CONTRACT CONTROLLER
// Handles contract workflow between managers and entrepreneurs
// Note: Payments are handled externally, outside the application
// ============================================

import pool from '../config/db.js';
import { getIO } from '../config/socketSetup.js';
import { createNotification } from './notificationController.js';

const ContractController = {
  /**
   * CREATE CONTRACT
   * Creates a contract after a bid is approved
   * POST /api/contracts/create
   */
  async createContract(req, res) {
    try {
      const { bid_id } = req.body;
      const user_id = req.user.id;

      if (!bid_id) {
        return res.status(400).json({ error: 'Bid ID is required' });
      }

      // Verify the manager owns the job for this bid
      const bidResult = await pool.query(
        `SELECT b.id, b.job_id, b.entrepreneur_id, b.amount, b.status,
                j.title as job_title, j.manager_id,
                mp.id as manager_profile_id
         FROM bids b
         JOIN jobs j ON b.job_id = j.id
         JOIN manager_profiles mp ON j.manager_id = mp.id
         WHERE b.id = $1 AND mp.user_id = $2`,
        [bid_id, user_id]
      );

      if (bidResult.rows.length === 0) {
        return res.status(403).json({
          error: 'Bid not found or you do not own this job'
        });
      }

      const bid = bidResult.rows[0];

      // Check if bid is in valid status for contract creation
      // Allow 'pending' bids as well since payment happens before approval
      if (!['pending', 'approved'].includes(bid.status)) {
        return res.status(400).json({
          error: 'Cannot create contract for this bid',
          message: 'Bid must be pending or approved',
          current_status: bid.status
        });
      }

      // Check if contract already exists
      const existingContract = await pool.query(
        'SELECT id, status FROM contracts WHERE job_id = $1',
        [bid.job_id]
      );

      if (existingContract.rows.length > 0) {
        return res.status(400).json({
          error: 'Contract already exists for this job',
          contract_id: existingContract.rows[0].id,
          status: existingContract.rows[0].status
        });
      }

      // Get contract amount from bid
      const contractAmount = parseFloat(bid.amount);

      // Create contract - payments are handled externally
      const contractResult = await pool.query(
        `INSERT INTO contracts
         (job_id, bid_id, manager_id, entrepreneur_id,
          contract_amount, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         RETURNING *`,
        [
          bid.job_id,
          bid_id,
          bid.manager_profile_id,
          bid.entrepreneur_id,
          contractAmount
        ]
      );

      const contract = contractResult.rows[0];

      // Get entrepreneur's user_id (jobs.entrepreneur_id stores USER ID, not profile ID)
      const entrepreneurResult = await pool.query(
        `SELECT u.id as user_id FROM entrepreneur_profiles ep
         JOIN users u ON ep.user_id = u.id WHERE ep.id = $1`,
        [bid.entrepreneur_id]
      );

      const entrepreneurUserId = entrepreneurResult.rows[0]?.user_id;

      // Update job with contract status and assign entrepreneur
      // NOTE: entrepreneur_id column stores the USER ID, not entrepreneur_profiles.id
      await pool.query(
        `UPDATE jobs SET
           has_contract = true,
           contract_status = 'active',
           entrepreneur_id = $2,
           status = 'accepted'
         WHERE id = $1`,
        [bid.job_id, entrepreneurUserId]
      );

      console.log(`📝 Contract created: ${contract.id} for job ${bid.job_id}, assigned to entrepreneur user: ${entrepreneurUserId}`);

      // Log contract creation event
      await pool.query(
        `INSERT INTO contract_events (contract_id, event_type, actor_user_id, actor_role, event_data)
         VALUES ($1, 'contract_created', $2, 'manager', $3)`,
        [contract.id, user_id, JSON.stringify({ bid_id, contract_amount: contractAmount, entrepreneur_user_id: entrepreneurUserId })]
      );

      if (entrepreneurResult.rows[0]) {
        await createNotification({
          userId: entrepreneurResult.rows[0].user_id,
          type: 'contract_created',
          jobId: bid.job_id,
          jobTitle: bid.job_title,
          content: `Contract created for "${bid.job_title}". You can now start the work!`
        });

        const io = getIO();
        if (io) {
          io.to(entrepreneurResult.rows[0].user_id.toString()).emit('contract_created', {
            contractId: contract.id,
            jobId: bid.job_id,
            jobTitle: bid.job_title
          });
        }
      }

      res.status(201).json({
        success: true,
        message: 'Contract created successfully. Work can begin immediately.',
        contract: {
          id: contract.id,
          job_id: contract.job_id,
          contract_amount: contractAmount,
          status: contract.status
        }
      });

    } catch (error) {
      console.error('❌ Create contract error:', error);
      res.status(500).json({
        error: 'Failed to create contract',
        message: error.message
      });
    }
  },

  /**
   * MARK WORK COMPLETE
   * Entrepreneur marks work as complete
   * POST /api/contracts/:id/complete
   */
  async markWorkComplete(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      // Get contract and verify entrepreneur owns it
      const contractResult = await pool.query(
        `SELECT c.*, ep.user_id as entrepreneur_user_id,
                j.title as job_title, j.manager_id
         FROM contracts c
         JOIN entrepreneur_profiles ep ON c.entrepreneur_id = ep.id
         JOIN jobs j ON c.job_id = j.id
         WHERE c.id = $1`,
        [id]
      );

      if (contractResult.rows.length === 0) {
        return res.status(404).json({ error: 'Contract not found' });
      }

      const contract = contractResult.rows[0];

      if (contract.entrepreneur_user_id !== user_id) {
        return res.status(403).json({ error: 'Only the contractor can mark work as complete' });
      }

      if (contract.status !== 'active' && contract.status !== 'in_progress') {
        return res.status(400).json({
          error: 'Contract must be active before marking complete',
          current_status: contract.status
        });
      }

      // Update contract
      await pool.query(
        `UPDATE contracts
         SET work_completed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [id]
      );

      // Log event
      await pool.query(
        `INSERT INTO contract_events (contract_id, event_type, actor_user_id, actor_role)
         VALUES ($1, 'work_completed', $2, 'entrepreneur')`,
        [id, user_id]
      );

      // Notify manager
      const managerResult = await pool.query(
        `SELECT u.id as user_id FROM manager_profiles mp
         JOIN users u ON mp.user_id = u.id WHERE mp.id = $1`,
        [contract.manager_id]
      );

      if (managerResult.rows[0]) {
        await createNotification({
          userId: managerResult.rows[0].user_id,
          type: 'work_completed',
          jobId: contract.job_id,
          jobTitle: contract.job_title,
          content: `Work has been marked complete for "${contract.job_title}". Please review and approve.`
        });

        // Socket notification
        const io = getIO();
        if (io) {
          io.to(managerResult.rows[0].user_id.toString()).emit('work_completed', {
            contractId: id,
            jobId: contract.job_id,
            jobTitle: contract.job_title
          });
        }
      }

      console.log(`✅ Work marked complete for contract ${id}`);

      res.json({
        success: true,
        message: 'Work marked as complete. Awaiting manager approval.',
        contract_id: id
      });

    } catch (error) {
      console.error('❌ Mark work complete error:', error);
      res.status(500).json({
        error: 'Failed to mark work complete',
        message: error.message
      });
    }
  },

  /**
   * APPROVE WORK
   * Manager approves work completion
   * Note: Payment is handled externally, outside the application
   * POST /api/contracts/:id/approve
   */
  async approveWork(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      // Get contract and verify manager owns it
      const contractResult = await pool.query(
        `SELECT c.*, mp.user_id as manager_user_id,
                eu.id as entrepreneur_user_id,
                j.title as job_title
         FROM contracts c
         JOIN manager_profiles mp ON c.manager_id = mp.id
         JOIN entrepreneur_profiles ep ON c.entrepreneur_id = ep.id
         JOIN users eu ON ep.user_id = eu.id
         JOIN jobs j ON c.job_id = j.id
         WHERE c.id = $1`,
        [id]
      );

      if (contractResult.rows.length === 0) {
        return res.status(404).json({ error: 'Contract not found' });
      }

      const contract = contractResult.rows[0];

      if (contract.manager_user_id !== user_id) {
        return res.status(403).json({ error: 'Only the job owner can approve work' });
      }

      if (contract.status === 'completed') {
        return res.status(400).json({
          error: 'Work has already been approved',
          status: contract.status
        });
      }

      // Update contract status to completed
      await pool.query(
        `UPDATE contracts
         SET status = 'completed',
             approved_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [id]
      );

      // Update job status
      await pool.query(
        `UPDATE jobs SET status = 'completed', contract_status = 'completed' WHERE id = $1`,
        [contract.job_id]
      );

      // Log event
      await pool.query(
        `INSERT INTO contract_events (contract_id, event_type, actor_user_id, actor_role, event_data)
         VALUES ($1, 'work_approved', $2, 'manager', $3)`,
        [id, user_id, JSON.stringify({ contract_amount: contract.contract_amount })]
      );

      // Notify entrepreneur
      await createNotification({
        userId: contract.entrepreneur_user_id,
        type: 'work_approved',
        jobId: contract.job_id,
        jobTitle: contract.job_title,
        content: `Your work for "${contract.job_title}" has been approved! Please arrange payment with the property manager outside the application.`
      });

      const io = getIO();
      if (io) {
        io.to(contract.entrepreneur_user_id.toString()).emit('work_approved', {
          contractId: id,
          jobId: contract.job_id,
          jobTitle: contract.job_title,
          amount: contract.contract_amount
        });
      }

      console.log(`✅ Work approved for contract ${id}`);

      res.json({
        success: true,
        message: 'Work approved successfully! Please arrange payment with the contractor outside the application.',
        contract: {
          id: contract.id,
          job_id: contract.job_id,
          contract_amount: parseFloat(contract.contract_amount),
          status: 'completed'
        }
      });

    } catch (error) {
      console.error('❌ Approve work error:', error);
      res.status(500).json({
        error: 'Failed to approve work',
        message: error.message
      });
    }
  },

  /**
   * GET CONTRACT DETAILS
   * GET /api/contracts/:id
   */
  async getContract(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      const result = await pool.query(
        `SELECT c.*,
                j.title as job_title, j.description as job_description,
                mp.user_id as manager_user_id,
                mu.first_name as manager_first_name, mu.last_name as manager_last_name,
                ep.company_name, ep.user_id as entrepreneur_user_id,
                eu.first_name as entrepreneur_first_name, eu.last_name as entrepreneur_last_name
         FROM contracts c
         JOIN jobs j ON c.job_id = j.id
         JOIN manager_profiles mp ON c.manager_id = mp.id
         JOIN users mu ON mp.user_id = mu.id
         JOIN entrepreneur_profiles ep ON c.entrepreneur_id = ep.id
         JOIN users eu ON ep.user_id = eu.id
         WHERE c.id = $1
           AND (mp.user_id = $2 OR ep.user_id = $2)`,
        [id, user_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Contract not found' });
      }

      const contract = result.rows[0];
      const isManager = contract.manager_user_id === user_id;

      res.json({
        contract: {
          id: contract.id,
          job_id: contract.job_id,
          job_title: contract.job_title,
          contract_amount: parseFloat(contract.contract_amount),
          status: contract.status,
          work_completed_at: contract.work_completed_at,
          approved_at: contract.approved_at,
          created_at: contract.created_at
        },
        manager: {
          name: `${contract.manager_first_name} ${contract.manager_last_name}`,
          is_current_user: isManager
        },
        entrepreneur: {
          name: `${contract.entrepreneur_first_name} ${contract.entrepreneur_last_name}`,
          company: contract.company_name,
          is_current_user: !isManager
        },
        // Note: Payments are handled externally, outside the application
        payment_note: 'Payment arrangements should be made directly between the property manager and contractor.'
      });

    } catch (error) {
      console.error('❌ Get contract error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET CONTRACTS FOR USER
   * GET /api/contracts
   */
  async getContracts(req, res) {
    try {
      const user_id = req.user.id;
      const { status } = req.query;

      let query = `
        SELECT c.*,
               j.title as job_title,
               mu.first_name as manager_first_name, mu.last_name as manager_last_name,
               eu.first_name as entrepreneur_first_name, eu.last_name as entrepreneur_last_name,
               ep.company_name,
               CASE WHEN mp.user_id = $1 THEN 'manager' ELSE 'entrepreneur' END as user_role
        FROM contracts c
        JOIN jobs j ON c.job_id = j.id
        JOIN manager_profiles mp ON c.manager_id = mp.id
        JOIN users mu ON mp.user_id = mu.id
        JOIN entrepreneur_profiles ep ON c.entrepreneur_id = ep.id
        JOIN users eu ON ep.user_id = eu.id
        WHERE (mp.user_id = $1 OR ep.user_id = $1)
      `;

      const params = [user_id];

      if (status) {
        query += ` AND c.status = $2`;
        params.push(status);
      }

      query += ` ORDER BY c.created_at DESC`;

      const result = await pool.query(query, params);

      res.json({
        contracts: result.rows.map(c => ({
          id: c.id,
          job_id: c.job_id,
          job_title: c.job_title,
          contract_amount: parseFloat(c.contract_amount),
          status: c.status,
          user_role: c.user_role,
          manager_name: `${c.manager_first_name} ${c.manager_last_name}`,
          entrepreneur_name: `${c.entrepreneur_first_name} ${c.entrepreneur_last_name}`,
          company_name: c.company_name,
          created_at: c.created_at,
          work_completed_at: c.work_completed_at,
          approved_at: c.approved_at
        })),
        total: result.rows.length
      });

    } catch (error) {
      console.error('❌ Get contracts error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET CONTRACT BY JOB ID
   * GET /api/contracts/job/:job_id
   */
  async getContractByJob(req, res) {
    try {
      const { job_id } = req.params;
      const user_id = req.user.id;

      const result = await pool.query(
        `SELECT c.*, mp.user_id as manager_user_id, ep.user_id as entrepreneur_user_id
         FROM contracts c
         JOIN manager_profiles mp ON c.manager_id = mp.id
         JOIN entrepreneur_profiles ep ON c.entrepreneur_id = ep.id
         WHERE c.job_id = $1
           AND (mp.user_id = $2 OR ep.user_id = $2)`,
        [job_id, user_id]
      );

      if (result.rows.length === 0) {
        return res.json({ has_contract: false });
      }

      const contract = result.rows[0];

      res.json({
        has_contract: true,
        contract: {
          id: contract.id,
          status: contract.status,
          contract_amount: parseFloat(contract.contract_amount),
          work_completed_at: contract.work_completed_at,
          approved_at: contract.approved_at,
          is_manager: contract.manager_user_id === user_id
        }
      });

    } catch (error) {
      console.error('❌ Get contract by job error:', error);
      res.status(500).json({ error: error.message });
    }
  }
};

export default ContractController;
