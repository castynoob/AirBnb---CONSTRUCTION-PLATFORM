// ============================================
// CONTRACT CONTROLLER
// Handles contract-based payments between managers and entrepreneurs
// ============================================

import stripe from '../config/stripe.js';
import pool from '../config/db.js';
import { PLATFORM_FEE_PERCENTAGE } from './stripeConnectController.js';
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

      // Check entrepreneur has Stripe Connect set up
      const entrepreneurResult = await pool.query(
        `SELECT stripe_connect_account_id, stripe_connect_onboarded,
                stripe_connect_charges_enabled
         FROM entrepreneur_profiles
         WHERE id = $1`,
        [bid.entrepreneur_id]
      );

      const entrepreneur = entrepreneurResult.rows[0];

      if (!entrepreneur.stripe_connect_account_id || !entrepreneur.stripe_connect_onboarded) {
        return res.status(400).json({
          error: 'Entrepreneur has not completed payment setup',
          message: 'The contractor must complete Stripe onboarding before you can create a contract'
        });
      }

      // Calculate amounts
      const contractAmount = parseFloat(bid.amount);
      const platformFeeAmount = (contractAmount * PLATFORM_FEE_PERCENTAGE) / 100;
      const entrepreneurPayoutAmount = contractAmount - platformFeeAmount;

      // Create contract
      const contractResult = await pool.query(
        `INSERT INTO contracts
         (job_id, bid_id, manager_id, entrepreneur_id,
          contract_amount, platform_fee_percentage, platform_fee_amount, entrepreneur_payout_amount,
          status, payment_status, payout_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_payment', 'unpaid', 'pending')
         RETURNING *`,
        [
          bid.job_id,
          bid_id,
          bid.manager_profile_id,
          bid.entrepreneur_id,
          contractAmount,
          PLATFORM_FEE_PERCENTAGE,
          platformFeeAmount,
          entrepreneurPayoutAmount
        ]
      );

      const contract = contractResult.rows[0];

      // Update job with contract status
      await pool.query(
        `UPDATE jobs SET has_contract = true, contract_status = 'pending_payment' WHERE id = $1`,
        [bid.job_id]
      );

      // Log contract creation event
      await pool.query(
        `INSERT INTO contract_events (contract_id, event_type, actor_user_id, actor_role, event_data)
         VALUES ($1, 'contract_created', $2, 'manager', $3)`,
        [contract.id, user_id, JSON.stringify({ bid_id, contract_amount: contractAmount })]
      );

      console.log(`📝 Contract created: ${contract.id} for job ${bid.job_id}`);

      res.status(201).json({
        success: true,
        message: 'Contract created successfully',
        contract: {
          id: contract.id,
          job_id: contract.job_id,
          contract_amount: contractAmount,
          platform_fee: platformFeeAmount,
          entrepreneur_payout: entrepreneurPayoutAmount,
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
   * CREATE PAYMENT INTENT
   * Creates a Stripe PaymentIntent for the manager to pay
   * POST /api/contracts/:id/pay
   */
  async createPaymentIntent(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      // Get contract and verify ownership
      const contractResult = await pool.query(
        `SELECT c.*, mp.user_id as manager_user_id, u.email as manager_email,
                u.stripe_customer_id,
                ep.stripe_connect_account_id,
                j.title as job_title
         FROM contracts c
         JOIN manager_profiles mp ON c.manager_id = mp.id
         JOIN users u ON mp.user_id = u.id
         JOIN entrepreneur_profiles ep ON c.entrepreneur_id = ep.id
         JOIN jobs j ON c.job_id = j.id
         WHERE c.id = $1`,
        [id]
      );

      if (contractResult.rows.length === 0) {
        return res.status(404).json({ error: 'Contract not found' });
      }

      const contract = contractResult.rows[0];

      if (contract.manager_user_id !== user_id) {
        return res.status(403).json({ error: 'Only the job owner can pay for this contract' });
      }

      if (contract.status !== 'pending_payment') {
        return res.status(400).json({
          error: 'Contract is not awaiting payment',
          current_status: contract.status
        });
      }

      // Create or retrieve Stripe customer for manager
      let customerId = contract.stripe_customer_id;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: contract.manager_email,
          metadata: {
            user_id: user_id,
            platform: 'intervos'
          }
        });
        customerId = customer.id;

        await pool.query(
          'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
          [customerId, user_id]
        );
      }

      // Amount in cents
      const amountInCents = Math.round(contract.contract_amount * 100);

      // Create PaymentIntent
      // Using destination charge model - funds go to platform first, then transferred
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: 'cad',
        customer: customerId,
        description: `Contract payment for: ${contract.job_title}`,
        metadata: {
          contract_id: contract.id,
          job_id: contract.job_id,
          manager_user_id: user_id,
          entrepreneur_id: contract.entrepreneur_id,
          platform: 'intervos'
        },
        // Don't transfer automatically - we'll do it when work is approved
        automatic_payment_methods: {
          enabled: true
        }
      });

      // Update contract with payment intent ID
      await pool.query(
        `UPDATE contracts
         SET stripe_payment_intent_id = $1, payment_status = 'processing', updated_at = NOW()
         WHERE id = $2`,
        [paymentIntent.id, contract.id]
      );

      // Log event
      await pool.query(
        `INSERT INTO contract_events (contract_id, event_type, actor_user_id, actor_role, event_data)
         VALUES ($1, 'payment_initiated', $2, 'manager', $3)`,
        [contract.id, user_id, JSON.stringify({ payment_intent_id: paymentIntent.id, amount: contract.contract_amount })]
      );

      console.log(`💳 Payment intent created: ${paymentIntent.id} for contract ${contract.id}`);

      res.json({
        success: true,
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        amount: contract.contract_amount,
        currency: 'CAD'
      });

    } catch (error) {
      console.error('❌ Create payment intent error:', error);
      res.status(500).json({
        error: 'Failed to create payment',
        message: error.message
      });
    }
  },

  /**
   * CONFIRM PAYMENT (Webhook handler helper)
   * Called when payment succeeds via webhook
   */
  async handlePaymentSuccess(paymentIntent) {
    const contractId = paymentIntent.metadata.contract_id;

    if (!contractId) {
      console.log('⚠️ Payment intent has no contract_id metadata');
      return;
    }

    // Update contract status
    await pool.query(
      `UPDATE contracts
       SET status = 'paid',
           payment_status = 'succeeded',
           stripe_charge_id = $1,
           paid_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [paymentIntent.latest_charge, contractId]
    );

    // Update job status
    const contractResult = await pool.query(
      'SELECT job_id, entrepreneur_id FROM contracts WHERE id = $1',
      [contractId]
    );

    if (contractResult.rows.length > 0) {
      const { job_id, entrepreneur_id } = contractResult.rows[0];

      await pool.query(
        `UPDATE jobs SET contract_status = 'paid' WHERE id = $1`,
        [job_id]
      );

      // Log event
      await pool.query(
        `INSERT INTO contract_events (contract_id, event_type, actor_role, event_data, stripe_event_id)
         VALUES ($1, 'payment_succeeded', 'system', $2, $3)`,
        [contractId, JSON.stringify({ charge_id: paymentIntent.latest_charge }), paymentIntent.id]
      );

      // Notify entrepreneur
      const entrepreneurResult = await pool.query(
        `SELECT u.id as user_id FROM entrepreneur_profiles ep
         JOIN users u ON ep.user_id = u.id WHERE ep.id = $1`,
        [entrepreneur_id]
      );

      if (entrepreneurResult.rows[0]) {
        await createNotification({
          userId: entrepreneurResult.rows[0].user_id,
          type: 'payment_received',
          jobId: job_id,
          content: 'Payment has been received for your contract. You can now start the work!'
        });
      }
    }

    console.log(`✅ Payment confirmed for contract ${contractId}`);
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

      if (contract.status !== 'paid' && contract.status !== 'in_progress') {
        return res.status(400).json({
          error: 'Contract must be paid before marking complete',
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
   * APPROVE WORK & RELEASE FUNDS
   * Manager approves work and triggers payout to entrepreneur
   * POST /api/contracts/:id/approve
   */
  async approveAndReleaseFunds(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      // Get contract and verify manager owns it
      const contractResult = await pool.query(
        `SELECT c.*, mp.user_id as manager_user_id,
                ep.stripe_connect_account_id,
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

      if (contract.payment_status !== 'succeeded') {
        return res.status(400).json({
          error: 'Payment must be completed before approving',
          payment_status: contract.payment_status
        });
      }

      if (contract.payout_status === 'completed') {
        return res.status(400).json({
          error: 'Funds have already been released',
          payout_status: contract.payout_status
        });
      }

      // Calculate payout amount in cents
      const payoutAmountCents = Math.round(contract.entrepreneur_payout_amount * 100);

      // Create transfer to entrepreneur's connected account
      const transfer = await stripe.transfers.create({
        amount: payoutAmountCents,
        currency: 'cad',
        destination: contract.stripe_connect_account_id,
        transfer_group: `contract_${contract.id}`,
        metadata: {
          contract_id: contract.id,
          job_id: contract.job_id,
          platform: 'intervos'
        }
      });

      // Update contract
      await pool.query(
        `UPDATE contracts
         SET status = 'completed',
             payout_status = 'completed',
             stripe_transfer_id = $1,
             payout_completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [transfer.id, id]
      );

      // Update job
      await pool.query(
        `UPDATE jobs SET status = 'completed', contract_status = 'completed' WHERE id = $1`,
        [contract.job_id]
      );

      // Log event
      await pool.query(
        `INSERT INTO contract_events (contract_id, event_type, actor_user_id, actor_role, event_data)
         VALUES ($1, 'payout_completed', $2, 'manager', $3)`,
        [id, user_id, JSON.stringify({ transfer_id: transfer.id, amount: contract.entrepreneur_payout_amount })]
      );

      // Notify entrepreneur
      await createNotification({
        userId: contract.entrepreneur_user_id,
        type: 'payout_received',
        jobId: contract.job_id,
        jobTitle: contract.job_title,
        content: `Payment of $${contract.entrepreneur_payout_amount.toLocaleString()} has been released to your account for "${contract.job_title}"!`
      });

      const io = getIO();
      if (io) {
        io.to(contract.entrepreneur_user_id.toString()).emit('payout_received', {
          contractId: id,
          jobId: contract.job_id,
          amount: contract.entrepreneur_payout_amount
        });
      }

      console.log(`💰 Payout completed for contract ${id}: ${transfer.id}`);

      res.json({
        success: true,
        message: 'Work approved and funds released!',
        payout: {
          transfer_id: transfer.id,
          amount: contract.entrepreneur_payout_amount,
          currency: 'CAD'
        }
      });

    } catch (error) {
      console.error('❌ Approve and release funds error:', error);
      res.status(500).json({
        error: 'Failed to release funds',
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
          platform_fee: parseFloat(contract.platform_fee_amount),
          entrepreneur_payout: parseFloat(contract.entrepreneur_payout_amount),
          status: contract.status,
          payment_status: contract.payment_status,
          payout_status: contract.payout_status,
          paid_at: contract.paid_at,
          work_completed_at: contract.work_completed_at,
          payout_completed_at: contract.payout_completed_at,
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
        }
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
          payment_status: c.payment_status,
          payout_status: c.payout_status,
          user_role: c.user_role,
          manager_name: `${c.manager_first_name} ${c.manager_last_name}`,
          entrepreneur_name: `${c.entrepreneur_first_name} ${c.entrepreneur_last_name}`,
          company_name: c.company_name,
          created_at: c.created_at,
          paid_at: c.paid_at,
          payout_completed_at: c.payout_completed_at
        })),
        total: result.rows.length
      });

    } catch (error) {
      console.error('❌ Get contracts error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * CONFIRM PAYMENT (Manual - backup for webhook)
   * Called by frontend after successful Stripe payment
   * POST /api/contracts/:id/confirm-payment
   */
  async confirmPayment(req, res) {
    try {
      const { id } = req.params;
      const { payment_intent_id } = req.body;
      const user_id = req.user.id;

      // Get contract and verify manager owns it
      const contractResult = await pool.query(
        `SELECT c.*, mp.user_id as manager_user_id,
                ep.user_id as entrepreneur_user_id,
                j.title as job_title
         FROM contracts c
         JOIN manager_profiles mp ON c.manager_id = mp.id
         JOIN entrepreneur_profiles ep ON c.entrepreneur_id = ep.id
         JOIN jobs j ON c.job_id = j.id
         WHERE c.id = $1`,
        [id]
      );

      if (contractResult.rows.length === 0) {
        return res.status(404).json({ error: 'Contract not found' });
      }

      const contract = contractResult.rows[0];

      if (contract.manager_user_id !== user_id) {
        return res.status(403).json({ error: 'Only the job owner can confirm payment' });
      }

      // If already paid, return success
      if (contract.status === 'paid') {
        return res.json({
          success: true,
          message: 'Payment already confirmed',
          contract: { id: contract.id, status: 'paid' }
        });
      }

      // Verify payment intent with Stripe
      let paymentIntent;
      try {
        paymentIntent = await stripe.paymentIntents.retrieve(
          payment_intent_id || contract.stripe_payment_intent_id
        );
      } catch (stripeErr) {
        console.error('Error retrieving payment intent:', stripeErr);
        return res.status(400).json({
          error: 'Could not verify payment',
          message: 'Payment intent not found or invalid'
        });
      }

      // Check payment status
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({
          error: 'Payment not completed',
          payment_status: paymentIntent.status,
          message: `Payment is ${paymentIntent.status}. Please complete the payment first.`
        });
      }

      // Update contract status
      await pool.query(
        `UPDATE contracts
         SET status = 'paid',
             payment_status = 'succeeded',
             stripe_charge_id = $1,
             paid_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [paymentIntent.latest_charge, id]
      );

      // Update job contract_status
      await pool.query(
        `UPDATE jobs SET contract_status = 'paid' WHERE id = $1`,
        [contract.job_id]
      );

      // Log contract event
      await pool.query(
        `INSERT INTO contract_events (contract_id, event_type, actor_user_id, actor_role, event_data)
         VALUES ($1, 'payment_confirmed_manual', $2, 'manager', $3)`,
        [id, user_id, JSON.stringify({ payment_intent_id: paymentIntent.id })]
      );

      // Notify entrepreneur
      await createNotification({
        userId: contract.entrepreneur_user_id,
        type: 'payment_received',
        jobId: contract.job_id,
        jobTitle: contract.job_title,
        content: `Payment has been received for "${contract.job_title}". You can now start the work!`
      });

      // Socket notification
      const io = getIO();
      if (io) {
        io.to(contract.entrepreneur_user_id.toString()).emit('payment_received', {
          contractId: id,
          jobId: contract.job_id,
          jobTitle: contract.job_title
        });
      }

      console.log(`✅ Payment manually confirmed for contract ${id}`);

      res.json({
        success: true,
        message: 'Payment confirmed successfully',
        contract: {
          id: contract.id,
          status: 'paid',
          payment_status: 'succeeded'
        }
      });

    } catch (error) {
      console.error('❌ Confirm payment error:', error);
      res.status(500).json({
        error: 'Failed to confirm payment',
        message: error.message
      });
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
          payment_status: contract.payment_status,
          payout_status: contract.payout_status,
          contract_amount: parseFloat(contract.contract_amount),
          platform_fee: parseFloat(contract.platform_fee_amount),
          entrepreneur_payout: parseFloat(contract.entrepreneur_payout_amount),
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
