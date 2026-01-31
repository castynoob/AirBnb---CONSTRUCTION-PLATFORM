import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixConstraint() {
    console.log('Fixing promoters table constraint...\n');

    try {
        // Drop the foreign key constraint
        await pool.query(`
            ALTER TABLE promoters DROP CONSTRAINT IF EXISTS promoters_created_by_fkey;
        `);
        console.log('✓ Dropped foreign key constraint on created_by');

        // Check if created_by is INTEGER and needs to be UUID
        const result = await pool.query(`
            SELECT data_type FROM information_schema.columns
            WHERE table_name = 'promoters' AND column_name = 'created_by'
        `);

        if (result.rows.length > 0 && result.rows[0].data_type === 'integer') {
            await pool.query(`ALTER TABLE promoters DROP COLUMN created_by`);
            await pool.query(`ALTER TABLE promoters ADD COLUMN created_by UUID`);
            console.log('✓ Changed created_by column to UUID type');
        } else if (result.rows.length > 0) {
            console.log('✓ created_by column type is already correct:', result.rows[0].data_type);
        }

        console.log('\nFix completed successfully!');
        console.log('You can now create promoters from the admin panel.');

    } catch (error) {
        console.error('Fix failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

fixConstraint();
