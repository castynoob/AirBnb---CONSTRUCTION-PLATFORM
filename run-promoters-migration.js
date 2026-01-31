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

async function runMigration() {
    console.log('Starting promoters migration...\n');

    try {
        const migrationSQL = readFileSync(
            join(__dirname, 'migrations', 'create_promoters_tables.sql'),
            'utf8'
        );

        await pool.query(migrationSQL);

        console.log('Migration completed successfully!');
        console.log('Created tables:');
        console.log('  - promoters');
        console.log('  - promo_code_redemptions');
        console.log('  - Added is_promoter and promoter_id columns to users table');

    } catch (error) {
        console.error('Migration failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
