/**
 * Column Mapping for Maintenance Plan Excel Templates
 * Supports multiple languages and custom formats
 */

export const maintenanceColumnMapping = {
  // Title/Job Name
  title: [
    'title',
    'job title',
    'titre',
    'tâche',
    'task',
    'work title',
    'titre du travail'
  ],

  // Description
  description: [
    'description',
    'details',
    'détails',
    'notes',
    'work description',
    'description du travail'
  ],

  // Category/Component
  category: [
    'category',
    'type',
    'component',
    'composant',
    'uniformat code',
    'work type',
    'type of work',
    'type de travail'
  ],

  // Urgency/Priority
  urgency: [
    'urgency',
    'priority',
    'priorité',
    'urgence',
    'level',
    'niveau'
  ],

  // Budget/Cost
  budget: [
    'budget',
    'cost',
    'price',
    'coût',
    'prix',
    'current estimated cost',
    'future estimated cost',
    'estimated cost',
    'coût estimé',
    'current estimated cost after tax',
    'future estimated cost after tax'
  ],

  // Location/Area
  location: [
    'location',
    'area',
    'zone',
    'lieu',
    'emplacement',
    'room',
    'pièce',
    'unit',
    'unité'
  ],

  // Due Date/Deadline
  dueDate: [
    'due date',
    'deadline',
    'date',
    'date limite',
    'échéance',
    'completion date',
    'target date'
  ],

  // Additional fields for maintenance plans
  uniformatCode: [
    'uniformat code',
    'uniformat',
    'code uniformat',
    'code',
    'reference',
    'référence'
  ],

  component: [
    'component',
    'composant',
    'element',
    'élément',
    'building component',
    'composant du bâtiment'
  ],

  typeOfWork: [
    'type of work',
    'work type',
    'type de travail',
    'work category',
    'catégorie de travail'
  ]
};

/**
 * Type of Work to Urgency mapping
 * Maps maintenance work types to urgency levels
 */
export const workTypeToUrgency = {
  // Critical/Emergency
  'emergency': 'Critical',
  'urgence': 'Critical',
  'immediate': 'Critical',
  'immédiat': 'Critical',

  // High priority
  'major repair': 'High',
  'réparation majeure': 'High',
  'major replacement': 'High',
  'remplacement majeur': 'High',
  'replacement': 'High',
  'remplacement': 'High',

  // Medium priority
  'provision for major repair': 'Medium',
  'provision for replacement': 'Medium',
  'provision pour réparation majeure': 'Medium',
  'provision pour remplacement': 'Medium',
  'repair': 'Medium',
  'réparation': 'Medium',

  // Low priority
  'minor repair': 'Low',
  'réparation mineure': 'Low',
  'maintenance': 'Low',
  'entretien': 'Low',
  'inspection': 'Low'
};

/**
 * Component/Uniformat Code to Category mapping
 */
export const componentToCategory = {
  // Plumbing
  'plumbing': 'Plumbing',
  'plomberie': 'Plumbing',
  'd2091': 'Plumbing',
  'd20': 'Plumbing',
  'water': 'Plumbing',
  'eau': 'Plumbing',
  'drainage': 'Plumbing',
  'sanitaire': 'Plumbing',

  // Electrical
  'electrical': 'Electrical',
  'électrique': 'Electrical',
  'd50': 'Electrical',
  'd5010': 'Electrical',
  'd5020': 'Electrical',
  'lighting': 'Electrical',
  'éclairage': 'Electrical',

  // HVAC
  'hvac': 'HVAC',
  'heating': 'HVAC',
  'chauffage': 'HVAC',
  'ventilation': 'HVAC',
  'cooling': 'HVAC',
  'climatisation': 'HVAC',
  'd30': 'HVAC',

  // Structural/Foundation
  'foundation': 'Masonry',
  'fondation': 'Masonry',
  'concrete': 'Masonry',
  'béton': 'Masonry',
  'a10': 'Masonry',
  'a1010': 'Masonry',
  'structural': 'Masonry',
  'structure': 'Masonry',

  // Exterior/Cladding
  'exterior': 'General Repair',
  'extérieur': 'General Repair',
  'cladding': 'General Repair',
  'revêtement': 'General Repair',
  'b20': 'General Repair',
  'b2030': 'General Repair',
  'eifs': 'General Repair',

  // Windows/Doors
  'window': 'Windows/Doors',
  'fenêtre': 'Windows/Doors',
  'door': 'Windows/Doors',
  'porte': 'Windows/Doors',
  'b40': 'Windows/Doors',
  'b4090': 'Windows/Doors',
  'caulking': 'Windows/Doors',
  'calfeutrage': 'Windows/Doors',

  // Roofing
  'roof': 'Roofing',
  'toit': 'Roofing',
  'roofing': 'Roofing',
  'couverture': 'Roofing',
  'b30': 'Roofing',

  // Flooring
  'floor': 'Flooring',
  'plancher': 'Flooring',
  'flooring': 'Flooring',
  'c30': 'Flooring'
};

/**
 * Normalize field value for matching
 */
export function normalizeValue(value) {
  if (!value) return '';
  return value.toString().toLowerCase().trim();
}

/**
 * Find matching field from column mappings
 */
export function findMatchingField(columnName, mappings) {
  const normalized = normalizeValue(columnName);

  for (const [field, aliases] of Object.entries(mappings)) {
    if (aliases.some(alias => normalizeValue(alias) === normalized)) {
      return field;
    }
  }

  return null;
}

/**
 * Get urgency from type of work
 */
export function getUrgencyFromWorkType(typeOfWork) {
  const normalized = normalizeValue(typeOfWork);

  for (const [workType, urgency] of Object.entries(workTypeToUrgency)) {
    if (normalized.includes(workType)) {
      return urgency;
    }
  }

  return 'Medium'; // Default
}

/**
 * Get category from component or uniformat code
 */
export function getCategoryFromComponent(component, uniformatCode = '') {
  const normalized = normalizeValue(component + ' ' + uniformatCode);

  for (const [key, category] of Object.entries(componentToCategory)) {
    if (normalized.includes(key)) {
      return category;
    }
  }

  return 'General Repair'; // Default
}

export default {
  maintenanceColumnMapping,
  workTypeToUrgency,
  componentToCategory,
  normalizeValue,
  findMatchingField,
  getUrgencyFromWorkType,
  getCategoryFromComponent
};
