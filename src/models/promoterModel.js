import db from '../config/db.js';

const Promoter = {
    /**
     * Create a new promoter
     */
    async create(promoterData) {
        const {
            promoter_name,
            promoter_email,
            activation_code,
            referral_code,
            discount_percent = 20,
            discount_duration = 1,
            max_redemptions = null
        } = promoterData;

        const query = `
            INSERT INTO promoters (
                promoter_name, promoter_email, activation_code, referral_code,
                discount_percent, discount_duration, max_redemptions
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;

        const result = await db.query(query, [
            promoter_name,
            promoter_email,
            activation_code.toUpperCase(),
            referral_code.toUpperCase(),
            discount_percent,
            discount_duration,
            max_redemptions
        ]);

        return result.rows[0];
    },

    /**
     * Find promoter by ID
     */
    async findById(id) {
        const query = `
            SELECT p.*,
                   u.first_name, u.last_name, u.email as user_email,
                   (SELECT COUNT(*) FROM promo_code_redemptions WHERE promoter_id = p.id) as referral_count
            FROM promoters p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.id = $1
        `;
        const result = await db.query(query, [id]);
        return result.rows[0];
    },

    /**
     * Find promoter by activation code
     */
    async findByActivationCode(code) {
        const query = `
            SELECT * FROM promoters
            WHERE activation_code = $1 AND is_active = true
        `;
        const result = await db.query(query, [code.toUpperCase()]);
        return result.rows[0];
    },

    /**
     * Find promoter by referral code
     */
    async findByReferralCode(code) {
        const query = `
            SELECT * FROM promoters
            WHERE referral_code = $1 AND is_active = true
        `;
        const result = await db.query(query, [code.toUpperCase()]);
        return result.rows[0];
    },

    /**
     * Find promoter by user ID
     */
    async findByUserId(userId) {
        const query = 'SELECT * FROM promoters WHERE user_id = $1';
        const result = await db.query(query, [userId]);
        return result.rows[0];
    },

    /**
     * Get all promoters with pagination and filters
     */
    async findAll({ page = 1, limit = 10, status = null, search = null }) {
        const offset = (page - 1) * limit;
        let whereConditions = [];
        let params = [];
        let paramIndex = 1;

        if (status) {
            whereConditions.push(`p.status = $${paramIndex}`);
            params.push(status);
            paramIndex++;
        }

        if (search) {
            whereConditions.push(`(
                p.promoter_name ILIKE $${paramIndex} OR
                p.promoter_email ILIKE $${paramIndex} OR
                p.activation_code ILIKE $${paramIndex} OR
                p.referral_code ILIKE $${paramIndex}
            )`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        const whereClause = whereConditions.length > 0
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';

        // Get total count
        const countQuery = `SELECT COUNT(*) FROM promoters p ${whereClause}`;
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Get promoters with referral count
        const query = `
            SELECT p.*,
                   (SELECT COUNT(*) FROM promo_code_redemptions WHERE promoter_id = p.id) as referral_count
            FROM promoters p
            ${whereClause}
            ORDER BY p.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(limit, offset);

        const result = await db.query(query, params);

        return {
            promoters: result.rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    },

    /**
     * Activate promoter (link to user)
     */
    async activate(promoterId, userId) {
        const query = `
            UPDATE promoters
            SET user_id = $1,
                status = 'active',
                activated_at = NOW(),
                updated_at = NOW()
            WHERE id = $2
            RETURNING *;
        `;
        const result = await db.query(query, [userId, promoterId]);

        // Also update the user
        await db.query(
            'UPDATE users SET is_promoter = true, promoter_id = $1 WHERE id = $2',
            [promoterId, userId]
        );

        return result.rows[0];
    },

    /**
     * Update promoter
     */
    async update(id, updateData) {
        const allowedFields = ['promoter_name', 'promoter_email', 'max_redemptions', 'is_active'];
        const updates = [];
        const params = [];
        let paramIndex = 1;

        for (const field of allowedFields) {
            if (updateData[field] !== undefined) {
                updates.push(`${field} = $${paramIndex}`);
                params.push(updateData[field]);
                paramIndex++;
            }
        }

        if (updates.length === 0) {
            return this.findById(id);
        }

        updates.push(`updated_at = NOW()`);
        params.push(id);

        const query = `
            UPDATE promoters
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *;
        `;

        const result = await db.query(query, params);
        return result.rows[0];
    },

    /**
     * Deactivate promoter
     */
    async deactivate(id) {
        const query = `
            UPDATE promoters
            SET is_active = false, status = 'inactive', updated_at = NOW()
            WHERE id = $1
            RETURNING *;
        `;
        const result = await db.query(query, [id]);
        return result.rows[0];
    },

    /**
     * Reactivate promoter
     */
    async reactivate(id) {
        const query = `
            UPDATE promoters
            SET is_active = true,
                status = CASE WHEN user_id IS NOT NULL THEN 'active' ELSE 'pending' END,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *;
        `;
        const result = await db.query(query, [id]);
        return result.rows[0];
    },

    /**
     * Update Stripe IDs
     */
    async updateStripeIds(id, { stripe_coupon_id, stripe_promo_code_id }) {
        const query = `
            UPDATE promoters
            SET stripe_coupon_id = $1, stripe_promo_code_id = $2, updated_at = NOW()
            WHERE id = $3
            RETURNING *;
        `;
        const result = await db.query(query, [stripe_coupon_id, stripe_promo_code_id, id]);
        return result.rows[0];
    },

    /**
     * Check if code exists (for validation)
     */
    async codeExists(code, type = 'any') {
        let query;
        if (type === 'activation') {
            query = 'SELECT id FROM promoters WHERE activation_code = $1';
        } else if (type === 'referral') {
            query = 'SELECT id FROM promoters WHERE referral_code = $1';
        } else {
            query = 'SELECT id FROM promoters WHERE activation_code = $1 OR referral_code = $1';
        }
        const result = await db.query(query, [code.toUpperCase()]);
        return result.rows.length > 0;
    },

    /**
     * Get promoter stats
     */
    async getStats() {
        const query = `
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'active') as active,
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'inactive') as inactive,
                (SELECT COUNT(*) FROM promo_code_redemptions) as total_referrals
            FROM promoters
        `;
        const result = await db.query(query);
        return result.rows[0];
    },

    /**
     * Get referral count for a promoter
     */
    async getReferralCount(promoterId) {
        const query = 'SELECT COUNT(*) FROM promo_code_redemptions WHERE promoter_id = $1';
        const result = await db.query(query, [promoterId]);
        return parseInt(result.rows[0].count);
    },

    /**
     * Check max redemptions
     */
    async checkMaxRedemptions(promoterId) {
        const query = `
            SELECT p.max_redemptions,
                   (SELECT COUNT(*) FROM promo_code_redemptions WHERE promoter_id = p.id) as current_count
            FROM promoters p
            WHERE p.id = $1
        `;
        const result = await db.query(query, [promoterId]);
        if (!result.rows[0]) return { allowed: false };

        const { max_redemptions, current_count } = result.rows[0];
        if (max_redemptions === null) return { allowed: true, remaining: null };

        return {
            allowed: current_count < max_redemptions,
            remaining: max_redemptions - current_count
        };
    }
};

const PromoCodeRedemption = {
    /**
     * Record a redemption
     */
    async create(redemptionData) {
        const {
            referral_code,
            promoter_id,
            redeemed_by_user_id,
            subscription_id,
            discount_percent,
            discount_duration
        } = redemptionData;

        const query = `
            INSERT INTO promo_code_redemptions (
                referral_code, promoter_id, redeemed_by_user_id,
                subscription_id, discount_percent, discount_duration
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;

        const result = await db.query(query, [
            referral_code.toUpperCase(),
            promoter_id,
            redeemed_by_user_id,
            subscription_id,
            discount_percent,
            discount_duration
        ]);

        return result.rows[0];
    },

    /**
     * Get referrals for a promoter
     */
    async getByPromoterId(promoterId, { page = 1, limit = 10 } = {}) {
        const offset = (page - 1) * limit;

        const countQuery = 'SELECT COUNT(*) FROM promo_code_redemptions WHERE promoter_id = $1';
        const countResult = await db.query(countQuery, [promoterId]);
        const total = parseInt(countResult.rows[0].count);

        const query = `
            SELECT r.*,
                   u.first_name, u.last_name, u.email as customer_email,
                   s.plan_type, s.status as subscription_status
            FROM promo_code_redemptions r
            JOIN users u ON r.redeemed_by_user_id = u.id
            LEFT JOIN subscriptions s ON r.subscription_id = s.id
            WHERE r.promoter_id = $1
            ORDER BY r.redeemed_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await db.query(query, [promoterId, limit, offset]);

        return {
            referrals: result.rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    },

    /**
     * Mark promoter as notified
     */
    async markNotified(redemptionId) {
        const query = `
            UPDATE promo_code_redemptions
            SET promoter_notified = true, notified_at = NOW()
            WHERE id = $1
            RETURNING *;
        `;
        const result = await db.query(query, [redemptionId]);
        return result.rows[0];
    },

    /**
     * Check if user already redeemed a code
     */
    async hasUserRedeemed(userId) {
        const query = 'SELECT id FROM promo_code_redemptions WHERE redeemed_by_user_id = $1';
        const result = await db.query(query, [userId]);
        return result.rows.length > 0;
    }
};

export { Promoter, PromoCodeRedemption };
export default Promoter;
