import db from '../config/db.js';

// ✅ KEEP YOUR EXISTING FUNCTION
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied: insufficient permissions" });
    }
    next();
  };
};

// ✅ ADD THESE NEW FUNCTIONS FOR PAYMENT SYSTEM

/**
 * Require entrepreneur role
 * Checks if user has an entrepreneur_profile in database
 */
export const requireEntrepreneur = async (req, res, next) => {
    try {
        const user_id = req.user.id;
        
        // Check if user has entrepreneur profile
        const entrepreneurQuery = await db.query(
            'SELECT id FROM entrepreneur_profiles WHERE user_id = $1',
            [user_id]
        );

        if (entrepreneurQuery.rows.length === 0) {
            return res.status(403).json({
                error: 'Entrepreneur account required',
                message: 'Only entrepreneurs can perform this action',
                user_role: req.user.role
            });
        }

        // Attach entrepreneur profile ID to request
        req.entrepreneur_profile_id = entrepreneurQuery.rows[0].id;
        next();

    } catch (error) {
        console.error('Role middleware error:', error);
        res.status(500).json({ error: 'Server error checking user role' });
    }
};

/**
 * Require property manager role
 * Checks if user has a manager_profile in database
 */
export const requirePropertyManager = async (req, res, next) => {
    try {
        const user_id = req.user.id;
        
        const managerQuery = await db.query(
            'SELECT id FROM manager_profiles WHERE user_id = $1',
            [user_id]
        );

        if (managerQuery.rows.length === 0) {
            return res.status(403).json({
                error: 'Property manager account required',
                message: 'Only property managers can perform this action'
            });
        }

        req.manager_profile_id = managerQuery.rows[0].id;
        next();

    } catch (error) {
        console.error('Role middleware error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};