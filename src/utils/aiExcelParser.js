import * as XLSX from 'xlsx';
import anthropic from '../config/claude.js';
import { parseInspectionExcel, parseMaintenanceExcel } from './excelParser.js';

const VALID_CATEGORIES = [
  'Plumbing', 'Electrical', 'HVAC', 'Carpentry', 'Painting', 'Roofing',
  'Flooring', 'Masonry', 'Landscaping', 'General Repair', 'Demolition',
  'Insulation', 'Drywall', 'Windows/Doors', 'Appliances', 'Other',
];

const VALID_URGENCIES = ['Low', 'Medium', 'High', 'Critical'];

const BATCH_SIZE = 20;

const SYSTEM_PROMPT = `You are a construction job data extractor. You receive raw spreadsheet data from inspection reports and maintenance plans. The data can be in ANY language (French, English, Spanish, etc.) and ANY column format.

Your task: extract construction/maintenance jobs from this data and return structured JSON.

RULES:
1. Each row typically represents one job/task.
2. For each job, extract these fields:
   - title (string, REQUIRED): The job title or work description. Max 255 chars. If no explicit title column exists, generate a concise title from component name + work type.
   - description (string): Detailed description of the work. Combine all relevant detail columns.
   - category (string): Must be EXACTLY one of: Plumbing, Electrical, HVAC, Carpentry, Painting, Roofing, Flooring, Masonry, Landscaping, General Repair, Demolition, Insulation, Drywall, Windows/Doors, Appliances, Other. Infer from context (component names, uniformat codes, work descriptions).
   - urgency (string): Must be EXACTLY one of: Low, Medium, High, Critical. Infer from priority/urgency fields or work type (e.g., "emergency"=Critical, "replacement"=High, "planned maintenance"=Low, "routine"=Medium).
   - budget (number or null): The estimated cost/budget as a plain number. CRITICAL: Only extract if there is an explicit numeric cost/budget/price value in the row. NEVER guess or estimate a budget. If no budget column exists or the value is empty/zero, return null.
   - location (string or null): Building area, unit, room, zone, floor.
   - dueDate (string or null): ISO 8601 date (YYYY-MM-DD). If only a year is given, use YYYY-12-31.
   - notes (string or null): Any additional info, component codes, references.
   - sourceRow (number): The row number from the spreadsheet (use the startRowNumber + index).

3. Skip rows that are clearly headers, subtotals, totals, section separators, or empty.
4. If a row has no meaningful data for a job title, skip it.
5. Currency symbols and formatting should be stripped from budget values — return only the numeric amount.

6. If the spreadsheet data is clearly NOT related to construction, maintenance, inspection, or repair work (e.g., a grocery list, student grades, financial statements, personal data), return:
   {"jobs":[],"fieldMapping":{},"rejected":true,"rejectionReason":"Brief explanation of why this is not construction/job data"}

Respond with ONLY a valid JSON object (no markdown, no explanation) in this exact format:
{"jobs":[...],"fieldMapping":{"Original Column Name":"mapped_field_name"}}`;

/**
 * Parse an Excel file using Claude AI to extract job data.
 * Falls back to hardcoded parsers if the AI call fails.
 *
 * @param {Buffer} fileBuffer - The Excel file buffer from multer
 * @param {Function} [onProgress] - Optional callback for progress updates
 * @returns {Promise<object>} Parsed result with jobs array
 */
