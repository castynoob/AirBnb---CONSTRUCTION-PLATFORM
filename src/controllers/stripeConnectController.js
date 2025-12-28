// ============================================
// STRIPE CONNECT CONTROLLER
// Handles entrepreneur onboarding to Stripe Connect
// ============================================

import stripe from '../config/stripe.js';
import pool from '../config/db.js';

const PLATFORM_FEE_PERCENTAGE = 7.6; // 7.6% platform fee

const StripeConnectController = {
  /**
   * CREATE STRIPE CONNECT ACCOUNT
   * Creates a Stripe Connect Express account for the entrepreneur
   * POST /api/payments/connect/create-account
   */
  async createConnectAccount(req, res) {
    try {
      const user_id = req.user.id;

      // Get entrepreneur profile
      const entrepreneurResult = await pool.query(
        `SELECT ep.id, ep.stripe_connect_account_id, ep.company_name,
                u.email, u.first_name, u.last_name
         FROM entrepreneur_profiles ep
         JOIN users u ON ep.user_id = u.id
         WHERE ep.user_id = $1`,
        [user_id]
      );

      if (entrepreneurResult.rows.length === 0) {
        return res.status(403).json({
          error: 'Entrepreneur profile required',
          message: 'Only entrepreneurs can create Stripe Connect accounts'
        });
      }

      const entrepreneur = entrepreneurResult.rows[0];

      // Check if already has an account
      if (entrepreneur.stripe_connect_account_id) {
        // Retrieve existing account status
        const account = await stripe.accounts.retrieve(entrepreneur.stripe_connect_account_id);

        return res.json({
          success: true,
          message: 'Stripe Connect account already exists',
          account: {
            id: account.id,
            details_submitted: account.details_submitted,
            charges_enabled: account.charges_enabled,
            payouts_enabled: account.payouts_enabled,
            onboarding_complete: account.details_submitted && account.charges_enabled
          }
        });
      }

      // Create new Express account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'CA', // Canada
        email: entrepreneur.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true }
        },
        business_type: 'individual',
        business_profile: {
          name: entrepreneur.company_name || `${entrepreneur.first_name} ${entrepreneur.last_name}`,
          product_description: 'Construction and maintenance services'
        },
        metadata: {
          user_id: user_id,
          entrepreneur_profile_id: entrepreneur.id,
          platform: 'intervos'
        }
      });

      // Save account ID to database
      await pool.query(
        `UPDATE entrepreneur_profiles
         SET stripe_connect_account_id = $1,
             stripe_connect_onboarded = false,
             updated_at = NOW()
         WHERE id = $2`,
        [account.id, entrepreneur.id]
      );

      console.log(`🔗 Stripe Connect account created for entrepreneur ${entrepreneur.id}: ${account.id}`);

      res.json({
        success: true,
        message: 'Stripe Connect account created',
        account: {
          id: account.id,
          details_submitted: false,
          charges_enabled: false,
          payouts_enabled: false,
          onboarding_complete: false
        }
      });

    } catch (error) {
      console.error('❌ Create Connect account error:', error);
      res.status(500).json({
        error: 'Failed to create Stripe Connect account',
        message: error.message
      });
    }
  },

  /**
   * CREATE ONBOARDING LINK
   * Generates a Stripe Connect onboarding link for the entrepreneur
   * POST /api/payments/connect/onboarding-link
   */
  async createOnboardingLink(req, res) {
    try {
      const user_id = req.user.id;
      const { return_url, refresh_url } = req.body;

      // Get entrepreneur profile with Stripe account
      const entrepreneurResult = await pool.query(
        `SELECT id, stripe_connect_account_id
         FROM entrepreneur_profiles
         WHERE user_id = $1`,
        [user_id]
      );

      if (entrepreneurResult.rows.length === 0) {
        return res.status(403).json({
          error: 'Entrepreneur profile required'
        });
      }

      const entrepreneur = entrepreneurResult.rows[0];

      if (!entrepreneur.stripe_connect_account_id) {
        return res.status(400).json({
          error: 'No Stripe account found',
          message: 'Please create a Stripe Connect account first'
        });
      }

      // Create account link for onboarding
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

      const accountLink = await stripe.accountLinks.create({
        account: entrepreneur.stripe_connect_account_id,
        refresh_url: refresh_url || `${frontendUrl}/entrepreneur/stripe-onboarding?refresh=true`,
        return_url: return_url || `${frontendUrl}/entrepreneur/stripe-onboarding?success=true`,
        type: 'account_onboarding'
      });

      console.log(`🔗 Onboarding link created for ${entrepreneur.stripe_connect_account_id}`);

      res.json({
        success: true,
        url: accountLink.url,
        expires_at: accountLink.expires_at
      });

    } catch (error) {
      console.error('❌ Create onboarding link error:', error);
      res.status(500).json({
        error: 'Failed to create onboarding link',
        message: error.message
      });
    }
  },

  /**
   * GET CONNECT ACCOUNT STATUS
   * Returns the current status of the entrepreneur's Stripe Connect account
   * GET /api/payments/connect/status
   */
  async getConnectStatus(req, res) {
    try {
      const user_id = req.user.id;

      // Get entrepreneur profile
      const entrepreneurResult = await pool.query(
        `SELECT id, stripe_connect_account_id, stripe_connect_onboarded,
                stripe_connect_charges_enabled, stripe_connect_payouts_enabled
         FROM entrepreneur_profiles
         WHERE user_id = $1`,
        [user_id]
      );

      if (entrepreneurResult.rows.length === 0) {
        return res.status(403).json({
          error: 'Entrepreneur profile required'
        });
      }

      const entrepreneur = entrepreneurResult.rows[0];

      if (!entrepreneur.stripe_connect_account_id) {
        return res.json({
          has_account: false,
          onboarding_complete: false,
          can_receive_payments: false,
          message: 'No Stripe Connect account. Complete onboarding to receive payments.'
        });
      }

      // Get latest status from Stripe
      const account = await stripe.accounts.retrieve(entrepreneur.stripe_connect_account_id);

      // Update local database with latest status
      const isOnboarded = account.details_submitted && account.charges_enabled;

      await pool.query(
        `UPDATE entrepreneur_profiles
         SET stripe_connect_onboarded = $1,
             stripe_connect_details_submitted = $2,
             stripe_connect_charges_enabled = $3,
             stripe_connect_payouts_enabled = $4,
             stripe_onboarding_completed_at = CASE WHEN $1 = true AND stripe_onboarding_completed_at IS NULL THEN NOW() ELSE stripe_onboarding_completed_at END,
             updated_at = NOW()
         WHERE id = $5`,
        [
          isOnboarded,
          account.details_submitted,
          account.charges_enabled,
          account.payouts_enabled,
          entrepreneur.id
        ]
      );

      res.json({
        has_account: true,
        account_id: entrepreneur.stripe_connect_account_id,
        onboarding_complete: isOnboarded,
        details_submitted: account.details_submitted,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        can_receive_payments: account.charges_enabled && account.payouts_enabled,
        requirements: account.requirements?.currently_due || [],
        message: isOnboarded
          ? 'Your Stripe account is fully set up!'
          : 'Please complete Stripe onboarding to receive payments.'
      });

    } catch (error) {
      console.error('❌ Get Connect status error:', error);
      res.status(500).json({
        error: 'Failed to get account status',
        message: error.message
      });
    }
  },

  /**
   * CREATE LOGIN LINK (Dashboard Access)
   * Creates a link for entrepreneurs to access their Stripe Express dashboard
   * POST /api/payments/connect/dashboard-link
   */
  async createDashboardLink(req, res) {
    try {
      const user_id = req.user.id;

      const entrepreneurResult = await pool.query(
        `SELECT stripe_connect_account_id
         FROM entrepreneur_profiles
         WHERE user_id = $1`,
        [user_id]
      );

      if (entrepreneurResult.rows.length === 0 || !entrepreneurResult.rows[0].stripe_connect_account_id) {
        return res.status(400).json({
          error: 'No Stripe Connect account found'
        });
      }

      const loginLink = await stripe.accounts.createLoginLink(
        entrepreneurResult.rows[0].stripe_connect_account_id
      );

      res.json({
        success: true,
        url: loginLink.url
      });

    } catch (error) {
      console.error('❌ Create dashboard link error:', error);
      res.status(500).json({
        error: 'Failed to create dashboard link',
        message: error.message
      });
    }
  },

  /**
   * CHECK IF ENTREPRENEUR CAN BID
   * Utility function to check if entrepreneur has completed Stripe onboarding
   */
  async canEntrepreneurBid(entrepreneur_profile_id) {
    const result = await pool.query(
      `SELECT stripe_connect_onboarded, stripe_connect_charges_enabled
       FROM entrepreneur_profiles
       WHERE id = $1`,
      [entrepreneur_profile_id]
    );

    if (result.rows.length === 0) return false;

    const { stripe_connect_onboarded, stripe_connect_charges_enabled } = result.rows[0];
    return stripe_connect_onboarded && stripe_connect_charges_enabled;
  },

  /**
   * GET PLATFORM FEE PERCENTAGE
   */
  getPlatformFeePercentage() {
    return PLATFORM_FEE_PERCENTAGE;
  },

  /**
   * CHECK ENTREPRENEUR STRIPE STATUS (For Managers)
   * Allows managers to check if an entrepreneur can receive payments
   * GET /api/contracts/connect/entrepreneur-status/:entrepreneur_id
   */
  async getEntrepreneurStripeStatus(req, res) {
    try {
      const { entrepreneur_id } = req.params;

      // Get entrepreneur's Stripe status from database
      const result = await pool.query(
        `SELECT ep.id, ep.company_name, ep.stripe_connect_account_id,
                ep.stripe_connect_onboarded, ep.stripe_connect_charges_enabled,
                u.first_name, u.last_name
         FROM entrepreneur_profiles ep
         JOIN users u ON ep.user_id = u.id
         WHERE ep.id = $1`,
        [entrepreneur_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Entrepreneur not found'
        });
      }

      const entrepreneur = result.rows[0];

      // Check if fully onboarded
      const canReceivePayments =
        entrepreneur.stripe_connect_account_id &&
        entrepreneur.stripe_connect_onboarded &&
        entrepreneur.stripe_connect_charges_enabled;

      res.json({
        entrepreneur_id: entrepreneur.id,
        company_name: entrepreneur.company_name,
        name: `${entrepreneur.first_name} ${entrepreneur.last_name}`,
        has_stripe_account: !!entrepreneur.stripe_connect_account_id,
        onboarding_complete: entrepreneur.stripe_connect_onboarded,
        can_receive_payments: canReceivePayments,
        message: canReceivePayments
          ? 'Contractor can receive payments'
          : 'Contractor has not completed payment setup. They must complete Stripe onboarding before you can approve this bid.'
      });

    } catch (error) {
      console.error('❌ Get entrepreneur Stripe status error:', error);
      res.status(500).json({
        error: 'Failed to check entrepreneur status',
        message: error.message
      });
    }
  }
};

export default StripeConnectController;
export { PLATFORM_FEE_PERCENTAGE };
