import pool from '../config/db.js';

const FinancialController = {
  async getFinancialDashboard(req, res) {
    try {
      const user_id = req.user.id;
      const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
      const property_id = req.query.property_id || null;

      // Get manager profile
      const mgr = await pool.query('SELECT id FROM manager_profiles WHERE user_id = $1', [user_id]);
      if (!mgr.rows[0]) return res.status(403).json({ error: 'Manager profile not found' });
      const manager_id = mgr.rows[0].id;

      // 1. OVERVIEW
      const overviewQ = await pool.query(`
        SELECT
          COALESCE(SUM(c.contract_amount) FILTER (WHERE c.status IN ('active','completed')), 0)::float AS total_spent,
          COUNT(DISTINCT j.id)::int AS total_jobs,
          COUNT(DISTINCT j.id) FILTER (WHERE j.status = 'completed')::int AS completed_jobs,
          COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'active')::int AS active_contracts,
          COALESCE(AVG(c.contract_amount) FILTER (WHERE c.status IN ('active','completed')), 0)::float AS avg_job_cost,
          COALESCE(SUM((j.budget_min + j.budget_max) / 2.0), 0)::float AS total_budget_planned
        FROM jobs j
        LEFT JOIN contracts c ON c.job_id = j.id
        WHERE j.manager_id = $1
          AND ($2::int IS NULL OR EXTRACT(YEAR FROM COALESCE(c.created_at, j.created_at)) = $2)
          AND ($3::uuid IS NULL OR j.property_id = $3)
      `, [manager_id, year, property_id]);

      // 2. BY PROPERTY
      const byPropertyQ = await pool.query(`
        SELECT p.id AS property_id, p.building_name, p.address,
          COALESCE(SUM(c.contract_amount) FILTER (WHERE c.status IN ('active','completed')), 0)::float AS total_spent,
          COUNT(DISTINCT j.id)::int AS job_count,
          COALESCE(SUM((j.budget_min + j.budget_max) / 2.0), 0)::float AS budget_planned
        FROM jobs j
        JOIN properties p ON j.property_id = p.id
        LEFT JOIN contracts c ON c.job_id = j.id
        WHERE j.manager_id = $1
          AND ($2::int IS NULL OR EXTRACT(YEAR FROM COALESCE(c.created_at, j.created_at)) = $2)
        GROUP BY p.id, p.building_name, p.address
        ORDER BY total_spent DESC
      `, [manager_id, year]);

      // 3. BY CATEGORY
      const byCategoryQ = await pool.query(`
        SELECT j.category,
          COALESCE(SUM(c.contract_amount) FILTER (WHERE c.status IN ('active','completed')), 0)::float AS total_spent,
          COUNT(DISTINCT j.id)::int AS job_count,
          COALESCE(AVG(c.contract_amount) FILTER (WHERE c.status IN ('active','completed')), 0)::float AS avg_cost
        FROM jobs j
        LEFT JOIN contracts c ON c.job_id = j.id
        WHERE j.manager_id = $1
          AND ($2::int IS NULL OR EXTRACT(YEAR FROM COALESCE(c.created_at, j.created_at)) = $2)
          AND ($3::uuid IS NULL OR j.property_id = $3)
          AND j.category IS NOT NULL
        GROUP BY j.category
        ORDER BY total_spent DESC
      `, [manager_id, year, property_id]);

      // 4. BY MONTH
      const byMonthQ = await pool.query(`
        SELECT to_char(COALESCE(c.created_at, j.created_at), 'YYYY-MM') AS month,
          COALESCE(SUM(c.contract_amount) FILTER (WHERE c.status IN ('active','completed')), 0)::float AS total_spent,
          COUNT(DISTINCT j.id)::int AS job_count
        FROM jobs j
        LEFT JOIN contracts c ON c.job_id = j.id
        WHERE j.manager_id = $1
          AND EXTRACT(YEAR FROM COALESCE(c.created_at, j.created_at)) = $2
          AND ($3::uuid IS NULL OR j.property_id = $3)
        GROUP BY month
        ORDER BY month
      `, [manager_id, year, property_id]);

      // 5. BUDGET COMPARISON
      const budgetQ = await pool.query(`
        SELECT j.id AS job_id, j.title, j.category, j.budget_min, j.budget_max, j.status,
          c.contract_amount AS actual_cost,
          p.building_name AS property_name
        FROM jobs j
        LEFT JOIN contracts c ON c.job_id = j.id
        LEFT JOIN properties p ON j.property_id = p.id
        WHERE j.manager_id = $1
          AND ($2::int IS NULL OR EXTRACT(YEAR FROM COALESCE(c.created_at, j.created_at)) = $2)
          AND ($3::uuid IS NULL OR j.property_id = $3)
          AND c.contract_amount IS NOT NULL
        ORDER BY (c.contract_amount - (j.budget_min + j.budget_max) / 2.0) DESC
        LIMIT 20
      `, [manager_id, year, property_id]);

      // 6. TOP CONTRACTORS
      const contractorsQ = await pool.query(`
        SELECT ep.company_name,
          COALESCE(SUM(c.contract_amount), 0)::float AS total_paid,
          COUNT(DISTINCT c.id)::int AS job_count,
          COALESCE(ep.average_rating, 0)::float AS avg_rating
        FROM contracts c
        JOIN jobs j ON c.job_id = j.id
        JOIN entrepreneur_profiles ep ON c.entrepreneur_id = ep.id
        WHERE j.manager_id = $1
          AND ($2::int IS NULL OR EXTRACT(YEAR FROM c.created_at) = $2)
          AND ($3::uuid IS NULL OR j.property_id = $3)
        GROUP BY ep.id, ep.company_name, ep.average_rating
        ORDER BY total_paid DESC
        LIMIT 10
      `, [manager_id, year, property_id]);

      const ov = overviewQ.rows[0] || {};

      return res.json({
        success: true,
        overview: {
          total_spent: ov.total_spent || 0,
          total_jobs: ov.total_jobs || 0,
          completed_jobs: ov.completed_jobs || 0,
          active_contracts: ov.active_contracts || 0,
          avg_job_cost: ov.avg_job_cost || 0,
          total_budget_planned: ov.total_budget_planned || 0,
        },
        by_property: byPropertyQ.rows,
        by_category: byCategoryQ.rows,
        by_month: byMonthQ.rows,
        budget_comparison: budgetQ.rows.map(r => ({
          ...r,
          budget_min: parseFloat(r.budget_min) || 0,
          budget_max: parseFloat(r.budget_max) || 0,
          actual_cost: parseFloat(r.actual_cost) || 0,
        })),
        top_contractors: contractorsQ.rows,
      });
    } catch (err) {
      console.error('Financial dashboard error:', err.message);
      return res.status(500).json({ success: false, error: 'Failed to fetch financial data' });
    }
  }
};

export default FinancialController;