export const parseExcelWithAI = async (fileBuffer, onProgress) => {
  try {
    // Step 1: Read Excel with XLSX
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (rawData.length === 0) {
      return {
        success: false,
        error: 'Excel file is empty or has no data rows',
        jobs: [],
        totalRows: 0,
        successCount: 0,
        errorCount: 0,
      };
    }

    const headers = Object.keys(rawData[0]);
    const totalBatches = Math.ceil(rawData.length / BATCH_SIZE);
    console.log(`[AI Excel Parser] Processing ${rawData.length} rows (${totalBatches} batches) with columns: ${headers.join(', ')}`);

    if (onProgress) {
      onProgress({ stage: 'reading', totalRows: rawData.length, totalBatches, message: `Found ${rawData.length} rows to process` });
    }

    // Step 2: Batch rows and call Claude AI
    const allJobs = [];
    const allErrors = [];
    let fieldMapping = {};

    for (let i = 0; i < rawData.length; i += BATCH_SIZE) {
      const batch = rawData.slice(i, i + BATCH_SIZE);
      const batchStartRow = i + 2; // Excel is 1-indexed + header row
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      if (onProgress) {
        onProgress({
          stage: 'extracting',
          currentBatch: batchNumber,
          totalBatches,
          rowsProcessed: i,
          totalRows: rawData.length,
          message: `Analyzing batch ${batchNumber} of ${totalBatches}...`,
        });
      }

      const userMessage = JSON.stringify({
        columns: headers,
        rows: batch,
        startRowNumber: batchStartRow,
      });

      console.log(`[AI Excel Parser] Sending batch ${batchNumber} (rows ${batchStartRow}-${batchStartRow + batch.length - 1}) to Claude...`);

      let response;
      try {
        response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        });
      } catch (apiError) {
        console.error(`[AI Excel Parser] Claude API error: ${apiError.status || ''} ${apiError.message}`);
        throw apiError;
      }

      // Extract text content
      const responseText = response.content[0].text;

      // Parse JSON from response (handle possible markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[AI Excel Parser] AI returned non-JSON response:', responseText.substring(0, 200));
        throw new Error('AI returned invalid response format');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Check if AI rejected the file as non-construction data
      if (parsed.rejected) {
        console.log(`[AI Excel Parser] File rejected: ${parsed.rejectionReason}`);
        return {
          success: false,
          error: parsed.rejectionReason || 'This file does not appear to contain construction or maintenance job data.',
          jobs: [],
          totalRows: rawData.length,
          successCount: 0,
          errorCount: 0,
          detectedColumns: headers,
          fieldMapping: {},
        };
      }

      if (parsed.fieldMapping) {
        fieldMapping = { ...fieldMapping, ...parsed.fieldMapping };
      }

      // Validate each job from AI response
      for (const job of (parsed.jobs || [])) {
        const validated = validateJob(job, batchStartRow);
        if (validated.valid) {
          allJobs.push(validated.job);
        } else {
          allErrors.push(validated.error);
        }
      }

      if (onProgress) {
        onProgress({
          stage: 'extracting',
          currentBatch: batchNumber,
          totalBatches,
          rowsProcessed: Math.min(i + BATCH_SIZE, rawData.length),
          totalRows: rawData.length,
          jobsFound: allJobs.length,
          message: `Processed batch ${batchNumber} of ${totalBatches} (${allJobs.length} jobs found)`,
        });
      }
    }

    console.log(`[AI Excel Parser] ✓ Extracted ${allJobs.length} jobs (${allErrors.length} errors)`);

    return {
      success: true,
      jobs: allJobs,
      totalRows: rawData.length,
      successCount: allJobs.length,
      errorCount: allErrors.length,
      errors: allErrors.length > 0 ? allErrors : undefined,
      detectedColumns: headers,
      fieldMapping,
    };
  } catch (error) {
    console.error('[AI Excel Parser] Error:', error.message);
    console.log('[AI Excel Parser] Falling back to hardcoded parser...');
    return fallbackParse(fileBuffer);
  }
};

/**
 * Validate and sanitize a single job object from AI response
 */
function validateJob(job, batchStartRow) {
  if (!job.title || job.title.toString().trim() === '') {
    return {
      valid: false,
      error: {
        row: job.sourceRow || batchStartRow,
        error: 'Missing title',
        data: job,
      },
    };
  }

  const budgetValue = (typeof job.budget === 'number' && !isNaN(job.budget) && job.budget > 0) ? job.budget : null;

  return {
    valid: true,
    job: {
      title: job.title.toString().trim().substring(0, 255),
      description: job.description || '',
      category: VALID_CATEGORIES.includes(job.category) ? job.category : 'Other',
      urgency: VALID_URGENCIES.includes(job.urgency) ? job.urgency : 'Medium',
      budget: budgetValue,
      budget_min: budgetValue,
      budget_max: budgetValue,
      location: job.location || null,
      dueDate: job.dueDate || null,
      notes: job.notes || null,
      sourceRow: job.sourceRow || batchStartRow,
    },
  };
}

/**
 * Fallback to hardcoded parsers when AI fails
 */
function fallbackParse(fileBuffer) {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet);
    const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
    const headerStr = headers.join('|').toLowerCase();

    const isMaintenanceTemplate =
      headerStr.includes('uniformat') ||
      headerStr.includes('composant') ||
      headerStr.includes('type de travaux') ||
      headerStr.includes('component') ||
      headerStr.includes('élément') ||
      headerStr.includes('ouvrage');

    console.log(`[AI Excel Parser] Fallback using ${isMaintenanceTemplate ? 'maintenance' : 'standard'} parser`);

    return isMaintenanceTemplate
      ? parseMaintenanceExcel(fileBuffer)
      : parseInspectionExcel(fileBuffer);
  } catch (fallbackError) {
    console.error('[AI Excel Parser] Fallback parser also failed:', fallbackError.message);
    return {
      success: false,
      error: `AI parsing failed and fallback parser also failed: ${fallbackError.message}`,
      jobs: [],
      totalRows: 0,
      successCount: 0,
      errorCount: 0,
    };
  }
}
