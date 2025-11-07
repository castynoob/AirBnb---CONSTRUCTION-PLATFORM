// ============================================
// Check Conversations and Their Job Associations
// ============================================

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DB,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});

async function checkConversations() {
  try {
    console.log('\n🔍 Checking all conversations and their job associations...\n');

    // Get all conversations with their job associations
    const query = `
      SELECT
        c.id,
        c.participant1_id,
        c.participant2_id,
        c.job_id,
        c.created_at,
        c.last_message_at,
        u1.first_name || ' ' || u1.last_name as participant1_name,
        u2.first_name || ' ' || u2.last_name as participant2_name,
        j.title as job_title,
        j.category as job_category,
        b.id as bid_id,
        b.status as bid_status,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
      FROM conversations c
      LEFT JOIN users u1 ON c.participant1_id = u1.id
      LEFT JOIN users u2 ON c.participant2_id = u2.id
      LEFT JOIN jobs j ON c.job_id = j.id
      LEFT JOIN bids b ON b.job_id = j.id AND b.status = 'approved'
      ORDER BY c.last_message_at DESC
    `;

    const result = await pool.query(query);

    console.log(`📊 Found ${result.rows.length} conversations:\n`);

    // Group conversations by job association
    const withJob = result.rows.filter(c => c.job_id !== null);
    const withoutJob = result.rows.filter(c => c.job_id === null);

    console.log(`✅ Conversations WITH job_id: ${withJob.length}`);
    console.log(`❌ Conversations WITHOUT job_id: ${withoutJob.length}\n`);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📋 CONVERSATIONS WITH JOB ASSOCIATION:');
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (withJob.length > 0) {
      withJob.forEach(conv => {
        console.log(`Conversation ID: ${conv.id}`);
        console.log(`  Participants: ${conv.participant1_name} ↔️ ${conv.participant2_name}`);
        console.log(`  Job: ${conv.job_title || 'N/A'} (${conv.job_category || 'N/A'})`);
        console.log(`  Job ID: ${conv.job_id}`);
        console.log(`  Bid ID: ${conv.bid_id || 'No approved bid'}`);
        console.log(`  Bid Status: ${conv.bid_status || 'N/A'}`);
        console.log(`  Messages: ${conv.message_count}`);
        console.log(`  Last activity: ${new Date(conv.last_message_at).toLocaleString()}`);
        console.log('───────────────────────────────────────────────────────────────\n');
      });
    } else {
      console.log('  (None)\n');
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('❌ CONVERSATIONS WITHOUT JOB ASSOCIATION:');
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (withoutJob.length > 0) {
      withoutJob.forEach(conv => {
        console.log(`Conversation ID: ${conv.id}`);
        console.log(`  Participants: ${conv.participant1_name} ↔️ ${conv.participant2_name}`);
        console.log(`  Job ID: NULL`);
        console.log(`  Messages: ${conv.message_count}`);
        console.log(`  Created: ${new Date(conv.created_at).toLocaleString()}`);
        console.log(`  Last activity: ${new Date(conv.last_message_at).toLocaleString()}`);
        console.log('───────────────────────────────────────────────────────────────\n');
      });
    } else {
      console.log('  (None)\n');
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Total conversations: ${result.rows.length}`);
    console.log(`With job association: ${withJob.length} (${((withJob.length/result.rows.length)*100).toFixed(1)}%)`);
    console.log(`Without job association: ${withoutJob.length} (${((withoutJob.length/result.rows.length)*100).toFixed(1)}%)`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (withoutJob.length > 0) {
      console.log('💡 NOTE: Conversations without job_id will not show the job/bid dropdown.');
      console.log('   This is expected for conversations that were not started from a job context.\n');
    }

  } catch (error) {
    console.error('❌ Error checking conversations:', error);
  } finally {
    await pool.end();
  }
}

checkConversations();
