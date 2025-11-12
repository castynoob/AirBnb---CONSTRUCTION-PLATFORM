#!/usr/bin/env node
/**
 * Initialize Supabase Storage Buckets
 *
 * This script creates all required storage buckets in Supabase
 * Run once during initial setup or when adding new buckets
 *
 * Usage: node scripts/initSupabase.js
 */

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

import { initializeSupabaseBuckets, getSupabaseInfo } from '../src/config/supabase.js';

async function init() {
  console.log('\n🚀 Supabase Initialization Script\n');
  console.log('='.repeat(50));

  // Check configuration
  const info = getSupabaseInfo();
  console.log('\n📋 Configuration Status:');
  console.log(`   URL: ${info.url}`);
  console.log(`   Service Key: ${info.hasServiceKey ? '✓ Configured' : '✗ Missing'}`);
  console.log(`   Anon Key: ${info.hasAnonKey ? '✓ Configured' : '✗ Missing'}`);
  console.log(`   Status: ${info.isConfigured ? '✓ Ready' : '✗ Not Configured'}`);

  if (!info.isConfigured) {
    console.error('\n❌ Supabase is not properly configured');
    console.error('   Please check your .env file for:');
    console.error('   - SUPABASE_URL');
    console.error('   - SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log('\n📦 Buckets to create:');
  info.buckets.forEach((bucket, index) => {
    console.log(`   ${index + 1}. ${bucket}`);
  });

  console.log('\n⏳ Creating buckets...\n');

  try {
    await initializeSupabaseBuckets();
    console.log('\n✅ Supabase initialization complete!\n');
    console.log('='.repeat(50));
    console.log('\nYou can now upload files to these buckets.\n');
  } catch (error) {
    console.error('\n❌ Error during initialization:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run the initialization
init().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
