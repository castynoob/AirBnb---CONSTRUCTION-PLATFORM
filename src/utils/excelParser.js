import * as XLSX from 'xlsx';

/**
 * Excel Parsing Utilities for Inspection Reports
 *
 * Parses Excel files uploaded by property managers containing job/inspection data
 * and converts them into format suitable for bulk job creation.
 */

/**
 * Expected Excel column mappings
 * Supports both English and translated column names
 */
const COLUMN_MAPPINGS = {
  title: ['title', 'job title', 'job_title', 'task', 'work item', 'item'],
  description: ['description', 'details', 'scope', 'work description', 'notes'],
  category: ['category', 'type', 'work type', 'trade', 'discipline'],
  urgency: ['urgency', 'priority', 'importance', 'critical'],
  budget: ['budget', 'cost', 'estimate', 'price', 'amount'],
  location: ['location', 'area', 'room', 'unit', 'space', 'floor'],
  dueDate: ['due date', 'due_date', 'deadline', 'completion date', 'target date'],
  notes: ['notes', 'additional notes', 'comments', 'remarks'],
};

/**
 * Valid job categories
 */
const VALID_CATEGORIES = [
  'Plumbing',
  'Electrical',
  'HVAC',
  'Carpentry',
  'Painting',
  'Roofing',
  'Flooring',
  'Masonry',
  'Landscaping',
  'General Repair',
  'Demolition',
  'Insulation',
  'Drywall',
  'Windows/Doors',
  'Appliances',
  'Other',
];

/**
 * Valid urgency levels
 */
const VALID_URGENCIES = ['Low', 'Medium', 'High', 'Critical'];

/**
 * Normalize column name (remove spaces, lowercase, special chars)
 * @param {string} name - Column name from Excel
 * @returns {string} Normalized name
 */
