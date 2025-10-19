import db from '../config/db.js';

const Subscription = {
    /**
     * Create or update subscription
     */
    async upsert(subscriptionData) {
        const {
            user_id,
            entrepreneur_profile_id,
            stripe_customer_id,
            stripe_subscription_id,
            plan_type,
            status,
            trial_end,
            current_period_start,
            current_period_end
        } = subscriptionData;

        const query = `
            INSERT INTO subscriptions (
                user_id, entrepreneur_profile_id, stripe_customer_id, 
                stripe_subscription_id, plan_type, status, trial_end,
                current_period_start, current_period_end
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (user_id) 
            DO UPDATE SET
                stripe_subscription_id = $4,
                plan_type = $5,
                status = $6,
                trial_end = $7,
                current_period_start = $8,
                current_period_end = $9,
                updated_at = NOW()
            RETURNING *;
        `;

        const result = await db.query(query, [
            user_id,
            entrepreneur_profile_id,
            stripe_customer_id,
            stripe_subscription_id,
            plan_type,
            status,
            trial_end,
            current_period_start,
            current_period_end
        ]);

        // Also update entrepreneur_profiles table
        if (entrepreneur_profile_id) {
            await db.query(
                `UPDATE entrepreneur_profiles 
                 SET subscription_plan = $1, 
                     subscription_start = $2, 
                     subscription_end = $3,
                     updated_at = NOW()
                 WHERE id = $4`,
                [plan_type, current_period_start, current_period_end, entrepreneur_profile_id]
            );
        }

        return result.rows[0];
    },

    /**
     * Find subscription by user ID
     */
    async findByUserId(user_id) {
        const query = 'SELECT * FROM subscriptions WHERE user_id = $1';
        const result = await db.query(query, [user_id]);
        return result.rows[0];
    },

    /**
     * Find subscription by Stripe ID
     */
    async findByStripeId(stripe_subscription_id) {
        const query = 'SELECT * FROM subscriptions WHERE stripe_subscription_id = $1';
        const result = await db.query(query, [stripe_subscription_id]);
        return result.rows[0];
    },

    /**
     * Update subscription status
     */
    async updateStatus(stripe_subscription_id, status) {
        const query = `
            UPDATE subscriptions 
            SET status = $1, updated_at = NOW()
            WHERE stripe_subscription_id = $2
            RETURNING *;
        `;
        const result = await db.query(query, [status, stripe_subscription_id]);
        return result.rows[0];
    },

    /**
     * Cancel subscription
     */
    async cancel(stripe_subscription_id) {
        const query = `
            UPDATE subscriptions 
            SET cancel_at_period_end = true, 
                canceled_at = NOW(),
                updated_at = NOW()
            WHERE stripe_subscription_id = $1
            RETURNING *;
        `;
        const result = await db.query(query, [stripe_subscription_id]);
        return result.rows[0];
    }
};

export default Subscription;