import * as XLSX from 'xlsx';

/**
 * Excel Parsing Utilities for Inspection Reports
 *
 * Parses Excel files uploaded by property managers containing job/inspection data
 * and converts them into format suitable for bulk job creation.
 */

/**
 * Expected Excel column mappings
 * Supports both English and French column names
 */
const COLUMN_MAPPINGS = {
  title: [
    'title', 'job title', 'job_title', 'task', 'work item', 'item',
    // French
    'titre', 'tâche', 'travaux', 'description des travaux', 'intitulé', 'libellé'
  ],
  description: [
    'description', 'details', 'scope', 'work description', 'notes',
    // French
    'détails', 'détail', 'commentaires', 'observations', 'remarques'
  ],
  category: [
    'category', 'type', 'work type', 'trade', 'discipline',
    // French
    'catégorie', 'type de travaux', 'corps de métier', 'discipline'
  ],
  urgency: [
    'urgency', 'priority', 'importance', 'critical',
    // French
    'urgence', 'priorité', 'importance', 'criticité', 'niveau d\'urgence'
  ],
  budget: [
    'budget', 'cost', 'estimate', 'price', 'amount',
    // French
    'coût', 'cout', 'prix', 'montant', 'coût estimé', 'cout estime',
    'coût estimé actuel', 'coût estimé futur', 'estimation'
  ],
  location: [
    'location', 'area', 'room', 'unit', 'space', 'floor',
    // French
    'localisation', 'emplacement', 'lieu', 'zone', 'pièce', 'étage', 'unité', 'bâtiment'
  ],
  dueDate: [
    'due date', 'due_date', 'deadline', 'completion date', 'target date',
    // French
    'date', 'échéance', 'echeance', 'date limite', 'date prévue', 'date cible', 'année'
  ],
  notes: [
    'notes', 'additional notes', 'comments', 'remarks',
    // French
    'notes', 'commentaires', 'remarques', 'observations'
  ],
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
 * Normalize column name (remove spaces, lowercase, handle accents)
 * Supports French accented characters by converting to ASCII equivalents
 * @param {string} name - Column name from Excel
 * @returns {string} Normalized name
 */
const normalizeColumnName = (name) => {
  if (!name) return '';

  // Convert accented characters to ASCII equivalents
  const accentMap = {
    'à': 'a', 'â': 'a', 'ä': 'a', 'á': 'a',
    'è': 'e', 'ê': 'e', 'ë': 'e', 'é': 'e',
    'ì': 'i', 'î': 'i', 'ï': 'i', 'í': 'i',
    'ò': 'o', 'ô': 'o', 'ö': 'o', 'ó': 'o',
    'ù': 'u', 'û': 'u', 'ü': 'u', 'ú': 'u',
    'ç': 'c', 'ñ': 'n', 'œ': 'oe', 'æ': 'ae'
  };

  let normalized = name.toString().toLowerCase().trim();

  // Replace accented characters
  for (const [accent, replacement] of Object.entries(accentMap)) {
    normalized = normalized.replace(new RegExp(accent, 'g'), replacement);
  }

  // Remove special characters except letters and numbers, replace with spaces
  normalized = normalized
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
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
 * Supports English and French urgency terms
 * @param {string|number} value - Urgency value from Excel
 * @returns {string} Normalized urgency level
 */
const parseUrgency = (value) => {
  if (!value) return 'Medium';

  const str = value.toString().toLowerCase().trim();

  // Critical/Emergency (English + French)
  if (str.match(/critical|emergency|urgent|critique|urgence|immédiat|immediat|danger/)) {
    return 'Critical';
  }
  if (str === '4' || str === 'a' || str === '1' && str.includes('priorit')) {
    return 'Critical';
  }

  // High (English + French)
  if (str.match(/high|élevé|eleve|importante|majeur|remplacement/)) {
    return 'High';
  }
  if (str === '3' || str === 'b') {
    return 'High';
  }

  // Low (English + French)
  if (str.match(/low|faible|bas|mineur|entretien|maintenance|inspection/)) {
    return 'Low';
  }
  if (str === '1' || str === 'd') {
    return 'Low';
  }

  // Medium is default (English + French: moyen, normal, standard)
  return 'Medium';
};

/**
 * Parse budget value and extract number
 * Supports USD ($), EUR (€), and French number formats (space as thousands separator, comma as decimal)
 * @param {string|number} value - Budget value from Excel
 * @returns {number|null} Budget as number or null
 */
const parseBudget = (value) => {
  if (!value) return null;

  // If already a number
  if (typeof value === 'number') {
    return value;
  }

  let str = value.toString().trim();

  // Remove currency symbols (USD, EUR, CAD, etc.)
  str = str.replace(/[$€£¥CA$CAD$USD$EUR]/gi, '');

  // Detect French format: "1 234,56" (space = thousands, comma = decimal)
  // vs English format: "1,234.56" (comma = thousands, period = decimal)
  const hasFrenchFormat = /^\s*[\d\s]+,\d{1,2}\s*$/.test(str) || /\d\s\d{3}/.test(str);

  if (hasFrenchFormat) {
    // French format: replace spaces with nothing, comma with period
    str = str.replace(/\s/g, '').replace(',', '.');
  } else {
    // English format: remove commas and spaces
    str = str.replace(/[,\s]/g, '');
  }

  const parsed = parseFloat(str);
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
 * Supports French "Plan de maintien et Carnet d'entretien" format
 *
 * @param {string} language - 'en' for English, 'fr' for French (default: 'fr')
 * @returns {Buffer} Excel file buffer
 */
export const generateInspectionTemplate = (language = 'fr') => {
  if (language === 'fr') {
    // French Maintenance Plan Template - "Plan de maintien et Carnet d'entretien"
    const templateData = [
      {
        'Composante': 'Réseaux de distribution d\'eau domestique et de drainage sanitaire',
        'Type de travaux': 'Provision pour réparation majeure',
        'Titre': 'Réparation majeure d\'une partie des réseaux de plomberie',
        'Description': 'Les travaux, lorsque requis, consistent à remplacer les sections du réseau d\'eau, ou du réseau de drainage, dont les composantes sont désuètes. Pour les sections dissimulées dans des murs et plafonds, ces interventions peuvent être difficiles à mettre en œuvre puisqu\'elles nécessitent des ouvertures, des travaux de remise en état et de la finition.',
        'Coût actuel estimé': 627,
        'Coût futur estimé après taxes': 721,
      },
      {
        'Composante': 'Entrée électrique et distribution principale',
        'Type de travaux': 'Provision pour remplacement',
        'Titre': 'Remplacement de composants du réseau de distribution électrique',
        'Description': 'Les travaux, lorsque requis, consistent à remplacer les composantes endommagées ou désuètes.',
        'Coût actuel estimé': 870,
        'Coût futur estimé après taxes': 1000,
      },
      {
        'Composante': 'Toiture - Membrane multicouche',
        'Type de travaux': 'Provision pour réfection',
        'Titre': 'Réfection de la membrane de toiture',
        'Description': 'Les travaux consistent à retirer la membrane existante, vérifier l\'état du pontage et de l\'isolation, puis installer une nouvelle membrane multicouche conforme aux normes en vigueur.',
        'Coût actuel estimé': 15400,
        'Coût futur estimé après taxes': 17710,
      },
      {
        'Composante': 'Système de ventilation et climatisation (CVAC)',
        'Type de travaux': 'Entretien préventif',
        'Titre': 'Entretien annuel du système CVAC',
        'Description': 'Inspection et nettoyage des conduits, remplacement des filtres, vérification du fonctionnement des unités de chauffage et de climatisation, calibration des thermostats.',
        'Coût actuel estimé': 2300,
        'Coût futur estimé après taxes': 2645,
      },
      {
        'Composante': 'Revêtements de sol - Aires communes',
        'Type de travaux': 'Remplacement',
        'Titre': 'Remplacement des revêtements de sol dans les corridors',
        'Description': 'Retirer les revêtements de sol usés dans les corridors et le hall d\'entrée. Installer de nouveaux revêtements en vinyle de luxe résistant au trafic élevé.',
        'Coût actuel estimé': 12000,
        'Coût futur estimé après taxes': 13800,
      },
    ];

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateData);

    // Set column widths for French template
    worksheet['!cols'] = [
      { wch: 50 }, // Composante
      { wch: 30 }, // Type de travaux
      { wch: 50 }, // Titre
      { wch: 90 }, // Description
      { wch: 20 }, // Coût actuel estimé
      { wch: 28 }, // Coût futur estimé après taxes
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plan de maintien');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
  }

  // English template (original)
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
 * Checks if file has required columns or can derive title from other columns
 * Supports both English and French column names
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
    const headerStr = headers.join('|').toLowerCase();
    const mappedFields = headers
      .map(mapColumnToField)
      .filter((f) => f !== null);

    // Check if we have a title field
    const hasTitle = mappedFields.includes('title');

    // Check if this is a maintenance template (can derive title from component)
    const isMaintenanceTemplate =
      headerStr.includes('uniformat') ||
      headerStr.includes('component') ||
      headerStr.includes('composant') ||
      headerStr.includes('type of work') ||
      headerStr.includes('type de travaux') ||
      headerStr.includes('élément') ||
      headerStr.includes('element') ||
      headerStr.includes('ouvrage') ||
      headerStr.includes('intervention') ||
      headerStr.includes('plan de maintien') ||
      headerStr.includes('carnet d\'entretien');

    // For maintenance templates, we can derive title from other columns
    if (!hasTitle && !isMaintenanceTemplate) {
      return {
        valid: false,
        error: 'Could not find "Title" or "Job Title" column',
        detectedColumns: headers,
        suggestion: 'Please ensure your Excel file has a column named "Job Title", "Title", "Titre", or "Tâche"',
      };
    }

    return {
      valid: true,
      detectedColumns: headers,
      mappedFields,
      rowCount: data.length,
      isMaintenanceTemplate,
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
 * Supports French "Plan de maintien et Carnet d'entretien" format
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

    // Enhanced field mapping for maintenance templates (English + French)
    const enhancedMappings = {
      title: [
        'title', 'job title', 'task', 'work item', 'item',
        // French
        'titre', 'tâche', 'travaux', 'description des travaux', 'intitulé', 'libellé',
        'intervention', 'nature des travaux', 'désignation'
      ],
      description: [
        'description', 'details', 'notes', 'scope',
        // French
        'détails', 'détail', 'commentaires', 'observations', 'remarques', 'note'
      ],
      component: [
        'component', 'element', 'system', 'asset',
        // French
        'composant', 'composante', 'élément', 'element', 'système', 'systeme',
        'equipement', 'équipement', 'installation', 'ouvrage'
      ],
      uniformatCode: [
        'uniformat code', 'uniformat', 'code', 'classification',
        // French
        'code uniformat', 'code classification', 'no', 'numéro', 'numero', 'ref', 'référence'
      ],
      typeOfWork: [
        'type of work', 'work type', 'intervention type', 'action',
        // French
        'type de travail', 'type de travaux', 'type d\'intervention', 'nature',
        'type intervention', 'action requise', 'travaux requis'
      ],
      budget: [
        'budget', 'cost', 'estimate', 'price', 'amount',
        'current estimated cost', 'future estimated cost', 'total cost',
        // French
        'coût', 'cout', 'prix', 'montant', 'coût estimé', 'cout estime',
        'coût estimé actuel', 'coût estimé futur', 'estimation', 'valeur',
        'coût actuel', 'coût futur', 'budget prévu'
      ],
      dueDate: [
        'due date', 'deadline', 'date', 'year', 'target date',
        // French
        'échéance', 'echeance', 'date limite', 'date prévue', 'date cible',
        'année', 'annee', 'date intervention', 'période', 'periode'
      ],
      location: [
        'location', 'area', 'zone', 'unit', 'building', 'floor', 'room',
        // French
        'localisation', 'emplacement', 'lieu', 'zone', 'unité', 'unite',
        'bâtiment', 'batiment', 'étage', 'etage', 'pièce', 'piece', 'secteur'
      ],
      urgency: [
        'urgency', 'priority', 'importance', 'severity',
        // French
        'urgence', 'priorité', 'priorite', 'importance', 'criticité', 'criticite',
        'niveau d\'urgence', 'niveau priorité'
      ],
      quantity: [
        'quantity', 'qty', 'count', 'number',
        // French
        'quantité', 'quantite', 'qté', 'qte', 'nombre', 'unités'
      ]
    };

    // Map columns - check for partial matches too
    const fieldMapping = {};
    headers.forEach((header) => {
      const normalized = normalizeColumnName(header);
      for (const [field, variations] of Object.entries(enhancedMappings)) {
        // Check exact match first
        if (variations.some(v => normalizeColumnName(v) === normalized)) {
          fieldMapping[header] = field;
          break;
        }
        // Check if header contains any variation (for longer headers)
        if (variations.some(v => normalized.includes(normalizeColumnName(v)) || normalizeColumnName(v).includes(normalized))) {
          if (!fieldMapping[header]) {
            fieldMapping[header] = field;
          }
        }
      }
    });

    console.log('[Excel Parser] Field mapping:', fieldMapping);

    // If no title field found, try to use component or first text column as title
    const hasTitleField = Object.values(fieldMapping).includes('title');
    if (!hasTitleField) {
      // Use component as title if available
      if (Object.values(fieldMapping).includes('component')) {
        const componentHeader = Object.keys(fieldMapping).find(k => fieldMapping[k] === 'component');
        if (componentHeader) {
          // Find first unmapped column with text data to use as title
          const firstTextColumn = headers.find(h => !fieldMapping[h] && rawData.some(r => r[h] && typeof r[h] === 'string'));
          if (firstTextColumn) {
            fieldMapping[firstTextColumn] = 'title';
          } else {
            // Duplicate component as title
            fieldMapping[`__title_from_${componentHeader}`] = 'title';
          }
        }
      }
    }

    // Parse jobs
    const jobs = [];
    const errors = [];

    rawData.forEach((row, index) => {
      const rowNumber = index + 2;

      try {
        // Map row data
        const mappedRow = {};
        for (const [excelCol, ourField] of Object.entries(fieldMapping)) {
          if (excelCol.startsWith('__title_from_')) {
            // Special case: derive title from component
            const sourceCol = excelCol.replace('__title_from_', '');
            mappedRow[ourField] = row[sourceCol];
          } else {
            mappedRow[ourField] = row[excelCol];
          }
        }

        // Generate title from available data if not present
        let title = mappedRow.title;
        if (!title || title.toString().trim() === '') {
          // Try to generate title from component + type of work
          const parts = [];
          if (mappedRow.component) parts.push(mappedRow.component.toString().trim());
          if (mappedRow.typeOfWork) parts.push(mappedRow.typeOfWork.toString().trim());
          if (mappedRow.description) parts.push(mappedRow.description.toString().trim());

          title = parts.join(' - ') || null;
        }

        // Skip if still no title
        if (!title || title.toString().trim() === '') {
          errors.push({
            row: rowNumber,
            error: 'Missing title - could not generate from available data',
            data: row
          });
          return;
        }

        // Determine category from component/uniformat code (English + French)
        let category = 'General Repair';
        const componentText = (mappedRow.component || '').toString().toLowerCase();
        const uniformatText = (mappedRow.uniformatCode || '').toString().toLowerCase();
        const titleText = (title || '').toString().toLowerCase();
        const combinedText = componentText + ' ' + uniformatText + ' ' + titleText;

        // Category detection with French support
        if (combinedText.match(/plumb|d20|water|drain|tuyau|plomberie|eau|égout|robinet|chauffe-eau|sanitaire/)) {
          category = 'Plumbing';
        } else if (combinedText.match(/electr|d50|light|éclairage|eclairage|lumière|panneau|câbl|cabl|prise|volt/)) {
          category = 'Electrical';
        } else if (combinedText.match(/hvac|heat|cool|ventil|d30|chauffage|climatisation|thermostat|chaudière|chaudiere|cvc/)) {
          category = 'HVAC';
        } else if (combinedText.match(/foundation|concrete|a10|fondation|béton|beton|maçon|macon|pierre|brique/)) {
          category = 'Masonry';
        } else if (combinedText.match(/roof|b30|toiture|toit|couverture|gouttière|gouttiere|bardeaux/)) {
          category = 'Roofing';
        } else if (combinedText.match(/window|door|b40|fenêtre|fenetre|porte|vitrage|vitre|chassis/)) {
          category = 'Windows/Doors';
        } else if (combinedText.match(/floor|c30|plancher|sol|parquet|carrelage|revêtement|revetement|moquette/)) {
          category = 'Flooring';
        } else if (combinedText.match(/paint|peinture|revêtement mural|finition|enduit/)) {
          category = 'Painting';
        } else if (combinedText.match(/landscap|aménag|terrain|jardin|extérieur|exterieur|stationnement|asphalte/)) {
          category = 'Landscaping';
        } else if (combinedText.match(/insul|isolat|isolation|calorifuge/)) {
          category = 'Insulation';
        } else if (combinedText.match(/drywall|gypse|plâtre|platre|cloison/)) {
          category = 'Drywall';
        } else if (combinedText.match(/applian|appareil|électroménager|electromenager/)) {
          category = 'Appliances';
        } else if (combinedText.match(/carpent|menuiserie|bois|charpente|armoire|cabinet/)) {
          category = 'Carpentry';
        }

        // Determine urgency from type of work and priority field (English + French)
        let urgency = 'Medium';
        const workType = (mappedRow.typeOfWork || '').toString().toLowerCase();
        const priorityText = (mappedRow.urgency || '').toString().toLowerCase();
        const urgencyText = workType + ' ' + priorityText;

        if (urgencyText.match(/emergency|immediate|critical|urgence immédiate|urgent|critique|danger|sécurité/)) {
          urgency = 'Critical';
        } else if (urgencyText.match(/major repair|replacement|high|réparation majeure|remplacement|élevé|eleve|importante/)) {
          urgency = 'High';
        } else if (urgencyText.match(/provision|repair|medium|réparation|moyen|normale|standard/)) {
          urgency = 'Medium';
        } else if (urgencyText.match(/minor|maintenance|inspection|low|mineur|entretien|faible|bas/)) {
          urgency = 'Low';
        }

        // Parse budget - try multiple columns
        let budget = parseBudget(mappedRow.budget);
        if (!budget) {
          // Check for any column with cost/budget in name
          for (const [col, val] of Object.entries(row)) {
            const colLower = col.toLowerCase();
            if ((colLower.includes('cost') || colLower.includes('coût') || colLower.includes('budget') || colLower.includes('prix')) && val) {
              const parsed = parseBudget(val);
              if (parsed && parsed > budget) {
                budget = parsed;
              }
            }
          }
        }

        // Parse due date - handle year-only values
        let dueDate = parseDate(mappedRow.dueDate);
        if (!dueDate && mappedRow.dueDate) {
          // Try to parse as year only
          const yearMatch = mappedRow.dueDate.toString().match(/20\d{2}/);
          if (yearMatch) {
            dueDate = new Date(parseInt(yearMatch[0]), 11, 31); // End of year
          }
        }

        // Build job object
        const job = {
          title: title.toString().trim().substring(0, 255), // Limit title length
          description: mappedRow.description ? mappedRow.description.toString().trim() : '',
          category: category,
          urgency: urgency,
          budget: budget,
          location: mappedRow.location ? mappedRow.location.toString().trim() : (mappedRow.component || null),
          dueDate: dueDate,
          notes: `Component: ${mappedRow.component || 'N/A'}\nUniformat Code: ${mappedRow.uniformatCode || 'N/A'}\nType of Work: ${mappedRow.typeOfWork || 'N/A'}`,
          sourceRow: rowNumber,
          // Keep raw data for reference
          rawData: row
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
      success: true,
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
    return {
      success: false,
      error: `Failed to parse Excel file: ${error.message}`,
      jobs: [],
      totalRows: 0,
      successCount: 0,
      errorCount: 0
    };
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
