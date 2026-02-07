import { Promoter, PromoCodeRedemption } from '../models/promoterModel.js';
import PromoCode from '../models/promoCodeModel.js';
import stripe, { stripeConfig } from '../config/stripe.js';
import db from '../config/db.js';

/**
 * Validate promo code format
 */
const isValidCodeFormat = (code) => {
    return /^[A-Z0-9]{1,10}$/.test(code.toUpperCase());
};

const PromoterController = {
    /**
     * CREATE PROMOTER (Admin only)
     * POST /api/admin/promoters
     */
    async createPromoter(req, res) {
        try {
            const {
                promoter_name,
                promoter_email,
                activation_code,
                referral_code,
                max_redemptions
            } = req.body;

            // Validation
            if (!promoter_name || !promoter_email || !activation_code || !referral_code) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    required: ['promoter_name', 'promoter_email', 'activation_code', 'referral_code']
                });
            }

            // Validate code format
            if (!isValidCodeFormat(activation_code)) {
                return res.status(400).json({
                    error: 'Invalid activation code format',
                    message: 'Code must be 1-10 characters, alphanumeric only (A-Z, 0-9)'
                });
            }

            if (!isValidCodeFormat(referral_code)) {
                return res.status(400).json({
                    error: 'Invalid referral code format',
                    message: 'Code must be 1-10 characters, alphanumeric only (A-Z, 0-9)'
                });
            }

            // Check if codes already exist
            const activationExists = await Promoter.codeExists(activation_code);
            if (activationExists) {
                return res.status(400).json({
                    error: 'Activation code already exists',
                    message: 'Please choose a different activation code'
                });
            }

            const referralExists = await Promoter.codeExists(referral_code);
            if (referralExists) {
                return res.status(400).json({
                    error: 'Referral code already exists',
                    message: 'Please choose a different referral code'
                });
            }

            // Create promoter in database
            const promoter = await Promoter.create({
                promoter_name,
                promoter_email,
                activation_code,
                referral_code,
                max_redemptions: max_redemptions || null,
                created_by: req.admin.id
            });

            // Create Stripe coupon and promotion code for referral code
            try {
                const coupon = await stripe.coupons.create({
                    percent_off: 20,
                    duration: 'repeating',
                    duration_in_months: 1,
                    name: `Promoter: ${promoter_name}`,
                    metadata: {
                        promoter_id: promoter.id,
                        promoter_name: promoter_name
                    }
                });

                const promoCode = await stripe.promotionCodes.create({
                    coupon: coupon.id,
                    code: referral_code.toUpperCase(),
                    max_redemptions: max_redemptions || undefined,
                    metadata: {
                        promoter_id: promoter.id,
                        type: 'referral'
                    }
                });

                // Update promoter with Stripe IDs
                await Promoter.updateStripeIds(promoter.id, {
                    stripe_coupon_id: coupon.id,
                    stripe_promo_code_id: promoCode.id
                });

                console.log(`✅ Created Stripe coupon and promo code for promoter ${promoter_name}`);
            } catch (stripeError) {
                console.error('⚠️ Stripe coupon creation failed:', stripeError.message);
                // Continue anyway - promo code can still work for activation
            }

            res.status(201).json({
                success: true,
                message: 'Promoter created successfully',
                promoter: {
                    id: promoter.id,
                    promoter_name: promoter.promoter_name,
                    promoter_email: promoter.promoter_email,
                    activation_code: promoter.activation_code,
                    referral_code: promoter.referral_code,
                    status: promoter.status
                }
            });

        } catch (error) {
            console.error('❌ Create promoter error:', error);
            res.status(500).json({
                error: 'Failed to create promoter',
                message: error.message
            });
        }
    },

    /**
     * GET ALL PROMOTERS (Admin only)
     * GET /api/admin/promoters
     */
    async getPromoters(req, res) {
        try {
            const { page = 1, limit = 10, status, search } = req.query;

            const result = await Promoter.findAll({
                page: parseInt(page),
                limit: parseInt(limit),
                status,
                search
            });

            res.json({
                success: true,
                ...result
            });

        } catch (error) {
            console.error('❌ Get promoters error:', error);
            res.status(500).json({
                error: 'Failed to get promoters',
                message: error.message
            });
        }
    },

    /**
     * GET PROMOTER BY ID (Admin only)
     * GET /api/admin/promoters/:id
     */
    async getPromoter(req, res) {
        try {
            const { id } = req.params;
            const promoter = await Promoter.findById(id);

            if (!promoter) {
                return res.status(404).json({
                    error: 'Promoter not found'
                });
            }

            res.json({
                success: true,
                promoter
            });

        } catch (error) {
            console.error('❌ Get promoter error:', error);
            res.status(500).json({
                error: 'Failed to get promoter',
                message: error.message
            });
        }
    },

    /**
     * UPDATE PROMOTER (Admin only)
     * PUT /api/admin/promoters/:id
     */
    async updatePromoter(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            const promoter = await Promoter.update(id, updateData);

            if (!promoter) {
                return res.status(404).json({
                    error: 'Promoter not found'
                });
            }

            res.json({
                success: true,
                message: 'Promoter updated successfully',
                promoter
            });

        } catch (error) {
            console.error('❌ Update promoter error:', error);
            res.status(500).json({
                error: 'Failed to update promoter',
                message: error.message
            });
        }
    },

    /**
     * DEACTIVATE PROMOTER (Admin only)
     * DELETE /api/admin/promoters/:id
     */
    async deactivatePromoter(req, res) {
        try {
            const { id } = req.params;

            const promoter = await Promoter.deactivate(id);

            if (!promoter) {
                return res.status(404).json({
                    error: 'Promoter not found'
                });
            }

            res.json({
                success: true,
                message: 'Promoter deactivated. Note: Existing referral codes will continue to work.',
                promoter
            });

        } catch (error) {
            console.error('❌ Deactivate promoter error:', error);
            res.status(500).json({
                error: 'Failed to deactivate promoter',
                message: error.message
            });
        }
    },

    /**
     * REACTIVATE PROMOTER (Admin only)
     * POST /api/admin/promoters/:id/reactivate
     */
    async reactivatePromoter(req, res) {
        try {
            const { id } = req.params;

            const promoter = await Promoter.reactivate(id);

            if (!promoter) {
                return res.status(404).json({
                    error: 'Promoter not found'
                });
            }

            res.json({
                success: true,
                message: 'Promoter reactivated successfully',
                promoter
            });

        } catch (error) {
            console.error('❌ Reactivate promoter error:', error);
            res.status(500).json({
                error: 'Failed to reactivate promoter',
                message: error.message
            });
        }
    },

    /**
     * GET PROMOTER REFERRALS (Admin only)
     * GET /api/admin/promoters/:id/referrals
     */
    async getPromoterReferrals(req, res) {
        try {
            const { id } = req.params;
            const { page = 1, limit = 10 } = req.query;

            const promoter = await Promoter.findById(id);
            if (!promoter) {
                return res.status(404).json({
                    error: 'Promoter not found'
                });
            }

            const result = await PromoCodeRedemption.getByPromoterId(id, {
                page: parseInt(page),
                limit: parseInt(limit)
            });

            res.json({
                success: true,
                promoter: {
                    id: promoter.id,
                    promoter_name: promoter.promoter_name,
                    referral_code: promoter.referral_code
                },
                ...result
            });

        } catch (error) {
            console.error('❌ Get promoter referrals error:', error);
            res.status(500).json({
                error: 'Failed to get promoter referrals',
                message: error.message
            });
        }
    },

    /**
     * GET PROMOTER STATS (Admin only)
     * GET /api/admin/promoters/stats
     */
    async getPromoterStats(req, res) {
        try {
            const stats = await Promoter.getStats();

            res.json({
                success: true,
                stats: {
                    total: parseInt(stats.total),
                    active: parseInt(stats.active),
                    pending: parseInt(stats.pending),
                    inactive: parseInt(stats.inactive),
                    total_referrals: parseInt(stats.total_referrals)
                }
            });

        } catch (error) {
            console.error('❌ Get promoter stats error:', error);
            res.status(500).json({
                error: 'Failed to get promoter stats',
                message: error.message
            });
        }
    },

    /**
     * VALIDATE PROMO CODE (Public - for subscription flow)
     * POST /api/payments/validate-promo-code
     */
    async validatePromoCode(req, res) {
        try {
            const { code } = req.body;

            if (!code) {
                return res.status(400).json({
                    valid: false,
                    error: 'Code is required'
                });
            }

            const upperCode = code.toUpperCase().trim();

            if (!isValidCodeFormat(upperCode)) {
                return res.status(400).json({
                    valid: false,
                    error: 'Invalid code format'
                });
            }

            // Check if it's an activation code
            const promoterByActivation = await Promoter.findByActivationCode(upperCode);
            if (promoterByActivation) {
                // Check if already activated
                if (promoterByActivation.user_id) {
                    return res.json({
                        valid: false,
                        error: 'This activation code has already been used'
                    });
                }

                return res.json({
                    valid: true,
                    type: 'activation',
                    promoter_id: promoterByActivation.id,
                    promoter_name: promoterByActivation.promoter_name,
                    message: 'Welcome! You will receive free platform access.'
                });
            }

            // Check if it's a referral code
            const promoterByReferral = await Promoter.findByReferralCode(upperCode);
            if (promoterByReferral) {
                // Check max redemptions
                const redemptionCheck = await Promoter.checkMaxRedemptions(promoterByReferral.id);
                if (!redemptionCheck.allowed) {
                    return res.json({
                        valid: false,
                        error: 'This promo code has reached its maximum redemptions'
                    });
                }

                return res.json({
                    valid: true,
                    type: 'referral',
                    promoter_id: promoterByReferral.id,
                    promoter_name: promoterByReferral.promoter_name,
                    discount_percent: promoterByReferral.discount_percent,
                    discount_duration: promoterByReferral.discount_duration,
                    stripe_promo_code_id: promoterByReferral.stripe_promo_code_id,
                    message: `${promoterByReferral.discount_percent}% off for ${promoterByReferral.discount_duration} month!`
                });
            }

            // Check if it's a promo code from the new promo_codes table
            const promoCodeResult = await PromoCode.validate(upperCode);
            if (promoCodeResult.valid) {
                // Check if it's a free access code (for promoters)
                if (promoCodeResult.code_type === 'free_access') {
                    return res.json({
                        valid: true,
                        type: 'activation', // This tells frontend to skip payment
                        promo_code_id: promoCodeResult.promoCode.id,
                        code_type: 'free_access',
                        message: 'Welcome! You will receive free platform access.'
                    });
                }

                // Regular discount code
                return res.json({
                    valid: true,
                    type: 'promo_code',
                    promo_code_id: promoCodeResult.promoCode.id,
                    discount_percent: promoCodeResult.discount_percent,
                    discount_duration: promoCodeResult.discount_duration,
                    stripe_promo_code_id: promoCodeResult.promoCode.stripe_promo_code_id,
                    message: `${promoCodeResult.discount_percent}% off for ${promoCodeResult.discount_duration} month${promoCodeResult.discount_duration > 1 ? 's' : ''}!`
                });
            }

            // Code not found
            return res.json({
                valid: false,
                error: 'Invalid or expired promo code'
            });

        } catch (error) {
            console.error('❌ Validate promo code error:', error);
            res.status(500).json({
                valid: false,
                error: 'Failed to validate promo code'
            });
        }
    },

    /**
     * ACTIVATE PROMOTER (Used during subscription flow)
     * Internal function - called from paymentController
     */
    async activatePromoterAccount(promoterId, userId) {
        try {
            const promoter = await Promoter.activate(promoterId, userId);
            console.log(`✅ Promoter activated: ${promoter.promoter_name} (user: ${userId})`);
            return promoter;
        } catch (error) {
            console.error('❌ Activate promoter account error:', error);
            throw error;
        }
    },

    /**
     * RECORD REFERRAL (Used during subscription flow)
     * Internal function - called from paymentController
     */
    async recordReferral(redemptionData) {
        try {
            const redemption = await PromoCodeRedemption.create(redemptionData);
            console.log(`✅ Referral recorded: ${redemptionData.referral_code}`);
            return redemption;
        } catch (error) {
            console.error('❌ Record referral error:', error);
            throw error;
        }
    }
};

export default PromoterController;
