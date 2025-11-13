import { body, validationResult } from "express-validator";

// Password validation regex - Simplified: min 8 chars, at least one lowercase and one number
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*\d).{8,}$/;
// Name validation regex (letters, spaces, hyphens, apostrophes only)
const NAME_REGEX = /^[A-Za-zÀ-ÿ\s'\-]{2,50}$/;

// Custom password validator
const validatePasswordStrength = (value) => {
  if (!PASSWORD_REGEX.test(value)) {
    throw new Error('Password must contain at least 8 characters, including a lowercase letter and a number');
  }
  return true;
};

// Custom name validator
const validateName = (value) => {
  if (!NAME_REGEX.test(value)) {
    throw new Error('Name must contain only letters, spaces, hyphens, and apostrophes (2-50 characters)');
  }
  return true;
};

export const validateRegistration = [
  // Email validation (always required)
  body("email")
    .trim()
    .isEmail()
    .withMessage("Please enter a valid email address")
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage("Email is too long"),

  // Password validation - ONLY for local registration
  body("password")
    .if((value, { req }) => req.body.provider === "local" || !req.body.provider)
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters")
    .custom(validatePasswordStrength),

  // First name validation
  body("first_name")
    .trim()
    .notEmpty()
    .withMessage("First name is required")
    .custom(validateName)
    .escape(),

  // Last name validation
  body("last_name")
    .trim()
    .notEmpty()
    .withMessage("Last name is required")
    .custom(validateName)
    .escape(),

  // Phone validation (optional but recommended)
  body("phone")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Phone is required")
    .matches(/^[\d\s\-\+\(\)]+$/)
    .withMessage("Please enter a valid phone number"),

  // Provider validation - optional, defaults to "local"
  body("provider")
    .optional()
    .isIn(["local", "google", "facebook"])
    .withMessage("Please select a valid provider"),

  // Provider ID validation - required for social logins
  body("provider_id")
    .if((value, { req }) => req.body.provider === "google" || req.body.provider === "facebook")
    .notEmpty()
    .withMessage("Provider ID is required for social login"),

  // Error handler middleware
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Format errors for better UX
      const formattedErrors = errors.array().reduce((acc, error) => {
        acc[error.path] = error.msg;
        return acc;
      }, {});
      return res.status(400).json({
        message: "Please check your input and try again",
        errors: formattedErrors
      });
    }
    next();
  }
];

export const validateLogin = [
  // Email validation
  body("email")
    .trim()
    .isEmail()
    .withMessage("Please enter a valid email address")
    .normalizeEmail(),

  // Password validation (just check if provided, don't reveal requirements on login)
  body("password")
    .notEmpty()
    .withMessage("Password is required"),

  // Error handler middleware
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // For security, use generic message for login errors
      return res.status(400).json({
        message: "Please enter a valid email and password"
      });
    }
    next();
  }
];