const normalizeColumnName = (name) => {
  if (!name) return '';
  return name
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Map Excel column to our standard field
 * @param {string} columnName - Column name from Excel
 * @returns {string|null} Mapped field name or null
 */
const mapColumnToField = (columnName) => {
  const normalized = normalizeColumnName(columnName);

  for (const [field, variations] of Object.entries(COLUMN_MAPPINGS)) {
    if (variations.some((v) => normalizeColumnName(v) === normalized)) {
      return field;
    }
  }

  return null;
};

/**
 * Parse urgency value and normalize to standard levels
 * @param {string|number} value - Urgency value from Excel
 * @returns {string} Normalized urgency level
 */
const parseUrgency = (value) => {
  if (!value) return 'Medium';

  const str = value.toString().toLowerCase().trim();

  if (str.includes('critical') || str.includes('emergency') || str === '4') {
    return 'Critical';
  }
  if (str.includes('high') || str === '3') {
    return 'High';
  }
  if (str.includes('low') || str === '1') {
    return 'Low';
  }

  return 'Medium'; // Default
};

/**
 * Parse budget value and extract number
 * @param {string|number} value - Budget value from Excel
 * @returns {number|null} Budget as number or null
 */
const parseBudget = (value) => {
  if (!value) return null;

  // If already a number
  if (typeof value === 'number') {
    return value;
  }

  // Remove currency symbols and parse
  const cleaned = value.toString().replace(/[$,\s]/g, '');
  const parsed = parseFloat(cleaned);

  return isNaN(parsed) ? null : parsed;
};

/**
 * Parse category and validate against allowed categories
 * @param {string} value - Category from Excel
 * @returns {string} Valid category or 'Other'
 */
const parseCategory = (value) => {
  if (!value) return 'Other';

  const str = value.toString().trim();

  // Find matching category (case-insensitive)
  const match = VALID_CATEGORIES.find(
    (cat) => cat.toLowerCase() === str.toLowerCase()
  );

  return match || 'Other';
};

/**
 * Parse date from Excel
 * @param {any} value - Date value from Excel
 * @returns {Date|null} Parsed date or null
 */
const parseDate = (value) => {
  if (!value) return null;

  try {
    // Excel stores dates as numbers (days since 1900-01-01)
    if (typeof value === 'number') {
      const excelEpoch = new Date(1900, 0, 1);
      const days = value - 2; // Excel has a bug with leap year 1900
      return new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
    }

    // Try to parse as string
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
};

/**
 * Parse inspection Excel file and extract job data
 *
 * @param {Buffer} fileBuffer - Excel file buffer from multer
 * @returns {Object} Parsed data with jobs array and errors
 */
export const parseInspectionExcel = (fileBuffer) => {
  try {
    // Read Excel file
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    // Get first worksheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (rawData.length === 0) {
      return {
        success: false,
        error: 'Excel file is empty',
        jobs: [],
      };
    }

    // Get headers and map to our fields
    const headers = Object.keys(rawData[0]);
    const fieldMapping = {};

    headers.forEach((header) => {
      const field = mapColumnToField(header);
      if (field) {
        fieldMapping[header] = field;
      }
    });

    // Parse rows into job objects
    const jobs = [];
    const errors = [];

    rawData.forEach((row, index) => {
      const rowNumber = index + 2; // +2 because Excel is 1-indexed and has header row

      try {
        // Map row data to our fields
        const mappedRow = {};
        for (const [excelCol, ourField] of Object.entries(fieldMapping)) {
          mappedRow[ourField] = row[excelCol];
        }

        // Validate required fields
        if (!mappedRow.title || mappedRow.title.toString().trim() === '') {
          errors.push({
            row: rowNumber,
            error: 'Missing title',
            data: row,
          });
          return;
        }

        // Parse and validate data
        const job = {
          title: mappedRow.title.toString().trim(),
          description: mappedRow.description
            ? mappedRow.description.toString().trim()
            : '',
          category: parseCategory(mappedRow.category),
          urgency: parseUrgency(mappedRow.urgency),
          budget: parseBudget(mappedRow.budget),
          location: mappedRow.location ? mappedRow.location.toString().trim() : null,
          dueDate: parseDate(mappedRow.dueDate),
          notes: mappedRow.notes ? mappedRow.notes.toString().trim() : null,
          sourceRow: rowNumber, // For reference
        };

        jobs.push(job);
      } catch (error) {
        errors.push({
          row: rowNumber,
          error: error.message,
          data: row,
        });
      }
    });

    return {
      success: true,
      jobs,
      totalRows: rawData.length,
      successCount: jobs.length,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      fieldMapping,
      detectedColumns: headers,
    };
  } catch (error) {
    console.error('[Excel Parser] Error:', error);
    return {
      success: false,
      error: error.message,
      jobs: [],
    };
  }
};

/**
 * Generate inspection Excel template for download
 * Property managers can use this as a starting point
 *
 * @returns {Buffer} Excel file buffer
 */
export const generateInspectionTemplate = () => {
  // Template data with example rows
  const templateData = [
    {
      'Job Title': 'Fix leaking faucet in Unit 101',
      Description: 'Kitchen faucet is dripping continuously, needs washer replacement',
      Category: 'Plumbing',
      Urgency: 'Medium',
      Budget: 150,
      Location: 'Unit 101 - Kitchen',
      'Due Date': new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      Notes: 'Tenant reported issue on Monday',
    },
    {
      'Job Title': 'Repaint common hallway',
      Description: 'Hallway walls need fresh coat of paint due to scuff marks',
      Category: 'Painting',
      Urgency: 'Low',
      Budget: 500,
      Location: '2nd Floor Hallway',
      'Due Date': new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
      Notes: 'Use off-white color code #F5F5DC',
    },
    {
      'Job Title': 'Emergency electrical outlet repair',
      Description: 'Outlet sparking in Unit 205, potential fire hazard',
      Category: 'Electrical',
      Urgency: 'Critical',
      Budget: 300,
      Location: 'Unit 205 - Living Room',
      'Due Date': new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // Tomorrow
      Notes: 'URGENT - Tenant evacuated for safety',
    },
  ];

  // Create workbook and worksheet
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(templateData);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 35 }, // Job Title
    { wch: 50 }, // Description
    { wch: 15 }, // Category
    { wch: 12 }, // Urgency
    { wch: 12 }, // Budget
    { wch: 25 }, // Location
    { wch: 15 }, // Due Date
    { wch: 40 }, // Notes
  ];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inspection Jobs');

  // Generate buffer
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  return buffer;
};

/**
 * Validate Excel structure before parsing
 * Checks if file has required columns
 *
 * @param {Buffer} fileBuffer - Excel file buffer
 * @returns {Object} Validation result
 */
export const validateExcelStructure = (fileBuffer) => {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (data.length === 0) {
      return {
        valid: false,
        error: 'Excel file is empty',
      };
    }

    const headers = Object.keys(data[0]);
    const mappedFields = headers
      .map(mapColumnToField)
      .filter((f) => f !== null);

    // Check if we have at least the title field
    const hasTitle = mappedFields.includes('title');

    if (!hasTitle) {
      return {
        valid: false,
        error: 'Could not find "Title" or "Job Title" column',
        detectedColumns: headers,
        suggestion: 'Please ensure your Excel file has a column named "Job Title" or "Title"',
      };
    }

    return {
      valid: true,
      detectedColumns: headers,
      mappedFields,
      rowCount: data.length,
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
    };
  }
};

/**
 * Get list of supported categories for frontend
 * @returns {Array<string>}
 */
export const getSupportedCategories = () => {
  return VALID_CATEGORIES;
};

/**
 * Get list of supported urgency levels for frontend
 * @returns {Array<string>}
 */
export const getSupportedUrgencies = () => {
  return VALID_URGENCIES;
};

/**
 * Parse Maintenance Plan Excel (supports multi-language)
 * Enhanced parser for maintenance templates with Component, Uniformat Code, etc.
 * @param {Buffer} fileBuffer - Excel file buffer
 * @returns {Object} Parse result with jobs array
 */
