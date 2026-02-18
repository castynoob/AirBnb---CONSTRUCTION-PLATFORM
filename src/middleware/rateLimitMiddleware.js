import * as cache from '../config/cache.js';
import { RATE_LIMIT_KEYS } from '../utils/cacheKeys.js';

/**
 * Redis-based Rate Limiting Middleware
 *
 * Provides flexible rate limiting using Redis counters.
 * Benefits over in-memory rate limiting:
 * - Works across multiple server instances
 * - Persists across server restarts
 * - More accurate and performant
 */

/**
 * Generic rate limiter
 *
 * @param {Object} options - Rate limiting options
 * @param {Function} options.keyGenerator - Function to generate rate limit key from req
 * @param {number} options.max - Maximum number of requests
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {string} options.message - Error message when limit exceeded
 * @param {Function} options.skip - Optional function to skip rate limiting
 * @param {Function} options.handler - Optional custom handler for rate limit exceeded
 * @returns {Function} Express middleware
 *
 * @example
 * // Limit login attempts to 5 per 15 minutes per IP
 * const loginLimiter = rateLimit({
 *   keyGenerator: (req) => `ratelimit:login:${req.ip}`,
 *   max: 5,
 *   windowMs: 15 * 60 * 1000,
 *   message: 'Too many login attempts, please try again later'
 * });
 */
export const rateLimit = (options) => {
  const {
    keyGenerator,
    max,
    windowMs,
    message = 'Too many requests, please try again later',
    skip = null,
    handler = null,
  } = options;

  return async (req, res, next) => {
    try {
      // Skip rate limiting if condition is met
      if (skip && skip(req)) {
        return next();
      }

      // Generate rate limit key
      const key = typeof keyGenerator === 'function' ? keyGenerator(req) : keyGenerator;

      // Get current count
      let count = await cache.get(key);

      // First request in window
      if (count === null) {
        await cache.set(key, 1, Math.floor(windowMs / 1000));
        count = 1;
      } else {
        // Increment counter
        count = await cache.incr(key);
      }

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));

      // Check if limit exceeded
      if (count > max) {
        // Get TTL for reset time
        const ttl = await cache.ttl(key);
        const resetTime = Date.now() + ttl * 1000;
        res.setHeader('X-RateLimit-Reset', resetTime);

        // Custom handler or default response
        if (handler) {
          return handler(req, res, next);
        }

        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: message,
          retryAfter: ttl,
          limit: max,
          current: count,
        });
      }

      next();
    } catch (error) {
      console.error('[Rate Limit] Error:', error.message);
      // On Redis failure, allow request to proceed (fail open)
      next();
    }
  };
};

/**
 * Login rate limiter
 * Limits login attempts per IP address
 * 5 attempts per 15 minutes
 */
export const loginRateLimiter = rateLimit({
  keyGenerator: (req) => RATE_LIMIT_KEYS.login(req.ip),
  max: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: 'Too many login attempts from this IP, please try again after 15 minutes',
});

/**
 * Login rate limiter by email
 * Limits login attempts per email address
 * 10 attempts per hour
 */
export const loginEmailRateLimiter = rateLimit({
  keyGenerator: (req) => RATE_LIMIT_KEYS.login(req.body.email || 'unknown'),
  max: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many login attempts for this email, please try again later',
});

/**
 * Registration rate limiter
 * Limits registration attempts per IP
 * 3 registrations per hour
 */
export const registrationRateLimiter = rateLimit({
  keyGenerator: (req) => `ratelimit:register:${req.ip}`,
  max: 3,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many registration attempts, please try again later',
});

/**
 * API rate limiter
 * General API rate limiting per user
 * 100 requests per minute
 */
export const apiRateLimiter = rateLimit({
  keyGenerator: (req) => {
    const userId = req.user?.id || req.user?.userId || req.ip;
    return RATE_LIMIT_KEYS.api(userId);
  },
  max: 100,
  windowMs: 60 * 1000, // 1 minute
  message: 'API rate limit exceeded, please slow down',
  skip: (req) => !req.user, // Skip for non-authenticated requests
});

/**
 * Bid submission rate limiter
 * Prevents rapid bid submissions
 * 10 bids per minute per entrepreneur
 */
export const bidSubmissionRateLimiter = rateLimit({
  keyGenerator: (req) => {
    const entrepreneurId = req.user?.entrepreneurId || req.user?.entrepreneur_id || req.user?.id;
    return RATE_LIMIT_KEYS.bidSubmission(entrepreneurId);
  },
  max: 10,
  windowMs: 60 * 1000, // 1 minute
  message: 'You are submitting bids too quickly, please wait a moment',
});

/**
 * Email sending rate limiter
 * Prevents email spam
 * 5 emails per hour per user
 */
export const emailRateLimiter = rateLimit({
  keyGenerator: (req) => {
    const userId = req.user?.id || req.user?.userId || req.ip;
    return RATE_LIMIT_KEYS.email(userId);
  },
  max: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Email sending limit reached, please try again later',
});

/**
 * Password reset rate limiter
 * Limits password reset requests
 * 3 requests per hour per IP
 */
export const passwordResetRateLimiter = rateLimit({
  keyGenerator: (req) => `ratelimit:password-reset:${req.ip}`,
  max: 3,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many password reset requests, please try again later',
});

/**
 * Verification email rate limiter
 * Limits verification email resends
 * 5 requests per hour per email
 */
export const verificationEmailRateLimiter = rateLimit({
  keyGenerator: (req) => `ratelimit:verify-email:${req.body.email || req.ip}`,
  max: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many verification email requests, please check your inbox',
});

/**
 * Flexible rate limiter factory
 * Create custom rate limiters easily
 *
 * @param {string} name - Name for the rate limiter
 * @param {number} max - Maximum requests
 * @param {number} minutes - Time window in minutes
 * @param {Function} keyGenerator - Function to generate key
 * @returns {Function} Rate limit middleware
 *
 * @example
 * const myLimiter = createRateLimiter('custom', 10, 5, (req) => `custom:${req.user.id}`);
 */
export const createRateLimiter = (name, max, minutes, keyGenerator) => {
  return rateLimit({
    keyGenerator: keyGenerator || ((req) => `ratelimit:${name}:${req.ip}`),
    max,
    windowMs: minutes * 60 * 1000,
    message: `Rate limit exceeded for ${name}`,
  });
};

/**
 * Reset rate limit for a specific key
 * Useful for clearing limits after successful actions
 *
 * @param {string} key - Rate limit key
 * @returns {Promise<boolean>} True if successful
 */
export const resetRateLimit = async (key) => {
  try {
    await cache.del(key);
    return true;
  } catch (error) {
    console.error(`[Rate Limit] Failed to reset key "${key}":`, error.message);
    return false;
  }
};

export default {
  rateLimit,
  loginRateLimiter,
  loginEmailRateLimiter,
  registrationRateLimiter,
  apiRateLimiter,
  bidSubmissionRateLimiter,
  emailRateLimiter,
  passwordResetRateLimiter,
  verificationEmailRateLimiter,
  createRateLimiter,
  resetRateLimit,
};
