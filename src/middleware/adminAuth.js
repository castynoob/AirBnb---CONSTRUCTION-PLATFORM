import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { findAdminById } from "../models/adminModel.js";

dotenv.config();

// Authenticate admin token
export const authenticateAdmin = async (req, res, next) => {
  console.log("[Admin Auth Middleware] Called for:", req.method, req.path);

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      console.log("[Admin Auth Middleware] No auth header found");
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if it's an admin token
    if (!decoded.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    // Verify admin exists and is active
    const admin = await findAdminById(decoded.id);

    if (!admin) {
      return res.status(401).json({ message: "Admin not found" });
    }

    if (admin.status !== "active") {
      return res.status(403).json({ message: "Admin account is suspended" });
    }

    // Attach admin to request
    req.admin = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" });
    }
    console.error("Admin auth error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// Check admin role permission
export const authorizeAdminRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (!allowedRoles.includes(req.admin.role)) {
      return res.status(403).json({
        message: "You don't have permission to perform this action",
      });
    }

    next();
  };
};

// Permission constants for easy reference
export const ADMIN_ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  MODERATOR: "moderator",
  SUPPORT: "support",
};

// Shorthand permission checks
export const isSuperAdmin = authorizeAdminRole(ADMIN_ROLES.SUPER_ADMIN);
export const isAdminOrHigher = authorizeAdminRole(ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN);
export const isModeratorOrHigher = authorizeAdminRole(
  ADMIN_ROLES.SUPER_ADMIN,
  ADMIN_ROLES.ADMIN,
  ADMIN_ROLES.MODERATOR
);
export const isSupportOrHigher = authorizeAdminRole(
  ADMIN_ROLES.SUPER_ADMIN,
  ADMIN_ROLES.ADMIN,
  ADMIN_ROLES.MODERATOR,
  ADMIN_ROLES.SUPPORT
);