export const parseMaintenanceExcel = (fileBuffer) => {
  try {
    // Read workbook
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON (preserving headers)
    const rawData = XLSX.utils.sheet_to_json(worksheet);
    const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];

    console.log('[Excel Parser] Detected columns:', headers);

    // Enhanced field mapping for maintenance templates
    const enhancedMappings = {
      title: ['title', 'job title', 'titre', 'tâche', 'task'],
      description: ['description', 'details', 'détails', 'notes'],
      component: ['component', 'composant', 'element', 'élément'],
      uniformatCode: ['uniformat code', 'uniformat', 'code uniformat', 'code'],
      typeOfWork: ['type of work', 'work type', 'type de travail'],
      budget: ['budget', 'cost', 'current estimated cost', 'future estimated cost', 'coût estimé'],
      dueDate: ['due date', 'deadline', 'date', 'échéance'],
      location: ['location', 'area', 'zone', 'lieu', 'unit']
    };

    // Map columns
    const fieldMapping = {};
    headers.forEach((header) => {
      const normalized = normalizeColumnName(header);
      for (const [field, variations] of Object.entries(enhancedMappings)) {
        if (variations.some(v => normalizeColumnName(v) === normalized)) {
          fieldMapping[header] = field;
          break;
        }
      }
    });

    console.log('[Excel Parser] Field mapping:', fieldMapping);

    // Parse jobs
    const jobs = [];
    const errors = [];

    rawData.forEach((row, index) => {
      const rowNumber = index + 2;

      try {
        // Map row data
        const mappedRow = {};
        for (const [excelCol, ourField] of Object.entries(fieldMapping)) {
          mappedRow[ourField] = row[excelCol];
        }

        // Title is required
        if (!mappedRow.title || mappedRow.title.toString().trim() === '') {
          errors.push({
            row: rowNumber,
            error: 'Missing title',
            data: row
          });
          return;
        }

        // Determine category from component/uniformat code
        let category = 'General Repair';
        const componentText = (mappedRow.component || '').toString().toLowerCase();
        const uniformatText = (mappedRow.uniformatCode || '').toString().toLowerCase();
        const combinedText = componentText + ' ' + uniformatText;

        if (combinedText.includes('plumb') || combinedText.includes('d20') || combinedText.includes('water') || combinedText.includes('drain')) {
          category = 'Plumbing';
        } else if (combinedText.includes('electric') || combinedText.includes('d50') || combinedText.includes('light')) {
          category = 'Electrical';
        } else if (combinedText.includes('hvac') || combinedText.includes('heat') || combinedText.includes('d30')) {
          category = 'HVAC';
        } else if (combinedText.includes('foundation') || combinedText.includes('concrete') || combinedText.includes('a10')) {
          category = 'Masonry';
        } else if (combinedText.includes('roof') || combinedText.includes('b30')) {
          category = 'Roofing';
        } else if (combinedText.includes('window') || combinedText.includes('door') || combinedText.includes('b40')) {
          category = 'Windows/Doors';
        } else if (combinedText.includes('floor') || combinedText.includes('c30')) {
          category = 'Flooring';
        }

        // Determine urgency from type of work
        let urgency = 'Medium';
        const workType = (mappedRow.typeOfWork || '').toString().toLowerCase();

        if (workType.includes('emergency') || workType.includes('immediate') || workType.includes('urgence')) {
          urgency = 'Critical';
        } else if (workType.includes('major repair') || workType.includes('replacement') || workType.includes('réparation majeure')) {
          urgency = 'High';
        } else if (workType.includes('provision') || workType.includes('repair') || workType.includes('réparation')) {
          urgency = 'Medium';
        } else if (workType.includes('minor') || workType.includes('maintenance') || workType.includes('inspection')) {
          urgency = 'Low';
        }

        // Build job object
        const job = {
          title: mappedRow.title.toString().trim(),
          description: mappedRow.description ? mappedRow.description.toString().trim() : '',
          category: category,
          urgency: urgency,
          budget: parseBudget(mappedRow.budget),
          location: mappedRow.location ? mappedRow.location.toString().trim() : mappedRow.component || null,
          dueDate: parseDate(mappedRow.dueDate),
          notes: `Component: ${mappedRow.component || 'N/A'}\nUniformat Code: ${mappedRow.uniformatCode || 'N/A'}\nType of Work: ${mappedRow.typeOfWork || 'N/A'}`,
          sourceRow: rowNumber
        };

        jobs.push(job);
      } catch (error) {
        errors.push({
          row: rowNumber,
          error: error.message,
          data: row
        });
      }
    });

    return {
      totalRows: rawData.length,
      successCount: jobs.length,
      errorCount: errors.length,
      jobs,
      errors,
      detectedColumns: headers,
      fieldMapping
    };
  } catch (error) {
    console.error('[Excel Parser] Error:', error);
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
};

export default {
  parseInspectionExcel,
  parseMaintenanceExcel, // New function for maintenance templates
  generateInspectionTemplate,
  validateExcelStructure,
  getSupportedCategories,
  getSupportedUrgencies,
};
