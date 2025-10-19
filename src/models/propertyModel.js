// src/models/propertyModel.js
import pool from "../config/db.js";

// 🟢 Create a new property
export const createProperty = async ({
  manager_id,
  address,
  city,
  province,
  postal_code,
  num_units,
  building_type,
  latitude,
  longitude
}) => {
  const query = `
    INSERT INTO properties (
      manager_id, address, city, province, postal_code, 
      num_units, building_type, latitude, longitude
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;
  
  const values = [
    manager_id, 
    address, 
    city, 
    province, 
    postal_code, 
    num_units, 
    building_type, 
    latitude || null, 
    longitude || null
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0];
};

// ... rest of your functions