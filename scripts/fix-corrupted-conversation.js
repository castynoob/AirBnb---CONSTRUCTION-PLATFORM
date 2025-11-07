import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const { Pool } = pg;

async function fixCorruptedConversation() {
  const pool = new Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DB,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    console.log('🔄 Connecting to database...');
    const client = await pool.connect();

    console.log('🔍 Finding corrupted conversations...');
    const findQuery = `
      SELECT id, participant1_id, participant2_id 
      FROM conversations 
      WHERE participant1_id = participant2_id
    `;
    const corruptedResults = await client.query(findQuery);
    
    if (corruptedResults.rows.length === 0) {
      console.log('✅ No corrupted conversations found!');
      client.release();
      await pool.end();
      return;
    }

    console.log(`⚠️ Found ${corruptedResults.rows.length} corrupted conversation(s):`);
    corruptedResults.rows.forEach(row => {
      console.log(`   - ID: ${row.id}, Both participants: ${row.participant1_id}`);
    });

    console.log('🗑️ Deleting corrupted conversations...');
    const deleteQuery = `
      DELETE FROM conversations 
      WHERE participant1_id = participant2_id
      RETURNING id
    `;
    const deleteResults = await client.query(deleteQuery);
    
    console.log(`✅ Deleted ${deleteResults.rows.length} corrupted conversation(s)`);
    deleteResults.rows.forEach(row => {
      console.log(`   - Deleted conversation ID: ${row.id}`);
    });

    client.release();
    await pool.end();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error fixing corrupted conversations:', error);
    process.exit(1);
  }
}

fixCorruptedConversation();
