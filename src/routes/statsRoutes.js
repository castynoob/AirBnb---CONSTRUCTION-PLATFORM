import express from "express";
import pool from "../config/db.js";
import { cacheMiddleware } from "../middleware/cacheMiddleware.js";
import { TTL } from "../utils/cacheKeys.js";

const router = express.Router();

// Public platform stats — no auth required
// Cached for 5 minutes
router.get(
  "/stats/public",
  cacheMiddleware(() => "stats:public", TTL.FIVE_MINUTES),
  async (req, res) => {
    try {
      const [userStats, projectStats, responseStats] = await Promise.all([
        // Query 1: User counts
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE email_verified = true) as active_users,
            COUNT(*) FILTER (WHERE role = 'property_manager') as property_managers,
            COUNT(*) FILTER (WHERE role = 'entrepreneur') as entrepreneurs
          FROM users
        `),

        // Query 2: Completed projects value (sum of accepted bid amounts for completed jobs)
        pool.query(`
          SELECT COALESCE(SUM(b.amount), 0) as completed_value
          FROM bids b
          JOIN jobs j ON b.job_id = j.id
          WHERE b.status = 'accepted' AND LOWER(j.status) = 'completed'
        `),

        // Query 3: Average message response time (last 30 days)
        pool.query(`
          SELECT
            COALESCE(
              AVG(EXTRACT(EPOCH FROM (read_at - created_at)) / 3600),
              24
            ) as avg_response_hours
          FROM messages
          WHERE read_at IS NOT NULL
            AND created_at >= NOW() - INTERVAL '30 days'
        `),
      ]);

      const users = userStats.rows[0];
      const projects = projectStats.rows[0];
      const response = responseStats.rows[0];

      res.json({
        success: true,
        stats: {
          activeUsers: parseInt(users.active_users) || 0,
          trustedBy:
            (parseInt(users.property_managers) || 0) +
            (parseInt(users.entrepreneurs) || 0),
          completedProjectsValue: parseFloat(projects.completed_value) || 0,
          avgResponseHours: parseFloat(response.avg_response_hours) || 24,
        },
      });
    } catch (error) {
      console.error("Error fetching public stats:", error);
      res.status(500).json({ success: false, error: "Failed to fetch stats" });
    }
  }
);

export default router;
