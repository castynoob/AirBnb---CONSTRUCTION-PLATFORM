import * as cache from '../config/cache.js';

/**
 * Generic Cache Middleware
 *
 * Implements cache-aside pattern for GET requests.
 * - If data exists in cache, return immediately
 * - If cache miss, continue to controller, cache response
 * - Automatically handles cache failures (graceful degradation)
 */

/**
 * Create caching middleware for a route
 *
 * @param {Function} keyGenerator - Function that generates cache key from req
 * @param {number} ttl - Time to live in seconds
 * @param {Object} options - Additional options
 * @param {boolean} options.skipAuth - Don't include user ID in key (default: false)
 * @param {Function} options.condition - Optional condition to determine if caching should happen
 * @returns {Function} Express middleware
 *
 * @example
 * // Cache all jobs for 5 minutes
 * router.get('/jobs', cacheMiddleware(() => 'jobs:all', 300), getAllJobs);
 *
 * @example
 * // Cache user-specific data
 * router.get('/profile', cacheMiddleware((req) => `user:${req.user.id}`, 3600), getProfile);
 */
export const cacheMiddleware = (keyGenerator, ttl, options = {}) => {
  return async (req, res, next) => {
    try {
      // Check if caching should be skipped based on condition
      if (options.condition && !options.condition(req)) {
        return next();
      }

      // Generate cache key
      const cacheKey = typeof keyGenerator === 'function' ? keyGenerator(req) : keyGenerator;

      // Try to get from cache
      const cachedData = await cache.get(cacheKey);

      if (cachedData !== null) {
        // Cache hit
        return res.json({
          ...cachedData,
          _cached: true,
          _cacheKey: process.env.NODE_ENV === 'development' ? cacheKey : undefined,
        });
      }

      // Cache miss - intercept res.json to cache the response
      const originalJson = res.json.bind(res);

      res.json = function (data) {
        // Cache the response data (don't cache errors)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cache.set(cacheKey, data, ttl).catch((err) => {
            console.error(`[Cache] Failed to cache response for key "${cacheKey}":`, err.message);
          });
        }

        // Call original json method
        return originalJson(data);
      };

      // Continue to controller
      next();
    } catch (error) {
      // On any cache error, continue without caching
      console.error('[Cache Middleware] Error:', error.message);
      next();
    }
  };
};

/**
 * Invalidate cache patterns
 * Useful middleware for POST/PUT/DELETE routes to clear related caches
 *
 * @param {Function|string|string[]} patterns - Pattern(s) to invalidate or function returning patterns
 * @returns {Function} Express middleware
 *
 * @example
 * // Invalidate after creating a job
 * router.post('/jobs', invalidateCache(['jobs:*']), createJob);
 *
 * @example
 * // Invalidate based on request data
 * router.put('/jobs/:id', invalidateCache((req) => [`job:${req.params.id}`, 'jobs:*']), updateJob);
 */
export const invalidateCache = (patterns) => {
  return async (req, res, next) => {
    try {
      // Store patterns in res.locals for use after response
      const patternsToInvalidate =
        typeof patterns === 'function' ? patterns(req) : Array.isArray(patterns) ? patterns : [patterns];

      res.locals.cacheInvalidationPatterns = patternsToInvalidate;

      // Invalidate after response is sent
      res.on('finish', async () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          for (const pattern of patternsToInvalidate) {
            try {
              if (pattern.includes('*')) {
                await cache.delPattern(pattern);
              } else {
                await cache.del(pattern);
              }
            } catch (err) {
              console.error(`[Cache] Failed to invalidate pattern "${pattern}":`, err.message);
            }
          }
        }
      });

      next();
    } catch (error) {
      console.error('[Invalidate Cache Middleware] Error:', error.message);
      next();
    }
  };
};

/**
 * Conditional caching middleware
 * Only caches if condition is met
 *
 * @param {Function} condition - Function that returns boolean
 * @param {Function} keyGenerator - Function that generates cache key
 * @param {number} ttl - Time to live in seconds
 * @returns {Function} Express middleware
 *
 * @example
 * // Only cache for non-admin users
 * router.get('/jobs', conditionalCache(
 *   (req) => req.user.role !== 'admin',
 *   () => 'jobs:all',
 *   300
 * ), getAllJobs);
 */
export const conditionalCache = (condition, keyGenerator, ttl) => {
  return cacheMiddleware(keyGenerator, ttl, { condition });
};

/**
 * Cache with user context
 * Automatically includes user ID in cache key
 *
 * @param {string|Function} baseKey - Base cache key or generator function
 * @param {number} ttl - Time to live in seconds
 * @returns {Function} Express middleware
 *
 * @example
 * // Cache user's bids
 * router.get('/my-bids', userCache('bids', 300), getMyBids);
 * // Results in cache key: "user:123:bids"
 */
export const userCache = (baseKey, ttl) => {
  const keyGenerator = (req) => {
    const userId = req.user?.id || req.user?.userId;
    const key = typeof baseKey === 'function' ? baseKey(req) : baseKey;
    return `user:${userId}:${key}`;
  };
  return cacheMiddleware(keyGenerator, ttl);
};

/**
 * No-cache middleware
 * Adds headers to prevent caching by browsers/CDN
 *
 * @returns {Function} Express middleware
 *
 * @example
 * router.get('/real-time-data', noCache(), getRealTimeData);
 */
export const noCache = () => {
  return (req, res, next) => {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store',
    });
    next();
  };
};

/**
 * Helper to invalidate multiple cache patterns
 * Can be called directly from controllers
 *
 * @param {string[]} patterns - Array of patterns to invalidate
 * @returns {Promise<void>}
 *
 * @example
 * // In a controller
 * await invalidateMultiple(['jobs:*', 'properties:*']);
 */
export const invalidateMultiple = async (patterns) => {
  for (const pattern of patterns) {
    try {
      if (pattern.includes('*')) {
        await cache.delPattern(pattern);
      } else {
        await cache.del(pattern);
      }
    } catch (error) {
      console.error(`[Cache] Failed to invalidate pattern "${pattern}":`, error.message);
    }
  }
};

export default {
  cacheMiddleware,
  invalidateCache,
  conditionalCache,
  userCache,
  noCache,
  invalidateMultiple,
};
