// src/models/propertyModel.js
import pool from "../config/db.js";

// 🟢 Create a new property
export const createProperty = async ({
  manager_id,
  address,
  city,
  province = null,
  postal_code = null,
  num_units = 0,
  building_type = "Apartment",
  building_name = null,
  latitude = null,
  longitude = null,
}) => {
  // Count: 10 columns, 10 values
  const result = await pool.query(
    `INSERT INTO properties (
      manager_id,
      address,
      city,
      province,
      postal_code,
      num_units,
      building_type,
      building_name,
      latitude,
      longitude
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      manager_id,      // $1
      address,         // $2
      city,            // $3
      province,        // $4
      postal_code,     // $5
      num_units,       // $6
      building_type,   // $7
      building_name,   // $8
      latitude,        // $9
      longitude,       // $10
    ]
  );

  return result.rows[0];
};

// 🟡 Get all properties by manager
export const getPropertiesByManagerId = async (manager_id) => {
  const result = await pool.query(
    `SELECT * FROM properties WHERE manager_id = $1 ORDER BY created_at DESC`,
    [manager_id]
  );
  return result.rows;
};

// 🔵 Get property by ID
export const getPropertyById = async (id) => {
  const result = await pool.query(
    `SELECT * FROM properties WHERE id = $1`,
    [id]
  );
  return result.rows[0];
};

// 🟣 Get property with statistics
export const getPropertyWithStats = async (id) => {
  const result = await pool.query(
    `SELECT 
      p.*,
      COUNT(DISTINCT j.id) as total_jobs,
      COUNT(DISTINCT CASE WHEN j.status = 'Open' THEN j.id END) as open_jobs,
      COUNT(DISTINCT CASE WHEN j.status = 'In Progress' THEN j.id END) as in_progress_jobs,
      COUNT(DISTINCT CASE WHEN j.status = 'Completed' THEN j.id END) as completed_jobs
    FROM properties p
    LEFT JOIN jobs j ON p.id = j.property_id
    WHERE p.id = $1
    GROUP BY p.id`,
    [id]
  );
  return result.rows[0];
};

// 🟠 Update property
export const updateProperty = async (id, fields) => {
  const keys = Object.keys(fields);
  if (keys.length === 0) return null;

  // Prevent updating protected fields
  const allowedFields = [
    "address",
    "city",
    "province",
    "postal_code",
    "num_units",
    "building_type",
    "building_name",
    "latitude",
    "longitude",
  ];

  const filteredFields = {};
  keys.forEach((key) => {
    if (allowedFields.includes(key)) {
      filteredFields[key] = fields[key];
    }
  });

  const filteredKeys = Object.keys(filteredFields);
  if (filteredKeys.length === 0) return null;

  const setQuery = filteredKeys
    .map((key, idx) => `${key} = $${idx + 2}`)
    .join(", ");
  const values = [id, ...Object.values(filteredFields)];

  const result = await pool.query(
    `UPDATE properties SET ${setQuery} WHERE id = $1 RETURNING *`,
    values
  );

  return result.rows[0];
};

// 🔴 Delete property (with job check)
export const deleteProperty = async (id) => {
  // First check if property has any jobs
  const jobCheck = await pool.query(
    `SELECT COUNT(*) as job_count FROM jobs WHERE property_id = $1`,
    [id]
  );

  const jobCount = parseInt(jobCheck.rows[0].job_count);

  if (jobCount > 0) {
    throw new Error(
      `Cannot delete property with existing jobs. This property has ${jobCount} job(s).`
    );
  }

  await pool.query(`DELETE FROM properties WHERE id = $1`, [id]);
  return { message: "Property deleted successfully" };
};

// 🔵 Check property ownership
export const isPropertyOwner = async (property_id, manager_id) => {
  const result = await pool.query(
    `SELECT id FROM properties WHERE id = $1 AND manager_id = $2`,
    [property_id, manager_id]
  );
  return result.rows.length > 0;
};

// 🟢 Get all properties (for any authenticated user)
export const getAllProperties = async () => {
  const result = await pool.query(
    `SELECT * FROM properties ORDER BY created_at DESC`
  );
  return result.rows;
};