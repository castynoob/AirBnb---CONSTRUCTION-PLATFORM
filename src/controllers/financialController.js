// ============================================
// FINANCIAL CONTROLLER
// Aggregates financial data for the manager dashboard
// ============================================

import pool from '../config/db.js';

const FinancialController = {
  /**
   * GET FINANCIAL DASHBOARD
   * Returns aggregated financial data for the authenticated manager
   * GET /api/financial?year=2026&property_id=xxx
   */
  async getFinancialDashboard(req, res) {
    try {
      const user_id = req.user.id;
      const { year, property_id } = req.query;

      // Resolve manager_profile_id
      const managerResult = await pool.query(
        `SELECT id FROM manager_profiles WHERE user_id = $1`,
        [user_id]
      );

      if (managerResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Manager profile not found'
        });
      }

      const manager_id = managerResult.rows[0].id;

      // Build dynamic filter clauses
      const params = [manager_id];
      let paramIndex = 2;

      let yearFilter = '';
      if (year) {
        yearFilter = `AND EXTRACT(YEAR FROM c.created_at) = $${paramIndex}`;
        params.push(parseInt(year));
        paramIndex++;
      }

      let propertyFilter = '';
      if (property_id) {
        propertyFilter = `AND j.property_id = $${paramIndex}`;
        params.push(property_id);
        paramIndex++;
      }

      // ============================================
      // 1. OVERVIEW
      // ============================================
      const overviewQuery = `
        WITH manager_jobs AS (
          SELECT j.id, j.status AS job_status, j.budget_min, j.budget_max, j.property_id
          FROM jobs j
          WHERE j.manager_id = $1
            ${property_id ? propertyFilter.replace('j.property_id', 'j.property_id') : ''}
        ),
        manager_contracts AS (
          SELECT c.id, c.contract_amount, c.status AS contract_status, c.job_id, c.created_at
          FROM contracts c
          JOIN manager_jobs mj ON c.job_id = mj.id
          WHERE 1=1
            ${yearFilter}
        )
        SELECT
          COALESCE(SUM(mc.contract_amount) FILTER (WHERE mc.contract_status IN ('active', 'completed', 'work_completed', 'approved')), 0)::numeric AS total_spent,
          (SELECT COUNT(*) FROM manager_jobs) AS total_jobs,
          (SELECT COUNT(*) FROM manager_jobs WHERE job_status = 'completed') AS completed_jobs,
          (SELECT COUNT(*) FROM manager_contracts WHERE contract_status = 'active') AS active_contracts,
          COALESCE((SELECT AVG(contract_amount) FROM manager_contracts WHERE contract_status IN ('active', 'completed', 'work_completed', 'approved')), 0)::numeric AS avg_job_cost,
          COALESCE((SELECT SUM((budget_min + budget_max) / 2.0) FROM manager_jobs), 0)::numeric AS total_budget_planned
        FROM manager_contracts mc
      `;

      // Build params for overview (need to handle the CTE filters separately)
      const overviewParams = [manager_id];
      let ovIdx = 2;
      if (property_id) {
        overviewParams.push(property_id);
        ovIdx++;
      }
      if (year) {
        overviewParams.push(parseInt(year));
        ovIdx++;
      }

      // Rebuild overview query with correct param indices
      const ovPropertyFilter = property_id ? `AND j.property_id = $${2}` : '';
      const ovYearFilter = year ? `AND EXTRACT(YEAR FROM c.created_at) = $${property_id ? 3 : 2}` : '';

      const overviewSQL = `
        WITH manager_jobs AS (
          SELECT j.id, j.status AS job_status, j.budget_min, j.budget_max, j.property_id
          FROM jobs j
          WHERE j.manager_id = $1
            ${ovPropertyFilter}
        ),
        manager_contracts AS (
          SELECT c.id, c.contract_amount, c.status AS contract_status, c.job_id, c.created_at
          FROM contracts c
          JOIN manager_jobs mj ON c.job_id = mj.id
          WHERE 1=1
            ${ovYearFilter}
        )
        SELECT
          COALESCE(SUM(mc.contract_amount) FILTER (WHERE mc.contract_status IN ('active', 'completed', 'work_completed', 'approved')), 0)::numeric AS total_spent,
          (SELECT COUNT(*) FROM manager_jobs) AS total_jobs,
          (SELECT COUNT(*) FROM manager_jobs WHERE job_status = 'completed') AS completed_jobs,
          (SELECT COUNT(*) FROM manager_contracts WHERE contract_status = 'active') AS active_contracts,
          COALESCE((SELECT AVG(contract_amount) FROM manager_contracts WHERE contract_status IN ('active', 'completed', 'work_completed', 'approved')), 0)::numeric AS avg_job_cost,
          COALESCE((SELECT SUM((budget_min + budget_max) / 2.0) FROM manager_jobs), 0)::numeric AS total_budget_planned
        FROM manager_contracts mc
      `;

      const overviewResult = await pool.query(overviewSQL, overviewParams);
      const ov = overviewResult.rows[0];

      const overview = {
        total_spent: parseFloat(ov.total_spent),
        total_jobs: parseInt(ov.total_jobs),
        completed_jobs: parseInt(ov.completed_jobs),
        active_contracts: parseInt(ov.active_contracts),
        avg_job_cost: parseFloat(parseFloat(ov.avg_job_cost).toFixed(2)),
        total_budget_planned: parseFloat(parseFloat(ov.total_budget_planned).toFixed(2))
      };

      // ============================================
      // 2. BY PROPERTY
      // ============================================
      const byPropertySQL = `
        SELECT
          p.id AS property_id,
          p.building_name,
          p.address,
          COALESCE(SUM(c.contract_amount) FILTER (WHERE c.status IN ('active', 'completed', 'work_completed', 'approved')), 0)::numeric AS total_spent,
          COUNT(DISTINCT j.id) AS job_count,
          COALESCE(SUM((j.budget_min + j.budget_max) / 2.0), 0)::numeric AS budget_planned
        FROM jobs j
        JOIN properties p ON j.property_id = p.id
        LEFT JOIN contracts c ON c.job_id = j.id
          ${year ? `AND EXTRACT(YEAR FROM c.created_at) = $${property_id ? 3 : 2}` : ''}
        WHERE j.manager_id = $1
          ${ovPropertyFilter}
        GROUP BY p.id, p.building_name, p.address
        ORDER BY total_spent DESC
      `;

      const byPropertyResult = await pool.query(byPropertySQL, overviewParams);
      const by_property = byPropertyResult.rows.map(r => ({
        property_id: r.property_id,
        building_name: r.building_name,
        address: r.address,
        total_spent: parseFloat(r.total_spent),
        job_count: parseInt(r.job_count),
        budget_planned: parseFloat(parseFloat(r.budget_planned).toFixed(2))
      }));

      // ============================================
      // 3. BY CATEGORY
      // ============================================
      const byCategorySQL = `
        SELECT
          j.category,
          COALESCE(SUM(c.contract_amount) FILTER (WHERE c.status IN ('active', 'completed', 'work_completed', 'approved')), 0)::numeric AS total_spent,
          COUNT(DISTINCT j.id) AS job_count,
          COALESCE(AVG(c.contract_amount) FILTER (WHERE c.status IN ('active', 'completed', 'work_completed', 'approved')), 0)::numeric AS avg_cost
        FROM jobs j
        LEFT JOIN contracts c ON c.job_id = j.id
          ${year ? `AND EXTRACT(YEAR FROM c.created_at) = $${property_id ? 3 : 2}` : ''}
        WHERE j.manager_id = $1
          ${ovPropertyFilter}
        GROUP BY j.category
        ORDER BY total_spent DESC
      `;

      const byCategoryResult = await pool.query(byCategorySQL, overviewParams);
      const by_category = byCategoryResult.rows.map(r => ({
        category: r.category,
        total_spent: parseFloat(r.total_spent),
        job_count: parseInt(r.job_count),
        avg_cost: parseFloat(parseFloat(r.avg_cost).toFixed(2))
      }));

      // ============================================
      // 4. BY MONTH
      // ============================================
      const byMonthSQL = `
        SELECT
          TO_CHAR(c.created_at, 'YYYY-MM') AS month,
          COALESCE(SUM(c.contract_amount) FILTER (WHERE c.status IN ('active', 'completed', 'work_completed', 'approved')), 0)::numeric AS total_spent,
          COUNT(DISTINCT j.id) AS job_count
        FROM contracts c
        JOIN jobs j ON c.job_id = j.id
        WHERE j.manager_id = $1
          ${ovPropertyFilter}
          ${year ? `AND EXTRACT(YEAR FROM c.created_at) = $${property_id ? 3 : 2}` : ''}
        GROUP BY TO_CHAR(c.created_at, 'YYYY-MM')
        ORDER BY month ASC
      `;

      const byMonthResult = await pool.query(byMonthSQL, overviewParams);
      const by_month = byMonthResult.rows.map(r => ({
        month: r.month,
        total_spent: parseFloat(r.total_spent),
        job_count: parseInt(r.job_count)
      }));

      // ============================================
      // 5. BUDGET COMPARISON
      // ============================================
      const budgetCompSQL = `
        SELECT
          j.id AS job_id,
          j.title,
          j.category,
          j.budget_min,
          j.budget_max,
          c.contract_amount AS actual_cost,
          c.status,
          p.building_name AS property_name
        FROM jobs j
        JOIN contracts c ON c.job_id = j.id
        JOIN properties p ON j.property_id = p.id
        WHERE j.manager_id = $1
          ${ovPropertyFilter}
          ${year ? `AND EXTRACT(YEAR FROM c.created_at) = $${property_id ? 3 : 2}` : ''}
        ORDER BY c.created_at DESC
      `;

      const budgetCompResult = await pool.query(budgetCompSQL, overviewParams);
      const budget_comparison = budgetCompResult.rows.map(r => ({
        job_id: r.job_id,
        title: r.title,
        category: r.category,
        budget_min: parseFloat(r.budget_min),
        budget_max: parseFloat(r.budget_max),
        actual_cost: parseFloat(r.actual_cost),
        status: r.status,
        property_name: r.property_name
      }));

      // ============================================
      // 6. TOP CONTRACTORS
      // ============================================
      const topContractorsSQL = `
        SELECT
          ep.company_name,
          COALESCE(SUM(c.contract_amount) FILTER (WHERE c.status IN ('active', 'completed', 'work_completed', 'approved')), 0)::numeric AS total_paid,
          COUNT(DISTINCT c.id) AS job_count,
          COALESCE(AVG(r.rating), 0)::numeric AS avg_rating
        FROM contracts c
        JOIN jobs j ON c.job_id = j.id
        JOIN entrepreneur_profiles ep ON c.entrepreneur_id = ep.id
        LEFT JOIN reviews r ON r.entrepreneur_id = ep.id
        WHERE j.manager_id = $1
          ${ovPropertyFilter}
          ${year ? `AND EXTRACT(YEAR FROM c.created_at) = $${property_id ? 3 : 2}` : ''}
        GROUP BY ep.id, ep.company_name
        ORDER BY total_paid DESC
        LIMIT 10
      `;

      const topContractorsResult = await pool.query(topContractorsSQL, overviewParams);
      const top_contractors = topContractorsResult.rows.map(r => ({
        company_name: r.company_name,
        total_paid: parseFloat(r.total_paid),
        job_count: parseInt(r.job_count),
        avg_rating: parseFloat(parseFloat(r.avg_rating).toFixed(1))
      }));

      // ============================================
      // RESPONSE
      // ============================================
      return res.status(200).json({
        success: true,
        overview,
        by_property,
        by_category,
        by_month,
        budget_comparison,
        top_contractors
      });

    } catch (err) {
      console.error('Financial dashboard error:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch financial dashboard data'
      });
    }
  }
};

export default FinancialController;
