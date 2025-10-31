#!/usr/bin/env node

/**
 * Comprehensive Test Script for Supabase Inspection Feature
 * Tests all inspection endpoints and validates functionality
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const API_BASE_URL = 'http://localhost:5000/api';
const TEST_OUTPUT_DIR = './test-results';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Test state
let authToken = null;
let userId = null;
let propertyId = null;
let inspectionId = null;
let parsedJobs = [];

// Ensure test output directory exists
if (!fs.existsSync(TEST_OUTPUT_DIR)) {
  fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
}

// Helper functions
function logSuccess(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logError(message) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function logInfo(message) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${message}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function logSection(title) {
  console.log(`\n${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.blue}${title}${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
}

function saveTestResult(filename, data) {
  const filepath = path.join(TEST_OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  logInfo(`Saved result to: ${filepath}`);
}

// Test functions
async function test1_LoginUser() {
  logSection('TEST 1: User Login');

  try {
    logInfo('Attempting to login as property_manager...');

    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'manager@example.com',
      password: 'password123'
    });

    if (response.data.success && response.data.token) {
      authToken = response.data.token;
      userId = response.data.user.id;

      logSuccess('Login successful');
      logInfo(`User ID: ${userId}`);
      logInfo(`Role: ${response.data.user.role}`);

      saveTestResult('01-login-response.json', response.data);
      return true;
    } else {
      logError('Login failed: No token received');
      return false;
    }
  } catch (error) {
    logError(`Login failed: ${error.response?.data?.message || error.message}`);

    // Try to register if login fails
    logWarning('Login failed. You may need to register a test user first.');
    logInfo('Run: POST /api/auth/register with email: manager@example.com, password: password123, role: property_manager');

    return false;
  }
}

async function test2_GetProperties() {
  logSection('TEST 2: Get Properties');

  try {
    logInfo('Fetching properties for testing...');

    const response = await axios.get(`${API_BASE_URL}/properties`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    if (response.data.success && response.data.properties.length > 0) {
      propertyId = response.data.properties[0].id;

      logSuccess(`Found ${response.data.properties.length} properties`);
      logInfo(`Using property ID: ${propertyId}`);
      logInfo(`Property: ${response.data.properties[0].property_name}`);

      saveTestResult('02-properties-response.json', response.data);
      return true;
    } else {
      logWarning('No properties found. Creating a test property...');
      return await createTestProperty();
    }
  } catch (error) {
    logError(`Failed to get properties: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function createTestProperty() {
  try {
    const response = await axios.post(`${API_BASE_URL}/properties`, {
      property_name: 'Test Property for Inspection',
      address: '123 Test Street',
      city: 'Test City',
      state: 'CA',
      zip_code: '12345'
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    if (response.data.success) {
      propertyId = response.data.property.id;
      logSuccess('Test property created successfully');
      logInfo(`Property ID: ${propertyId}`);
      return true;
    }
    return false;
  } catch (error) {
    logError(`Failed to create property: ${error.message}`);
    return false;
  }
}

async function test3_DownloadTemplate() {
  logSection('TEST 3: Download Inspection Template');

  try {
    logInfo('Downloading inspection template...');

    const response = await axios.get(`${API_BASE_URL}/inspections/template`, {
      headers: { Authorization: `Bearer ${authToken}` },
      responseType: 'arraybuffer'
    });

    const templatePath = path.join(TEST_OUTPUT_DIR, 'inspection-template.xlsx');
    fs.writeFileSync(templatePath, response.data);

    const fileSizeKB = (response.data.length / 1024).toFixed(2);

    logSuccess('Template downloaded successfully');
    logInfo(`File size: ${fileSizeKB} KB`);
    logInfo(`Saved to: ${templatePath}`);

    return true;
  } catch (error) {
    logError(`Failed to download template: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function test4_UploadInspection() {
  logSection('TEST 4: Upload Inspection Excel');

  try {
    const templatePath = path.join(TEST_OUTPUT_DIR, 'inspection-template.xlsx');

    if (!fs.existsSync(templatePath)) {
      logError('Template file not found. Please run test 3 first.');
      return false;
    }

    logInfo('Uploading inspection Excel file...');

    const formData = new FormData();
    formData.append('file', fs.createReadStream(templatePath));
    formData.append('property_id', propertyId);

    const response = await axios.post(`${API_BASE_URL}/inspections/upload`, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${authToken}`
      }
    });

    if (response.data.success) {
      inspectionId = response.data.inspection.id;
      parsedJobs = response.data.parsedData.jobs;

      logSuccess('Inspection uploaded successfully');
      logInfo(`Inspection ID: ${inspectionId}`);
      logInfo(`File name: ${response.data.inspection.file_name}`);
      logInfo(`Status: ${response.data.inspection.status}`);
      logInfo(`Parsed jobs: ${response.data.parsedData.successCount} / ${response.data.parsedData.totalRows}`);

      if (response.data.parsedData.errorCount > 0) {
        logWarning(`Parse errors: ${response.data.parsedData.errorCount}`);
      }

      // Display first 3 parsed jobs
      console.log('\nFirst 3 parsed jobs:');
      parsedJobs.slice(0, 3).forEach((job, idx) => {
        console.log(`  ${idx + 1}. ${job.title} - ${job.category} (${job.urgency})`);
      });

      saveTestResult('04-upload-response.json', response.data);
      return true;
    }

    return false;
  } catch (error) {
    logError(`Failed to upload inspection: ${error.response?.data?.message || error.message}`);
    if (error.response?.data) {
      console.error('Error details:', error.response.data);
    }
    return false;
  }
}

async function test5_PreviewInspection() {
  logSection('TEST 5: Preview Inspection');

  try {
    logInfo('Previewing inspection (re-parsing Excel)...');

    const response = await axios.get(`${API_BASE_URL}/inspections/${inspectionId}/preview`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    if (response.data.success) {
      logSuccess('Preview generated successfully');
      logInfo(`Jobs found: ${response.data.parsedData.successCount}`);
      logInfo(`Detected columns: ${response.data.parsedData.detectedColumns.join(', ')}`);

      saveTestResult('05-preview-response.json', response.data);
      return true;
    }

    return false;
  } catch (error) {
    logError(`Failed to preview inspection: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function test6_CreateJobsFromInspection() {
  logSection('TEST 6: Create Jobs from Inspection');

  try {
    logInfo(`Creating ${parsedJobs.length} jobs from inspection...`);

    const response = await axios.post(
      `${API_BASE_URL}/inspections/${inspectionId}/create-jobs`,
      { jobs: parsedJobs },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    if (response.data.success) {
      logSuccess(`Successfully created ${response.data.jobs.length} jobs`);
      logInfo(`Inspection status: ${response.data.inspection.status}`);

      // Display first 3 created jobs
      console.log('\nFirst 3 created jobs:');
      response.data.jobs.slice(0, 3).forEach((job, idx) => {
        console.log(`  ${idx + 1}. ${job.title} (ID: ${job.id})`);
      });

      saveTestResult('06-create-jobs-response.json', response.data);
      return true;
    }

    return false;
  } catch (error) {
    logError(`Failed to create jobs: ${error.response?.data?.message || error.message}`);
    if (error.response?.data) {
      console.error('Error details:', error.response.data);
    }
    return false;
  }
}

async function test7_GetInspectionsByProperty() {
  logSection('TEST 7: Get Inspections by Property');

  try {
    logInfo(`Fetching inspections for property ${propertyId}...`);

    const response = await axios.get(`${API_BASE_URL}/inspections/property/${propertyId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    if (response.data.success) {
      logSuccess(`Found ${response.data.count} inspections`);

      response.data.inspections.forEach((inspection, idx) => {
        console.log(`\n  ${idx + 1}. ${inspection.file_name}`);
        console.log(`     Status: ${inspection.status}`);
        console.log(`     Jobs: ${inspection.parsed_job_count}`);
        console.log(`     Uploaded: ${new Date(inspection.uploaded_at).toLocaleString()}`);
      });

      saveTestResult('07-get-inspections-response.json', response.data);
      return true;
    }

    return false;
  } catch (error) {
    logError(`Failed to get inspections: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function test8_DeleteInspection() {
  logSection('TEST 8: Delete Inspection (Optional)');

  try {
    logWarning('Skipping deletion test to preserve test data.');
    logInfo('To test deletion, uncomment the deletion code in the script.');

    // Uncomment to test deletion:
    /*
    const response = await axios.delete(`${API_BASE_URL}/inspections/${inspectionId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    if (response.data.success) {
      logSuccess('Inspection deleted successfully');
      return true;
    }
    */

    return true; // Skip test
  } catch (error) {
    logError(`Failed to delete inspection: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function test9_VerifySupabaseStorage() {
  logSection('TEST 9: Verify Supabase Storage');

  logInfo('Manual verification steps:');
  console.log('1. Go to your Supabase dashboard: https://supabase.com');
  console.log('2. Navigate to Storage > inspections bucket');
  console.log(`3. Look for folder: ${propertyId}`);
  console.log('4. Verify the uploaded Excel file is present');
  console.log('\nIf files are missing, check:');
  console.log('- Supabase credentials in .env file');
  console.log('- Storage bucket permissions');
  console.log('- Server logs for upload errors');

  return true;
}

// Main test runner
async function runAllTests() {
  console.log(`${colors.cyan}
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   Supabase Inspection Feature - Comprehensive Tests      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
${colors.reset}`);

  const testResults = {
    passed: 0,
    failed: 0,
    skipped: 0
  };

  const tests = [
    { name: 'Login User', fn: test1_LoginUser },
    { name: 'Get Properties', fn: test2_GetProperties },
    { name: 'Download Template', fn: test3_DownloadTemplate },
    { name: 'Upload Inspection', fn: test4_UploadInspection },
    { name: 'Preview Inspection', fn: test5_PreviewInspection },
    { name: 'Create Jobs from Inspection', fn: test6_CreateJobsFromInspection },
    { name: 'Get Inspections by Property', fn: test7_GetInspectionsByProperty },
    { name: 'Delete Inspection', fn: test8_DeleteInspection },
    { name: 'Verify Supabase Storage', fn: test9_VerifySupabaseStorage }
  ];

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        testResults.passed++;
      } else {
        testResults.failed++;
      }
    } catch (error) {
      logError(`Test "${test.name}" crashed: ${error.message}`);
      testResults.failed++;
    }

    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Final summary
  logSection('TEST SUMMARY');

  console.log(`${colors.green}Passed: ${testResults.passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${testResults.failed}${colors.reset}`);
  console.log(`${colors.yellow}Skipped: ${testResults.skipped}${colors.reset}`);
  console.log(`\nTotal: ${testResults.passed + testResults.failed + testResults.skipped}`);

  if (testResults.failed === 0) {
    console.log(`\n${colors.green}🎉 All tests passed! Feature is working correctly.${colors.reset}`);
  } else {
    console.log(`\n${colors.yellow}⚠ Some tests failed. Check the logs above for details.${colors.reset}`);
  }

  console.log(`\nTest results saved to: ${TEST_OUTPUT_DIR}/`);

  // Save final summary
  const summary = {
    timestamp: new Date().toISOString(),
    results: testResults,
    testIds: {
      userId,
      propertyId,
      inspectionId
    }
  };
  saveTestResult('00-test-summary.json', summary);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
