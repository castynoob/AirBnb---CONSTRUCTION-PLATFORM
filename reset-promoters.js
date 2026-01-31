/**
 * Reset Promoters System
 *
 * This script will:
 * 1. Delete all promo code redemptions
 * 2. Delete all promoters
 * 3. Remove promoter-related columns from users table
 * 4. Delete promoter subscriptions
 * 5. Drop the promoters and promo_code_redemptions tables
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function resetPromoters() {
    const client = await pool.connect();

    try {
        console.log('⚠️  WARNING: This will delete ALL promoter data!\n');
        console.log('Starting reset...\n');

        // 1. Delete promoter subscriptions (subscriptions with stripe_subscription_id starting with 'promoter_')
        console.log('1. Deleting promoter subscriptions...');
        const subResult = await client.query(`
            DELETE FROM subscriptions
            WHERE stripe_subscription_id LIKE 'promoter_%'
            RETURNING id
        `);
        console.log(`   Deleted ${subResult.rowCount} promoter subscription(s)\n`);

        // 2. Delete all promo code redemptions
        console.log('2. Deleting promo code redemptions...');
        const redemptionsResult = await client.query('DELETE FROM promo_code_redemptions RETURNING id');
        console.log(`   Deleted ${redemptionsResult.rowCount} redemption(s)\n`);

        // 3. Reset user promoter fields
        console.log('3. Resetting user promoter fields...');
        const usersResult = await client.query(`
            UPDATE users
            SET is_promoter = false, promoter_id = NULL
            WHERE is_promoter = true OR promoter_id IS NOT NULL
            RETURNING id
        `);
        console.log(`   Reset ${usersResult.rowCount} user(s)\n`);

        // 4. Delete all promoters
        console.log('4. Deleting all promoters...');
        const promotersResult = await client.query('DELETE FROM promoters RETURNING id');
        console.log(`   Deleted ${promotersResult.rowCount} promoter(s)\n`);

        // 5. Drop the tables (optional - uncomment if you want to completely remove the tables)
        console.log('5. Dropping tables...');
        await client.query('DROP TABLE IF EXISTS promo_code_redemptions CASCADE');
        console.log('   Dropped promo_code_redemptions table');
        await client.query('DROP TABLE IF EXISTS promoters CASCADE');
        console.log('   Dropped promoters table\n');

        // 6. Remove columns from users table (optional)
        console.log('6. Removing promoter columns from users table...');
        await client.query('ALTER TABLE users DROP COLUMN IF EXISTS is_promoter');
        await client.query('ALTER TABLE users DROP COLUMN IF EXISTS promoter_id');
        console.log('   Removed is_promoter and promoter_id columns\n');

        console.log('✅ Promoter system completely reset!');
        console.log('\nTo re-enable the promoter system, run the migration:');
        console.log('   node run-promoters-migration.js');

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

resetPromoters().catch(console.error);
