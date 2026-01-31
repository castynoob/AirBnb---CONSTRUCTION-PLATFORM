/**
 * Fix Subscriptions Table
 * Changes promoter_id from UUID to INTEGER to match promoters table
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixSubscriptionsTable() {
    console.log('Fixing subscriptions table...\n');

    try {
        const migrationSQL = readFileSync(
            join(__dirname, 'migrations', 'fix_subscriptions_promoter_id.sql'),
            'utf8'
        );

        await pool.query(migrationSQL);

        console.log('✅ Subscriptions table fixed!');
        console.log('  - promoter_id changed to INTEGER');
        console.log('  - Added promo_code_used, discount_percent, discount_months columns');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

fixSubscriptionsTable();
