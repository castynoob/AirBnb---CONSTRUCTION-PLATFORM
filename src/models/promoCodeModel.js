import db from '../config/db.js';
import crypto from 'crypto';

const PromoCode = {
    /**
     * Generate a unique promo code
     */
    generateCode(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < length; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    },

    /**
     * Create a new promo code
     */
    async create(promoCodeData) {
        const {
            code = this.generateCode(),
            description = null,
            discount_percent = 20,
            discount_duration = 1,
            max_uses = 1,
            expires_at = null,
            created_by = null,
            code_type = 'discount' // 'discount' or 'free_access'
        } = promoCodeData;

        // Check if code already exists
        const existing = await this.findByCode(code);
        if (existing) {
            throw new Error('Promo code already exists');
        }

        const query = `
            INSERT INTO promo_codes (
                code, description, discount_percent, discount_duration,
                max_uses, expires_at, created_by, code_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
        `;

        const result = await db.query(query, [
            code.toUpperCase(),
            description,
            code_type === 'free_access' ? 100 : discount_percent, // Free access = 100% off
            code_type === 'free_access' ? 999 : discount_duration, // Free access = indefinite
            max_uses,
            expires_at,
            created_by,
            code_type
        ]);

        return result.rows[0];
    },

    /**
     * Find promo code by ID
     */
    async findById(id) {
        const query = `
            SELECT pc.*,
                   (SELECT COUNT(*) FROM promo_code_uses WHERE promo_code_id = pc.id) as times_used,
                   u.first_name as created_by_first_name,
                   u.last_name as created_by_last_name
            FROM promo_codes pc
            LEFT JOIN users u ON pc.created_by = u.id
            WHERE pc.id = $1
        `;
        const result = await db.query(query, [id]);
        return result.rows[0];
    },

    /**
     * Find promo code by code string
     */
    async findByCode(code) {
        const query = `
            SELECT pc.*,
                   (SELECT COUNT(*) FROM promo_code_uses WHERE promo_code_id = pc.id) as times_used
            FROM promo_codes pc
            WHERE pc.code = $1 AND pc.is_active = true
        `;
        const result = await db.query(query, [code.toUpperCase()]);
        return result.rows[0];
    },

    /**
     * Get all promo codes with pagination and filters
     */
    async findAll({ page = 1, limit = 10, status = null, search = null }) {
        const offset = (page - 1) * limit;
        let whereConditions = [];
        let params = [];
        let paramIndex = 1;

        if (status === 'used') {
            whereConditions.push(`(SELECT COUNT(*) FROM promo_code_uses WHERE promo_code_id = pc.id) > 0`);
        } else if (status === 'unused') {
            whereConditions.push(`(SELECT COUNT(*) FROM promo_code_uses WHERE promo_code_id = pc.id) = 0`);
        } else if (status === 'expired') {
            whereConditions.push(`pc.expires_at < NOW()`);
        } else if (status === 'active') {
            whereConditions.push(`pc.is_active = true AND (pc.expires_at IS NULL OR pc.expires_at > NOW())`);
        }

        if (search) {
            whereConditions.push(`(
                pc.code ILIKE $${paramIndex} OR
                pc.description ILIKE $${paramIndex}
            )`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        const whereClause = whereConditions.length > 0
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';

        // Get total count
        const countQuery = `SELECT COUNT(*) FROM promo_codes pc ${whereClause}`;
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Get promo codes with usage count
        const query = `
            SELECT pc.*,
                   (SELECT COUNT(*) FROM promo_code_uses WHERE promo_code_id = pc.id) as times_used,
                   u.first_name as created_by_first_name,
                   u.last_name as created_by_last_name
            FROM promo_codes pc
            LEFT JOIN users u ON pc.created_by = u.id
            ${whereClause}
            ORDER BY pc.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(limit, offset);

        const result = await db.query(query, params);

        return {
            promoCodes: result.rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    },

    /**
     * Validate promo code for use
     */
    async validate(code) {
        const promoCode = await this.findByCode(code);

        if (!promoCode) {
            return { valid: false, message: 'Invalid promo code' };
        }

        if (!promoCode.is_active) {
            return { valid: false, message: 'Promo code is inactive' };
        }

        if (promoCode.expires_at && new Date(promoCode.expires_at) < new Date()) {
            return { valid: false, message: 'Promo code has expired' };
        }

        if (promoCode.max_uses && parseInt(promoCode.times_used) >= promoCode.max_uses) {
            return { valid: false, message: 'Promo code has reached maximum uses' };
        }

        return {
            valid: true,
            promoCode: promoCode,
            discount_percent: promoCode.discount_percent,
            discount_duration: promoCode.discount_duration,
            code_type: promoCode.code_type || 'discount'
        };
    },

    /**
     * Record promo code usage
     */
    async recordUse(promoCodeId, userId, subscriptionId = null) {
        const query = `
            INSERT INTO promo_code_uses (
                promo_code_id, used_by_user_id, subscription_id
            ) VALUES ($1, $2, $3)
            RETURNING *;
        `;
        const result = await db.query(query, [promoCodeId, userId, subscriptionId]);
        return result.rows[0];
    },

    /**
     * Get users who used a promo code
     */
    async getUses(promoCodeId, { page = 1, limit = 10 } = {}) {
        const offset = (page - 1) * limit;

        const countQuery = 'SELECT COUNT(*) FROM promo_code_uses WHERE promo_code_id = $1';
        const countResult = await db.query(countQuery, [promoCodeId]);
        const total = parseInt(countResult.rows[0].count);

        const query = `
            SELECT pcu.*,
                   u.first_name, u.last_name, u.email,
                   s.plan_type, s.status as subscription_status
            FROM promo_code_uses pcu
            JOIN users u ON pcu.used_by_user_id = u.id
            LEFT JOIN subscriptions s ON pcu.subscription_id = s.id
            WHERE pcu.promo_code_id = $1
            ORDER BY pcu.used_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await db.query(query, [promoCodeId, limit, offset]);

        return {
            uses: result.rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    },

    /**
     * Deactivate promo code
     */
    async deactivate(id) {
        const query = `
            UPDATE promo_codes
            SET is_active = false, updated_at = NOW()
            WHERE id = $1
            RETURNING *;
        `;
        const result = await db.query(query, [id]);
        return result.rows[0];
    },

    /**
     * Reactivate promo code
     */
    async reactivate(id) {
        const query = `
            UPDATE promo_codes
            SET is_active = true, updated_at = NOW()
            WHERE id = $1
            RETURNING *;
        `;
        const result = await db.query(query, [id]);
        return result.rows[0];
    },

    /**
     * Delete promo code (only if never used)
     */
    async delete(id) {
        // Check if it has been used
        const usesQuery = 'SELECT COUNT(*) FROM promo_code_uses WHERE promo_code_id = $1';
        const usesResult = await db.query(usesQuery, [id]);

        if (parseInt(usesResult.rows[0].count) > 0) {
            throw new Error('Cannot delete a promo code that has been used');
        }

        const query = 'DELETE FROM promo_codes WHERE id = $1 RETURNING *';
        const result = await db.query(query, [id]);
        return result.rows[0];
    },

    /**
     * Get statistics
     */
    async getStats() {
        const query = `
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW())) as active,
                COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM promo_code_uses WHERE promo_code_id = promo_codes.id) > 0) as used,
                COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM promo_code_uses WHERE promo_code_id = promo_codes.id) = 0) as unused,
                COUNT(*) FILTER (WHERE expires_at < NOW()) as expired,
                (SELECT COUNT(*) FROM promo_code_uses) as total_redemptions
            FROM promo_codes
        `;
        const result = await db.query(query);
        return result.rows[0];
    },

    /**
     * Check if user has already used a promo code
     */
    async hasUserUsed(userId, promoCodeId = null) {
        let query = 'SELECT id FROM promo_code_uses WHERE used_by_user_id = $1';
        let params = [userId];

        if (promoCodeId) {
            query += ' AND promo_code_id = $2';
            params.push(promoCodeId);
        }

        const result = await db.query(query, params);
        return result.rows.length > 0;
    }
};

export default PromoCode;
