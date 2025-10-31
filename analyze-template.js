import xlsx from 'xlsx';
import fs from 'fs';

const templatePath = './template/Maintenance_Plan_and_Log_1090_EN.xlsx';

console.log('📊 Analyzing Excel Template...\n');

// Read the Excel file
const workbook = xlsx.readFile(templatePath);

// Get first sheet
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

console.log(`Sheet Name: ${sheetName}\n`);

// Convert to JSON
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

// Get headers (first row)
const headers = data[0];

console.log('📋 Columns Found:');
console.log('================');
headers.forEach((header, idx) => {
  console.log(`${idx + 1}. "${header}"`);
});

console.log('\n📝 Sample Data (First 5 Rows):');
console.log('===============================');

// Show first 5 data rows
for (let i = 1; i <= Math.min(5, data.length - 1); i++) {
  console.log(`\nRow ${i}:`);
  const row = data[i];
  headers.forEach((header, idx) => {
    if (row[idx]) {
      console.log(`  ${header}: ${row[idx]}`);
    }
  });
}

// Detect data types
console.log('\n🔍 Column Analysis:');
console.log('===================');
headers.forEach((header, idx) => {
  const values = data.slice(1, 6).map(row => row[idx]).filter(v => v !== undefined && v !== null && v !== '');
  const types = values.map(v => typeof v);
  const uniqueTypes = [...new Set(types)];

  console.log(`\n${header}:`);
  console.log(`  - Sample values: ${values.slice(0, 3).join(', ')}`);
  console.log(`  - Data type: ${uniqueTypes.join(', ')}`);
  console.log(`  - Has data: ${values.length > 0 ? 'Yes' : 'No'}`);
});

// Count rows
console.log(`\n📊 Total Rows: ${data.length - 1} (excluding header)`);
console.log(`📊 Total Columns: ${headers.length}`);

// Save analysis to JSON
const analysis = {
  fileName: 'Maintenance_Plan_and_Log_1090_EN.xlsx',
  sheetName,
  totalRows: data.length - 1,
  totalColumns: headers.length,
  columns: headers.map((header, idx) => {
    const values = data.slice(1, 6).map(row => row[idx]).filter(v => v !== undefined && v !== null && v !== '');
    return {
      index: idx,
      name: header,
      sampleValues: values.slice(0, 3),
      dataType: typeof values[0],
      hasData: values.length > 0
    };
  }),
  sampleRows: data.slice(1, 4)
};

fs.writeFileSync('./template-analysis.json', JSON.stringify(analysis, null, 2));
console.log('\n✅ Analysis saved to template-analysis.json');
