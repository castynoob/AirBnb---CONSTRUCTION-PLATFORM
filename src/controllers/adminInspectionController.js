// =============================================================================
// Admin-side inspection upload (Excel → multiple jobs)
// =============================================================================
//
// Mirrors what a property manager can do with /api/inspections/upload,
// but tailored for admins:
//
//   - No DB inspection record stored (the inspection_reports.uploaded_by FK
//     points at users(id), and admins live in a separate admin_users table).
//   - One-shot synchronous parse (no SSE streaming). Admins get a single JSON
//     response with the parsed jobs and can edit them before submitting.
//   - Ownership-aware bulk create: admin self-owns OR acts on behalf of a
//     property manager (same dual mode as adminCreateJob).
//
// Endpoints:
//   POST /api/admin/inspections/parse        — upload Excel, return parsed jobs
//   POST /api/admin/inspections/create-jobs  — bulk-create reviewed jobs
//
// Both require authenticateAdmin + isAdminOrHigher.
// =============================================================================

import pool from "../config/db.js";
import { parseExcelWithAI } from "../utils/aiExcelParser.js";
import { bulkCreateJobs } from "../models/jobModel.js";
import * as cache from "../config/cache.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

// -----------------------------------------------------------------------------
// POST /api/admin/inspections/parse
//
// Form-data:
//   - file: .xlsx | .xls | .csv (handled by uploadExcel middleware)
//   - property_id: UUID
//
// Returns:
//   { success, parsedData: { jobs, totalRows, successCount, errorCount, ... } }
// -----------------------------------------------------------------------------
export const adminParseInspection = async (req, res) => {
  try {
    const { property_id } = req.body;

    if (!isUuid(property_id)) {
      return res.status(400).json({
        message: "property_id is required and must be a valid UUID",
      });
    }
    if (!req.file) {
      return res.status(400).json({
        message: "Please provide an Excel file",
      });
    }

    // Verify property exists and the admin has the right to attach jobs to it.
    // Admins can post jobs against any property — but we surface the ownership
    // info back to the client so the frontend can render the right ownership
    // toggle state.
    const propCheck = await pool.query(
      `SELECT id, manager_id, admin_owner_id, building_name, address, city
       FROM properties WHERE id = $1`,
      [property_id]
    );
    if (!propCheck.rows[0]) {
      return res.status(404).json({ message: "Property not found" });
    }
    const property = propCheck.rows[0];

    // Parse the Excel file via AI (same util the PM flow uses, no progress
    // callback — admin flow is synchronous).
    console.log(
      `[Admin Inspection] Parsing Excel for property ${property_id} (admin ${req.admin?.id})…`
    );
    const parseResult = await parseExcelWithAI(req.file.buffer);

    if (parseResult.success === false) {
      return res.status(400).json({
        message: parseResult.error || "Failed to parse Excel",
        detectedColumns: parseResult.detectedColumns,
      });
    }
    if (!parseResult.jobs || parseResult.jobs.length === 0) {
      return res.status(400).json({
        message: "The Excel file does not contain any valid job data",
        detectedColumns: parseResult.detectedColumns,
      });
    }

    return res.json({
      success: true,
      message: `Successfully parsed ${parseResult.jobs.length} job(s) from the Excel file.`,
      property: {
        id: property.id,
        manager_id: property.manager_id,
        admin_owner_id: property.admin_owner_id,
        building_name: property.building_name,
        address: property.address,
        city: property.city,
      },
      parsedData: {
        totalRows: parseResult.totalRows,
        successCount: parseResult.successCount,
        errorCount: parseResult.errorCount,
        jobs: parseResult.jobs,
        errors: parseResult.errors,
        detectedColumns: parseResult.detectedColumns,
        fieldMapping: parseResult.fieldMapping,
      },
    });
  } catch (err) {
    console.error("❌ admin.adminParseInspection:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};

// -----------------------------------------------------------------------------
// POST /api/admin/inspections/create-jobs
//
// Body:
//   {
//     property_id:     UUID (required)
//     ownership:       "admin" | "manager"  (defaults to "admin")
//     manager_user_id: UUID    (required when ownership === "manager")
//     jobs:            [{ title, description, category, urgency, budget_min,
//                         budget_max, location, due_date, ... }, ...]
//   }
//
// Validates ownership matches the property, filters out jobs missing budgets,
// then bulk-inserts. Returns the created job rows.
// -----------------------------------------------------------------------------
export const adminCreateJobsFromInspection = async (req, res) => {
  try {
    const { property_id, jobs, ownership = "admin", manager_user_id } = req.body;

    if (!isUuid(property_id)) {
      return res.status(400).json({ message: "property_id is required and must be a UUID" });
    }
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({ message: "jobs array is required" });
    }

    // Resolve ownership (admin self vs on-behalf-of-manager).
    let owner;
    if (ownership === "manager") {
      if (!isUuid(manager_user_id)) {
        return res.status(400).json({
          message:
            "manager_user_id is required and must be a valid UUID when ownership is 'manager'",
        });
      }
      const mp = await pool.query(
        `SELECT id FROM manager_profiles WHERE user_id = $1`,
        [manager_user_id]
      );
      if (!mp.rows[0]) {
        return res.status(404).json({
          message: "The selected user does not have a property manager profile.",
        });
      }
      owner = { mode: "manager", manager_profile_id: mp.rows[0].id };
    } else {
      if (!req.admin?.id) {
        return res.status(401).json({ message: "Admin identity missing on request." });
      }
      owner = { mode: "admin", admin_owner_id: req.admin.id };
    }

    // Verify the property's ownership matches the chosen ownership mode.
    const propCheck = await pool.query(
      `SELECT manager_id, admin_owner_id FROM properties WHERE id = $1`,
      [property_id]
    );
    if (!propCheck.rows[0]) {
      return res.status(404).json({ message: "Property not found" });
    }
    if (owner.mode === "manager") {
      if (propCheck.rows[0].manager_id !== owner.manager_profile_id) {
        return res.status(400).json({
          message:
            "Property does not belong to the selected manager. Pick a property owned by the same manager.",
        });
      }
    } else {
      if (propCheck.rows[0].admin_owner_id !== owner.admin_owner_id) {
        return res.status(400).json({
          message:
            "Property is not owned by you. Pick one of your admin-owned properties, or switch to 'on behalf of' mode.",
        });
      }
    }

    // Filter out jobs missing a budget (same rule as PM flow).
    const withBudget = jobs.filter(
      (j) =>
        j.budget_min != null &&
        j.budget_max != null &&
        parseFloat(j.budget_min) >= 0 &&
        parseFloat(j.budget_max) > 0
    );
    const skippedCount = jobs.length - withBudget.length;

    if (withBudget.length === 0) {
      return res.status(400).json({
        message:
          "All jobs are missing a budget. Add budget min and max to at least one job before creating.",
        skippedCount,
      });
    }

    // Prepare ownership-aware payload for the bulk insert.
    const jobsToCreate = withBudget.map((job) => ({
      property_id,
      manager_id: owner.mode === "manager" ? owner.manager_profile_id : null,
      admin_owner_id: owner.mode === "admin" ? owner.admin_owner_id : null,
      title: job.title,
      description: job.description || "",
      category: job.category || "Other",
      urgency: job.urgency || "Medium",
      budget_min: parseFloat(job.budget_min),
      budget_max: parseFloat(job.budget_max),
      location: job.location || null,
      due_date: job.dueDate || job.due_date || null,
      estimated_duration_days:
        job.estimated_duration_days != null
          ? parseInt(job.estimated_duration_days, 10)
          : null,
      is_budget_hidden: !!job.is_budget_hidden,
      is_emergency: !!job.is_emergency,
      status: "Open",
    }));

    console.log(
      `[Admin Inspection] Creating ${jobsToCreate.length} jobs (mode=${owner.mode}, skipped=${skippedCount}) for property ${property_id}…`
    );
    const created = await bulkCreateJobs(jobsToCreate);

    // Invalidate job caches so subsequent listings reflect the new rows.
    try {
      await cache.delPattern("jobs:*");
      await cache.delPattern(`property:*:${property_id}*`);
    } catch (_) {
      /* cache failures non-fatal */
    }

    res.status(201).json({
      success: true,
      message: `Created ${created.length} job(s)${
        skippedCount > 0 ? ` (${skippedCount} skipped — missing budget)` : ""
      }.`,
      jobs: created,
      skippedCount,
    });
  } catch (err) {
    console.error("❌ admin.adminCreateJobsFromInspection:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};
