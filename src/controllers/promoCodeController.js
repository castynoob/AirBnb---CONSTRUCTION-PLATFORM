import PromoCode from '../models/promoCodeModel.js';
import stripe from '../config/stripe.js';

const PromoCodeController = {
    /**
     * Generate a new promo code
     * POST /api/admin/promo-codes
     */
    async create(req, res) {
        try {
            const {
                code,
                description,
                code_type = 'free_access', // 'free_access' or 'discount'
                discount_percent = 20,
                discount_duration = 1,
                max_uses = 1,
                expires_at
            } = req.body;

            // Generate code if not provided
            const finalCode = code ? code.toUpperCase() : PromoCode.generateCode();

            // Create promo code in database
            const promoCode = await PromoCode.create({
                code: finalCode,
                description,
                code_type,
                discount_percent,
                discount_duration,
                max_uses,
                expires_at: expires_at || null,
                created_by: req.admin.id
            });

            // Only create Stripe coupon for discount codes (not free_access)
            if (code_type === 'discount') {
                try {
                    // Create Stripe coupon
                    const coupon = await stripe.coupons.create({
                        percent_off: discount_percent,
                        duration: 'repeating',
                        duration_in_months: discount_duration,
                        name: `Promo Code: ${finalCode}`
                    });

                    // Create Stripe promotion code
                    const stripePromoCode = await stripe.promotionCodes.create({
                        coupon: coupon.id,
                        code: finalCode,
                        max_redemptions: max_uses || undefined
                    });

                    // Update with Stripe IDs
                    await PromoCode.update(promoCode.id, {
                        stripe_coupon_id: coupon.id,
                        stripe_promo_code_id: stripePromoCode.id
                    });

                    promoCode.stripe_coupon_id = coupon.id;
                    promoCode.stripe_promo_code_id = stripePromoCode.id;
                } catch (stripeError) {
                    console.error('Stripe promo code creation failed:', stripeError.message);
                    // Continue without Stripe integration
                }
            }

            res.status(201).json({
                success: true,
                message: code_type === 'free_access'
                    ? 'Free access code generated successfully'
                    : 'Promo code generated successfully',
                promoCode
            });

        } catch (error) {
            console.error('Create promo code error:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to generate promo code'
            });
        }
    },

    /**
     * Get all promo codes
     * GET /api/admin/promo-codes
     */
    async getAll(req, res) {
        try {
            const { page = 1, limit = 10, status, search } = req.query;

            const result = await PromoCode.findAll({
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
            console.error('Get promo codes error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch promo codes'
            });
        }
    },

    /**
     * Get promo code by ID
     * GET /api/admin/promo-codes/:id
     */
    async getById(req, res) {
        try {
            const { id } = req.params;
            const promoCode = await PromoCode.findById(id);

            if (!promoCode) {
                return res.status(404).json({
                    success: false,
                    message: 'Promo code not found'
                });
            }

            res.json({
                success: true,
                promoCode
            });

        } catch (error) {
            console.error('Get promo code error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch promo code'
            });
        }
    },

    /**
     * Get promo code uses (who used it)
     * GET /api/admin/promo-codes/:id/uses
     */
    async getUses(req, res) {
        try {
            const { id } = req.params;
            const { page = 1, limit = 10 } = req.query;

            const promoCode = await PromoCode.findById(id);
            if (!promoCode) {
                return res.status(404).json({
                    success: false,
                    message: 'Promo code not found'
                });
            }

            const result = await PromoCode.getUses(id, {
                page: parseInt(page),
                limit: parseInt(limit)
            });

            res.json({
                success: true,
                promoCode: {
                    id: promoCode.id,
                    code: promoCode.code,
                    times_used: promoCode.times_used,
                    max_uses: promoCode.max_uses
                },
                ...result
            });

        } catch (error) {
            console.error('Get promo code uses error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch promo code uses'
            });
        }
    },

    /**
     * Deactivate promo code
     * DELETE /api/admin/promo-codes/:id
     */
    async deactivate(req, res) {
        try {
            const { id } = req.params;
            const promoCode = await PromoCode.deactivate(id);

            if (!promoCode) {
                return res.status(404).json({
                    success: false,
                    message: 'Promo code not found'
                });
            }

            res.json({
                success: true,
                message: 'Promo code deactivated',
                promoCode
            });

        } catch (error) {
            console.error('Deactivate promo code error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to deactivate promo code'
            });
        }
    },

    /**
     * Reactivate promo code
     * POST /api/admin/promo-codes/:id/reactivate
     */
    async reactivate(req, res) {
        try {
            const { id } = req.params;
            const promoCode = await PromoCode.reactivate(id);

            if (!promoCode) {
                return res.status(404).json({
                    success: false,
                    message: 'Promo code not found'
                });
            }

            res.json({
                success: true,
                message: 'Promo code reactivated',
                promoCode
            });

        } catch (error) {
            console.error('Reactivate promo code error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to reactivate promo code'
            });
        }
    },

    /**
     * Delete promo code (only if never used)
     * DELETE /api/admin/promo-codes/:id/delete
     */
    async delete(req, res) {
        try {
            const { id } = req.params;
            const promoCode = await PromoCode.delete(id);

            res.json({
                success: true,
                message: 'Promo code deleted',
                promoCode
            });

        } catch (error) {
            console.error('Delete promo code error:', error);
            res.status(400).json({
                success: false,
                message: error.message || 'Failed to delete promo code'
            });
        }
    },

    /**
     * Get promo code statistics
     * GET /api/admin/promo-codes/stats
     */
    async getStats(req, res) {
        try {
            const stats = await PromoCode.getStats();

            res.json({
                success: true,
                stats
            });

        } catch (error) {
            console.error('Get promo code stats error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch statistics'
            });
        }
    },

    /**
     * Validate promo code (public endpoint for subscription)
     * POST /api/promo-codes/validate
     */
    async validate(req, res) {
        try {
            const { code } = req.body;

            if (!code) {
                return res.status(400).json({
                    success: false,
                    message: 'Promo code is required'
                });
            }

            const result = await PromoCode.validate(code);

            if (!result.valid) {
                return res.status(400).json({
                    success: false,
                    message: result.message
                });
            }

            res.json({
                success: true,
                valid: true,
                discount_percent: result.discount_percent,
                discount_duration: result.discount_duration,
                promo_code_id: result.promoCode.id,
                stripe_promo_code_id: result.promoCode.stripe_promo_code_id
            });

        } catch (error) {
            console.error('Validate promo code error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to validate promo code'
            });
        }
    }
};

export default PromoCodeController;
