/**
 * Fix Activated Promoters Without Subscriptions
 *
 * This script finds promoters who have activated (have user_id) but don't have
 * a subscription record, and creates the subscription for them.
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixActivatedPromoters() {
    const client = await pool.connect();

    try {
        console.log('🔍 Finding activated promoters without subscriptions...\n');

        // Find promoters who have a user_id but no subscription
        const promotersQuery = `
            SELECT
                p.id as promoter_id,
                p.promoter_name,
                p.promoter_email,
                p.user_id,
                p.status,
                p.activated_at,
                ep.id as entrepreneur_profile_id,
                s.id as subscription_id
            FROM promoters p
            LEFT JOIN entrepreneur_profiles ep ON ep.user_id = p.user_id
            LEFT JOIN subscriptions s ON s.user_id = p.user_id
            WHERE p.user_id IS NOT NULL
            AND p.status = 'active'
        `;

        const result = await client.query(promotersQuery);

        console.log(`Found ${result.rows.length} activated promoter(s)\n`);

        for (const promoter of result.rows) {
            console.log(`📋 Promoter: ${promoter.promoter_name} (ID: ${promoter.promoter_id})`);
            console.log(`   User ID: ${promoter.user_id}`);
            console.log(`   Entrepreneur Profile ID: ${promoter.entrepreneur_profile_id || 'MISSING'}`);
            console.log(`   Subscription ID: ${promoter.subscription_id || 'MISSING'}`);

            if (!promoter.entrepreneur_profile_id) {
                console.log(`   ⚠️  Skipping - No entrepreneur profile found\n`);
                continue;
            }

            if (promoter.subscription_id) {
                console.log(`   ✅ Already has subscription\n`);
                continue;
            }

            // Create subscription for this promoter
            console.log(`   🔧 Creating subscription...`);

            const now = new Date();
            const farFuture = new Date('2099-12-31');

            const insertQuery = `
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

            const subscription = await client.query(insertQuery, [
                promoter.user_id,
                promoter.entrepreneur_profile_id,
                null, // No Stripe customer for promoters
                `promoter_${promoter.promoter_id}_${promoter.user_id}`,
                'premium',
                'active',
                null,
                now,
                farFuture
            ]);

            // Update entrepreneur profile
            await client.query(`
                UPDATE entrepreneur_profiles
                SET subscription_plan = 'premium',
                    subscription_start = $1,
                    subscription_end = $2,
                    updated_at = NOW()
                WHERE id = $3
            `, [now, farFuture, promoter.entrepreneur_profile_id]);

            // Make sure user is marked as promoter
            await client.query(`
                UPDATE users
                SET is_promoter = true, promoter_id = $1
                WHERE id = $2
            `, [promoter.promoter_id, promoter.user_id]);

            console.log(`   ✅ Subscription created (ID: ${subscription.rows[0].id})\n`);
        }

        console.log('✅ Done fixing activated promoters!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

fixActivatedPromoters().catch(console.error);
