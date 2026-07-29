// =============================================================================
// RBQ License Verification — HTTP handlers
// =============================================================================
//
// Two public endpoints:
//   POST /api/registration/validate-rbq
//     Anyone can call. Used by the registration form to give live feedback as
//     the contractor types. Response shape matches validateRBQLicense().
//
//   POST /api/admin/rbq/:entrepreneurProfileId/override
//     Admin only. Escape valve for RBQ outages or edge cases: forces the
//     contractor's RBQ status to 'admin_override' and records who did it.
// =============================================================================

import pool from "../config/db.js";
import {
  validateRBQLicense,
  persistRBQResult,
  isRBQValidationEnabled,
} from "../services/rbqValidationService.js";

// POST /api/registration/validate-rbq
// Body: { license_number: string }
export const validateRBQEndpoint = async (req, res) => {
  try {
    // Feature flag OFF — short-circuit BEFORE we call the registry. Saves a
    // (potentially slow / potentially failing) round-trip to the RBQ service
    // in dev, and gives the frontend an unambiguous signal to hide the whole
    // RBQ UI. Prior behaviour ran the check anyway and just returned
    // `enforcementEnabled: false`, which made the UI look "on" even when
    // the flag was off.
    if (!isRBQValidationEnabled()) {
      return res.json({
        ok: true,
        status: "disabled",
        enforcementEnabled: false,
      });
    }

    const { license_number } = req.body || {};
    if (!license_number) {
      return res.status(400).json({
        ok: false,
        reason: "missing-license",
        message: "license_number is required.",
      });
    }

    const result = await validateRBQLicense(license_number);
    // Also surface whether the enforcing gate is enabled, so the frontend can
    // decide whether a bad result is fatal (registration will refuse) or just
    // advisory.
    return res.json({ ...result, enforcementEnabled: isRBQValidationEnabled() });
  } catch (err) {
    console.error("❌ validateRBQEndpoint:", err);
    return res.status(500).json({ ok: false, reason: "error", message: err.message });
  }
};

// POST /api/admin/rbq/:entrepreneurProfileId/override
// Body: { note?: string }
// Header: admin JWT
export const adminOverrideRBQ = async (req, res) => {
  try {
    const { entrepreneurProfileId } = req.params;
    const { note } = req.body || {};
    const adminId = req.admin?.id;

    if (!adminId) {
      return res.status(401).json({ message: "Not authenticated as admin." });
    }

    const { rows } = await pool.query(
      `UPDATE entrepreneur_profiles
       SET rbq_status       = 'admin_override',
           rbq_verified_at  = now(),
           rbq_checked_at   = now(),
           rbq_override_by  = $1,
           rbq_override_note = $2
       WHERE id = $3
       RETURNING id, rbq_status, rbq_verified_at`,
      [adminId, note || null, entrepreneurProfileId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Entrepreneur profile not found." });
    }

    return res.json({
      ok: true,
      message: "RBQ status overridden by admin.",
      profile: rows[0],
    });
  } catch (err) {
    console.error("❌ adminOverrideRBQ:", err);
    return res.status(500).json({ message: err.message });
  }
};

// POST /api/admin/rbq/:entrepreneurProfileId/recheck
// Body: none
// Re-runs the live lookup against the RBQ registry and updates the columns.
export const adminRecheckRBQ = async (req, res) => {
  try {
    const { entrepreneurProfileId } = req.params;

    const { rows } = await pool.query(
      `SELECT id, license_number FROM entrepreneur_profiles WHERE id = $1`,
      [entrepreneurProfileId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Entrepreneur profile not found." });
    }

    const result = await validateRBQLicense(rows[0].license_number);
    await persistRBQResult(entrepreneurProfileId, result);

    return res.json({ ok: true, result });
  } catch (err) {
    console.error("❌ adminRecheckRBQ:", err);
    return res.status(500).json({ message: err.message });
  }
};

// Just re-exported so the caller can gate registration.
export { persistRBQResult };
