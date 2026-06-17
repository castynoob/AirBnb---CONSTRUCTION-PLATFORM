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
   * SUBMIT INVOICE
   * Entrepreneur submits the final invoice (totals + uploaded document) before
   * marking work complete. Idempotent: can re-submit while work_completed_at is null.
   * POST /api/contracts/:id/invoice
   * Body: { subtotal, gst, qst, total, document_id, notes? }
   */
  async submitInvoice(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;
      const { subtotal, gst, qst, total, document_id, notes } = req.body;

      // Validate numeric inputs
      const num = (v) => (v === '' || v == null ? NaN : Number(v));
      const sub = num(subtotal), g = num(gst), q = num(qst), tot = num(total);
      if ([sub, g, q, tot].some((n) => Number.isNaN(n) || n < 0)) {
        return res.status(400).json({ error: 'Invalid amounts. Subtotal, GST, QST and total are required and must be non-negative numbers.' });
      }
      // Sanity check: total should equal subtotal + gst + qst within 1 cent
      if (Math.abs((sub + g + q) - tot) > 0.01) {
        return res.status(400).json({ error: 'Total does not match subtotal + GST + QST.' });
      }
      if (!document_id) {
        return res.status(400).json({ error: 'Invoice attachment is required (document_id).' });
      }

      // Load contract + verify entrepreneur owns it
      const contractResult = await pool.query(
        `SELECT c.*, ep.user_id as entrepreneur_user_id
           FROM contracts c
           JOIN entrepreneur_profiles ep ON c.entrepreneur_id = ep.id
          WHERE c.id = $1`,
        [id]
      );
      if (contractResult.rows.length === 0) {
        return res.status(404).json({ error: 'Contract not found' });
      }
      const contract = contractResult.rows[0];
      if (contract.entrepreneur_user_id !== user_id) {
        return res.status(403).json({ error: 'Only the contractor on this contract can submit the invoice.' });
      }
      if (contract.work_completed_at) {
        return res.status(400).json({ error: 'Work is already marked complete; the invoice is locked.' });
      }

      // Verify the supplied document belongs to this user and (optionally) this contract
      const docResult = await pool.query(
        `SELECT id, owner_id, contract_id FROM documents WHERE id = $1`,
        [document_id]
      );
      if (docResult.rows.length === 0) {
        return res.status(400).json({ error: 'Invoice document not found.' });
      }
      const doc = docResult.rows[0];
      if (doc.owner_id !== user_id) {
        return res.status(403).json({ error: 'You can only attach a document you uploaded.' });
      }
      // If the document was uploaded with a contract_id, it must match.
      if (doc.contract_id && doc.contract_id !== id) {
        return res.status(400).json({ error: 'Invoice document is linked to a different contract.' });
      }

      const isResubmission = !!contract.invoice_submitted_at;

      await pool.query(
        `UPDATE contracts
            SET invoice_subtotal     = $1,
                invoice_gst          = $2,
                invoice_qst          = $3,
                invoice_total        = $4,
                invoice_document_id  = $5,
                invoice_notes        = $6,
                invoice_submitted_at = COALESCE(invoice_submitted_at, NOW()),
                updated_at           = NOW()
          WHERE id = $7`,
        [sub.toFixed(2), g.toFixed(2), q.toFixed(2), tot.toFixed(2), document_id, notes || null, id]
      );

      await pool.query(
        `INSERT INTO contract_events (contract_id, event_type, actor_user_id, actor_role, event_data)
         VALUES ($1, $2, $3, 'entrepreneur', $4::jsonb)`,
        [id, isResubmission ? 'invoice_resubmitted' : 'invoice_submitted', user_id, JSON.stringify({ subtotal: sub, gst: g, qst: q, total: tot })]
      );

      console.log(`✅ Invoice ${isResubmission ? 're-' : ''}submitted for contract ${id} (total $${tot.toFixed(2)})`);

      res.json({
        success: true,
        message: isResubmission ? 'Invoice updated.' : 'Invoice submitted. You can now mark the work as complete.',
        contract_id: id,
      });
    } catch (error) {
      console.error('❌ Submit invoice error:', error);
      res.status(500).json({ error: 'Failed to submit invoice', message: error.message });
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

      // Gate: invoice must be submitted before completion
      if (!contract.invoice_submitted_at) {
        return res.status(400).json({
          error: 'invoice_required',
          message: 'Submit your final invoice (with totals and attachment) before marking the work complete.'
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

      // LEFT JOIN manager_profiles + dependent users mu so admin-owned
      // contracts (manager_id IS NULL) are still returned to the entrepreneur.
      const result = await pool.query(
        `SELECT c.*,
                j.title as job_title, j.description as job_description,
                mp.user_id as manager_user_id,
                mu.first_name as manager_first_name, mu.last_name as manager_last_name,
                ep.company_name, ep.user_id as entrepreneur_user_id,
                eu.first_name as entrepreneur_first_name, eu.last_name as entrepreneur_last_name
         FROM contracts c
         JOIN jobs j ON c.job_id = j.id
         LEFT JOIN manager_profiles mp ON c.manager_id = mp.id
         LEFT JOIN users mu ON mp.user_id = mu.id
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
          created_at: contract.created_at,
          contractor_completion_confirmed: contract.contractor_completion_confirmed,
          contractor_confirmed_at: contract.contractor_confirmed_at,
          manager_completion_confirmed: contract.manager_completion_confirmed,
          manager_confirmed_at: contract.manager_confirmed_at,
          mutual_confirmation_completed_at: contract.mutual_confirmation_completed_at
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

      // LEFT JOIN manager_profiles + dependent mu so admin-owned contracts
      // appear in the entrepreneur's contract list. user_role treats anyone
      // who's not the manager (which includes admin-owned cases where mp is
      // NULL) as 'entrepreneur', which is correct for this endpoint's callers.
      let query = `
        SELECT c.*,
               j.title as job_title,
               mu.first_name as manager_first_name, mu.last_name as manager_last_name,
               eu.first_name as entrepreneur_first_name, eu.last_name as entrepreneur_last_name,
               ep.company_name,
               CASE WHEN mp.user_id = $1 THEN 'manager' ELSE 'entrepreneur' END as user_role
        FROM contracts c
        JOIN jobs j ON c.job_id = j.id
        LEFT JOIN manager_profiles mp ON c.manager_id = mp.id
        LEFT JOIN users mu ON mp.user_id = mu.id
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
          approved_at: c.approved_at,
          contractor_completion_confirmed: c.contractor_completion_confirmed,
          contractor_confirmed_at: c.contractor_confirmed_at,
          manager_completion_confirmed: c.manager_completion_confirmed,
          manager_confirmed_at: c.manager_confirmed_at,
          mutual_confirmation_completed_at: c.mutual_confirmation_completed_at
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

      // LEFT JOIN manager_profiles so admin-owned contracts (manager_id IS NULL,
      // admin_owner_id IS NOT NULL) are not silently filtered out. The
      // entrepreneur is the one calling this endpoint either way.
      const result = await pool.query(
        `SELECT c.*,
                mp.user_id as manager_user_id,
                ep.user_id as entrepreneur_user_id,
                d.file_url     as invoice_file_url,
                d.file_name    as invoice_file_name,
                d.file_size    as invoice_file_size,
                d.file_type    as invoice_file_type
         FROM contracts c
         LEFT JOIN manager_profiles mp ON c.manager_id = mp.id
         JOIN entrepreneur_profiles ep ON c.entrepreneur_id = ep.id
         LEFT JOIN documents d ON c.invoice_document_id = d.id
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
          is_manager: contract.manager_user_id === user_id,
          contractor_completion_confirmed: contract.contractor_completion_confirmed,
          contractor_confirmed_at: contract.contractor_confirmed_at,
          contractor_completion_note: contract.contractor_completion_note,
          manager_completion_confirmed: contract.manager_completion_confirmed,
          manager_confirmed_at: contract.manager_confirmed_at,
          manager_completion_note: contract.manager_completion_note,
          mutual_confirmation_completed_at: contract.mutual_confirmation_completed_at,
          // Invoice (null until contractor submits)
          invoice_submitted_at: contract.invoice_submitted_at,
          invoice_subtotal: contract.invoice_subtotal != null ? parseFloat(contract.invoice_subtotal) : null,
          invoice_gst:      contract.invoice_gst      != null ? parseFloat(contract.invoice_gst)      : null,
          invoice_qst:      contract.invoice_qst      != null ? parseFloat(contract.invoice_qst)      : null,
          invoice_total:    contract.invoice_total    != null ? parseFloat(contract.invoice_total)    : null,
          invoice_notes:    contract.invoice_notes,
          invoice_document_id: contract.invoice_document_id,
          invoice_file_url:    contract.invoice_file_url,
          invoice_file_name:   contract.invoice_file_name,
          invoice_file_size:   contract.invoice_file_size,
          invoice_file_type:   contract.invoice_file_type
        }
      });

    } catch (error) {
      console.error('❌ Get contract by job error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * CONFIRM JOB COMPLETION
   * Either party confirms the job is fully done
   * POST /api/contracts/:id/confirm-completion
   */
  async confirmCompletion(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;
      const rawNote = req.body?.note;
      const note = typeof rawNote === 'string' ? rawNote.trim() : '';

      // Get contract with both user IDs and names. LEFT JOIN on manager_profiles
      // so admin-owned contracts (manager_id IS NULL) still surface — the
      // entrepreneur needs to be able to confirm their side of completion.
      const contractResult = await pool.query(
        `SELECT c.*,
                mp.user_id as manager_user_id,
                ep.user_id as entrepreneur_user_id,
                j.title as job_title, j.id as job_id,
                mu.first_name as manager_first_name, mu.last_name as manager_last_name,
                eu.first_name as entrepreneur_first_name, eu.last_name as entrepreneur_last_name
         FROM contracts c
         LEFT JOIN manager_profiles mp ON c.manager_id = mp.id
         JOIN entrepreneur_profiles ep ON c.entrepreneur_id = ep.id
         LEFT JOIN users mu ON mp.user_id = mu.id
         JOIN users eu ON ep.user_id = eu.id
         JOIN jobs j ON c.job_id = j.id
         WHERE c.id = $1`,
        [id]
      );

      if (contractResult.rows.length === 0) {
        return res.status(404).json({ error: 'Contract not found' });
      }

      const contract = contractResult.rows[0];

      // Determine role
      const isManager = contract.manager_user_id === user_id;
      const isEntrepreneur = contract.entrepreneur_user_id === user_id;

      if (!isManager && !isEntrepreneur) {
        return res.status(403).json({ error: 'You are not part of this contract' });
      }

      // Manager note is mandatory; we record what they observed/agreed when confirming.
      if (isManager && note.length === 0) {
        return res.status(400).json({
          error: 'note_required',
          message: 'A completion note is required when confirming work completion.',
        });
      }

      // Contract must be completed or work must be marked complete
      // (entrepreneur marks work complete → job status = completed, but contract status may still be active)
      if (contract.status !== 'completed' && contract.status !== 'active' && contract.status !== 'in_progress') {
        return res.status(400).json({
          error: 'Contract must be active or completed before confirming',
          current_status: contract.status
        });
      }

      // If PM is confirming and contract isn't completed yet, mark it completed now
      if (isManager && contract.status !== 'completed') {
        await pool.query(
          `UPDATE contracts SET status = 'completed', updated_at = NOW() WHERE id = $1`,
          [id]
        );
      }

      // Check if already confirmed
      if (isManager && contract.manager_completion_confirmed) {
        return res.status(400).json({ error: 'You have already confirmed completion' });
      }
      if (isEntrepreneur && contract.contractor_completion_confirmed) {
        return res.status(400).json({ error: 'You have already confirmed completion' });
      }

      const role = isManager ? 'manager' : 'entrepreneur';

      if (isManager) {
        // PM confirmation auto-confirms BOTH parties; persist the manager's note.
        await pool.query(
          `UPDATE contracts SET
            manager_completion_confirmed = true, manager_confirmed_at = NOW(),
            contractor_completion_confirmed = true, contractor_confirmed_at = COALESCE(contractor_confirmed_at, NOW()),
            manager_completion_note = $2,
            updated_at = NOW()
           WHERE id = $1`,
          [id, note]
        );
      } else {
        // Entrepreneur can still confirm on their side (mark complete triggers this).
        // Note is optional here; persist only if provided.
        await pool.query(
          `UPDATE contracts SET
            contractor_completion_confirmed = true,
            contractor_confirmed_at = NOW(),
            contractor_completion_note = COALESCE(NULLIF($2, ''), contractor_completion_note),
            updated_at = NOW()
           WHERE id = $1`,
          [id, note]
        );
      }

      // Log event (include the note in event_data for the audit trail)
      await pool.query(
        `INSERT INTO contract_events (contract_id, event_type, actor_user_id, actor_role, event_data)
         VALUES ($1, 'completion_confirmed', $2, $3, $4::jsonb)`,
        [id, user_id, role, JSON.stringify({ note: note || null })]
      );

      // Re-fetch to check if both confirmed
      const updatedResult = await pool.query(
        `SELECT contractor_completion_confirmed, manager_completion_confirmed FROM contracts WHERE id = $1`,
        [id]
      );
      const updated = updatedResult.rows[0];
      const bothConfirmed = updated.contractor_completion_confirmed && updated.manager_completion_confirmed;

      const io = getIO();

      if (bothConfirmed) {
        // Set mutual confirmation timestamp
        await pool.query(
          `UPDATE contracts SET mutual_confirmation_completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [id]
        );

        // Log mutual confirmation event
        await pool.query(
          `INSERT INTO contract_events (contract_id, event_type, actor_user_id, actor_role, event_data)
           VALUES ($1, 'mutual_completion_confirmed', $2, $3, $4)`,
          [id, user_id, role, JSON.stringify({ triggered_by: role })]
        );

        // Check if reviews already exist
        const existingReviews = await pool.query(
          `SELECT reviewer_id FROM reviews WHERE job_id = $1`,
          [contract.job_id]
        );
        const existingReviewerIds = existingReviews.rows.map(r => String(r.reviewer_id));

        // Send review invitation to manager (if hasn't reviewed yet)
        if (!existingReviewerIds.includes(String(contract.manager_user_id))) {
          await createNotification({
            userId: contract.manager_user_id,
            type: 'review_invitation',
            jobId: contract.job_id,
            jobTitle: contract.job_title,
            content: `Both parties confirmed completion for "${contract.job_title}". Leave a review for ${contract.entrepreneur_first_name} ${contract.entrepreneur_last_name}!`
          });

          if (io) {
            io.to(contract.manager_user_id.toString()).emit('review_invitation', {
              contractId: id,
              jobId: contract.job_id,
              jobTitle: contract.job_title,
              revieweeId: contract.entrepreneur_user_id,
              revieweeName: `${contract.entrepreneur_first_name} ${contract.entrepreneur_last_name}`,
              suggestedRating: 5
            });
          }
        }

        // Send review invitation to entrepreneur (if hasn't reviewed yet)
        if (!existingReviewerIds.includes(String(contract.entrepreneur_user_id))) {
          await createNotification({
            userId: contract.entrepreneur_user_id,
            type: 'review_invitation',
            jobId: contract.job_id,
            jobTitle: contract.job_title,
            content: `Both parties confirmed completion for "${contract.job_title}". Leave a review for ${contract.manager_first_name} ${contract.manager_last_name}!`
          });

          if (io) {
            io.to(contract.entrepreneur_user_id.toString()).emit('review_invitation', {
              contractId: id,
              jobId: contract.job_id,
              jobTitle: contract.job_title,
              revieweeId: contract.manager_user_id,
              revieweeName: `${contract.manager_first_name} ${contract.manager_last_name}`,
              suggestedRating: 5
            });
          }
        }

        console.log(`✅ Mutual completion confirmed for contract ${id}`);
      } else {
        // Notify the other party
        const otherUserId = isManager ? contract.entrepreneur_user_id : contract.manager_user_id;
        const confirmerName = isManager
          ? `${contract.manager_first_name} ${contract.manager_last_name}`
          : `${contract.entrepreneur_first_name} ${contract.entrepreneur_last_name}`;

        await createNotification({
          userId: otherUserId,
          type: 'completion_confirmed',
          jobId: contract.job_id,
          jobTitle: contract.job_title,
          content: `${confirmerName} confirmed job completion for "${contract.job_title}". Please confirm on your side too.`
        });

        if (io) {
          io.to(otherUserId.toString()).emit('completion_confirmed', {
            contractId: id,
            jobId: contract.job_id,
            jobTitle: contract.job_title,
            confirmedBy: role,
            confirmerName
          });
        }

        console.log(`📋 ${role} confirmed completion for contract ${id}, waiting for other party`);
      }

      res.json({
        success: true,
        message: bothConfirmed
          ? 'Both parties confirmed! Review invitations sent.'
          : 'Your confirmation recorded. Waiting for the other party.',
        both_confirmed: bothConfirmed,
        contractor_confirmed: updated.contractor_completion_confirmed,
        manager_confirmed: updated.manager_completion_confirmed
      });

    } catch (error) {
      console.error('❌ Confirm completion error:', error);
      res.status(500).json({
        error: 'Failed to confirm completion',
        message: error.message
      });
    }
  }
};

export default ContractController;
