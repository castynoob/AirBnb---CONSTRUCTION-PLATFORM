// src/models/progressModel.js
import pool from '../config/db.js';

const DEFAULT_STAGES = [
  { stage: 'not_started', sort_order: 0 },
  { stage: 'mobilization', sort_order: 1 },
  { stage: 'in_progress', sort_order: 2 },
  { stage: 'inspection', sort_order: 3 },
  { stage: 'completed', sort_order: 4 },
];

/**
 * Get all progress stages for a job, ordered by sort_order
 */
export const getProgressByJobId = async (jobId) => {
  const result = await pool.query(
    `SELECT * FROM job_progress_stages
     WHERE job_id = $1
     ORDER BY sort_order ASC`,
    [jobId]
  );
  return result.rows;
};

/**
 * Initialize the 5 default progress stages for a job.
 * The first stage (not_started) is auto-completed.
 */
export const initializeProgress = async (jobId, contractId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const stages = [];
    for (const def of DEFAULT_STAGES) {
      const isFirst = def.sort_order === 0;
      const result = await client.query(
        `INSERT INTO job_progress_stages
           (job_id, contract_id, stage, status, sort_order, actual_start, actual_end, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING *`,
        [
          jobId,
          contractId,
          def.stage,
          isFirst ? 'completed' : 'pending',
          def.sort_order,
          isFirst ? new Date() : null,
          isFirst ? new Date() : null,
        ]
      );
      stages.push(result.rows[0]);
    }

    await client.query('COMMIT');
    return stages;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Update a stage's status (entrepreneur action).
 * Sets actual_start when moving to in_progress, actual_end when completed.
 */
export const updateStageStatus = async (stageId, status, userId, notes) => {
  const now = new Date();
  let extraSet = '';
  const params = [status, userId, notes, now, stageId];

  if (status === 'in_progress') {
    extraSet = ', actual_start = COALESCE(actual_start, $6)';
    params.push(now);
  } else if (status === 'completed') {
    extraSet = ', actual_end = $6';
    params.push(now);
  }

  const result = await pool.query(
    `UPDATE job_progress_stages
     SET status = $1, updated_by = $2, notes = $3, updated_at = $4${extraSet}
     WHERE id = $5
     RETURNING *`,
    params
  );
  return result.rows[0];
};

/**
 * Manager validates a completed stage.
 */
export const validateStage = async (stageId, userId) => {
  const result = await pool.query(
    `UPDATE job_progress_stages
     SET status = 'validated', validated_by = $1, validated_at = NOW(), updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [userId, stageId]
  );
  return result.rows[0];
};

/**
 * Link photos to a stage via the existing images table.
 * Stores stage reference as [stage:STAGE_ID] in caption.
 */
export const addStagePhotos = async (stageId, jobId, imageUrls, userId) => {
  const inserted = [];
  for (const url of imageUrls) {
    const result = await pool.query(
      `INSERT INTO images (job_id, image_url, uploaded_by, image_type, caption, created_at)
       VALUES ($1, $2, $3, 'progress', $4, NOW())
       RETURNING *`,
      [jobId, url, userId, `[stage:${stageId}]`]
    );
    inserted.push(result.rows[0]);
  }
  return inserted;
};

/**
 * Get photos for a specific stage from the images table.
 */
export const getStagePhotos = async (stageId, jobId) => {
  const result = await pool.query(
    `SELECT * FROM images
     WHERE job_id = $1
       AND image_type = 'progress'
       AND caption LIKE $2
     ORDER BY created_at ASC`,
    [jobId, `%[stage:${stageId}]%`]
  );
  return result.rows;
};
