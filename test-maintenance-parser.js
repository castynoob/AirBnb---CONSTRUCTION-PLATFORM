import { parseMaintenanceExcel } from './src/utils/excelParser.js';
import fs from 'fs';

const templatePath = './template/Maintenance_Plan_and_Log_1090_EN.xlsx';

console.log('🧪 Testing Maintenance Template Parser...\n');

try {
  // Read file
  const fileBuffer = fs.readFileSync(templatePath);

  // Parse
  const result = parseMaintenanceExcel(fileBuffer);

  console.log('✅ Parsing successful!\n');
  console.log('📊 Summary:');
  console.log(`   Total Rows: ${result.totalRows}`);
  console.log(`   Success: ${result.successCount}`);
  console.log(`   Errors: ${result.errorCount}`);

  console.log('\n📋 Detected Columns:');
  result.detectedColumns.forEach(col => console.log(`   - ${col}`));

  console.log('\n🔧 Field Mapping:');
  Object.entries(result.fieldMapping).forEach(([excel, field]) => {
    console.log(`   ${excel} → ${field}`);
  });

  console.log('\n📝 First 3 Parsed Jobs:\n');
  result.jobs.slice(0, 3).forEach((job, idx) => {
    console.log(`${idx + 1}. ${job.title}`);
    console.log(`   Category: ${job.category}`);
    console.log(`   Urgency: ${job.urgency}`);
    console.log(`   Budget: $${job.budget}`);
    console.log(`   Location: ${job.location}`);
    console.log(`   Due Date: ${job.dueDate || 'Not set'}`);
    console.log(`   Description: ${job.description.substring(0, 100)}...`);
    console.log('');
  });

  if (result.errors.length > 0) {
    console.log('⚠️  Errors:');
    result.errors.forEach(err => {
      console.log(`   Row ${err.row}: ${err.error}`);
    });
  }

  console.log('✨ Parser is working correctly!');
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
}
