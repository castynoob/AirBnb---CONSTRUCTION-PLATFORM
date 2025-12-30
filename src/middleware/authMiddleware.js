import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

export const authenticateToken = (req, res, next) => {
  console.log("[Auth Middleware] Called for:", req.method, req.path);

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.log("[Auth Middleware] No auth header found");
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      // Return 401 for expired or invalid tokens so frontend can trigger refresh
      return res.status(401).json({ message: "Invalid token" });
    }
    req.user = decoded;
    next();
  });
};

// Also export as verifyToken for backward compatibility
export const verifyToken = authenticateToken;