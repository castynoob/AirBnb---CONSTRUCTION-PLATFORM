import { getRedisClient, isRedisAvailable } from './redis.js';

/**
 * Cache Helper Utilities
 *
 * Provides high-level caching functions with automatic fallback
 * if Redis is unavailable (graceful degradation).
 *
 * Features:
 * - Get/Set/Delete operations
 * - Automatic JSON serialization
 * - TTL support
 * - Pattern-based deletion
 * - Cache statistics
 */

/**
 * Get value from cache
 * @param {string} key - Cache key
 * @returns {Promise<any|null>} Cached value or null
 */
export const get = async (key) => {
  try {
    if (!isRedisAvailable()) {
      return null;
    }

    const client = getRedisClient();
    const value = await client.get(key);

    if (!value) {
      return null;
    }

    // Try to parse JSON, return raw string if not JSON
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch (error) {
    console.error(`[Cache] Error getting key "${key}":`, error.message);
    return null;
  }
};

/**
 * Set value in cache
 * @param {string} key - Cache key
 * @param {any} value - Value to cache (will be JSON stringified)
 * @param {number} [ttl] - Time to live in seconds (optional)
 * @returns {Promise<boolean>} True if successful
 */
export const set = async (key, value, ttl = null) => {
  try {
    if (!isRedisAvailable()) {
      return false;
    }

    const client = getRedisClient();
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);

    if (ttl) {
      await client.setex(key, ttl, serialized);
    } else {
      await client.set(key, serialized);
    }

    return true;
  } catch (error) {
    console.error(`[Cache] Error setting key "${key}":`, error.message);
    return false;
  }
};

/**
 * Delete one or more keys from cache
 * @param {string|string[]} keys - Cache key(s) to delete
 * @returns {Promise<number>} Number of keys deleted
 */
export const del = async (keys) => {
  try {
    if (!isRedisAvailable()) {
      return 0;
    }

    const client = getRedisClient();
    const keysArray = Array.isArray(keys) ? keys : [keys];

    if (keysArray.length === 0) {
      return 0;
    }

    const result = await client.del(...keysArray);
    return result;
  } catch (error) {
    console.error(`[Cache] Error deleting keys:`, error.message);
    return 0;
  }
};

/**
 * Delete all keys matching a pattern
 * @param {string} pattern - Pattern to match (e.g., "user:*")
 * @returns {Promise<number>} Number of keys deleted
 */
export const delPattern = async (pattern) => {
  try {
    if (!isRedisAvailable()) {
      return 0;
    }

    const client = getRedisClient();
    const keys = await client.keys(pattern);

    if (keys.length === 0) {
      return 0;
    }

    const result = await client.del(...keys);
    console.log(`[Cache] Deleted ${result} keys matching pattern "${pattern}"`);
    return result;
  } catch (error) {
    console.error(`[Cache] Error deleting pattern "${pattern}":`, error.message);
    return 0;
  }
};

/**
 * Check if key exists in cache
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} True if key exists
 */
export const exists = async (key) => {
  try {
    if (!isRedisAvailable()) {
      return false;
    }

    const client = getRedisClient();
    const result = await client.exists(key);
    return result === 1;
  } catch (error) {
    console.error(`[Cache] Error checking existence of "${key}":`, error.message);
    return false;
  }
};

/**
 * Get TTL (time to live) of a key
 * @param {string} key - Cache key
 * @returns {Promise<number>} TTL in seconds (-1 = no expiry, -2 = doesn't exist)
 */
export const ttl = async (key) => {
  try {
    if (!isRedisAvailable()) {
      return -2;
    }

    const client = getRedisClient();
    return await client.ttl(key);
  } catch (error) {
    console.error(`[Cache] Error getting TTL of "${key}":`, error.message);
    return -2;
  }
};

/**
 * Set expiration on existing key
 * @param {string} key - Cache key
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<boolean>} True if successful
 */
export const expire = async (key, ttl) => {
  try {
    if (!isRedisAvailable()) {
      return false;
    }

    const client = getRedisClient();
    const result = await client.expire(key, ttl);
    return result === 1;
  } catch (error) {
    console.error(`[Cache] Error setting expiration on "${key}":`, error.message);
    return false;
  }
};

/**
 * Increment a counter (atomic operation)
 * @param {string} key - Cache key
 * @param {number} [amount=1] - Amount to increment by
 * @returns {Promise<number|null>} New value after increment, or null if failed
 */
export const incr = async (key, amount = 1) => {
  try {
    if (!isRedisAvailable()) {
      return null;
    }

    const client = getRedisClient();
    const result = amount === 1 ? await client.incr(key) : await client.incrby(key, amount);
    return result;
  } catch (error) {
    console.error(`[Cache] Error incrementing "${key}":`, error.message);
    return null;
  }
};

/**
 * Decrement a counter (atomic operation)
 * @param {string} key - Cache key
 * @param {number} [amount=1] - Amount to decrement by
 * @returns {Promise<number|null>} New value after decrement, or null if failed
 */
export const decr = async (key, amount = 1) => {
  try {
    if (!isRedisAvailable()) {
      return null;
    }

    const client = getRedisClient();
    const result = amount === 1 ? await client.decr(key) : await client.decrby(key, amount);
    return result;
  } catch (error) {
    console.error(`[Cache] Error decrementing "${key}":`, error.message);
    return null;
  }
};

/**
 * Flush all cache data (use with caution!)
 * @returns {Promise<boolean>} True if successful
 */
export const flushAll = async () => {
  try {
    if (!isRedisAvailable()) {
      return false;
    }

    const client = getRedisClient();
    await client.flushdb();
    console.log('[Cache] All cache data flushed');
    return true;
  } catch (error) {
    console.error('[Cache] Error flushing cache:', error.message);
    return false;
  }
};

/**
 * Get multiple values at once (pipeline for efficiency)
 * @param {string[]} keys - Array of cache keys
 * @returns {Promise<Object>} Object with keys and their values
 */
export const mget = async (keys) => {
  try {
    if (!isRedisAvailable() || keys.length === 0) {
      return {};
    }

    const client = getRedisClient();
    const values = await client.mget(...keys);

    const result = {};
    keys.forEach((key, index) => {
      if (values[index]) {
        try {
          result[key] = JSON.parse(values[index]);
        } catch {
          result[key] = values[index];
        }
      } else {
        result[key] = null;
      }
    });

    return result;
  } catch (error) {
    console.error('[Cache] Error in mget:', error.message);
    return {};
  }
};

/**
 * Set multiple key-value pairs at once
 * @param {Object} keyValuePairs - Object with key-value pairs
 * @param {number} [ttl] - Optional TTL for all keys
 * @returns {Promise<boolean>} True if successful
 */
export const mset = async (keyValuePairs, ttl = null) => {
  try {
    if (!isRedisAvailable() || Object.keys(keyValuePairs).length === 0) {
      return false;
    }

    const client = getRedisClient();
    const pipeline = client.pipeline();

    Object.entries(keyValuePairs).forEach(([key, value]) => {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      if (ttl) {
        pipeline.setex(key, ttl, serialized);
      } else {
        pipeline.set(key, serialized);
      }
    });

    await pipeline.exec();
    return true;
  } catch (error) {
    console.error('[Cache] Error in mset:', error.message);
    return false;
  }
};

/**
 * Cache-aside pattern helper
 * Tries to get from cache, if miss, calls loader function and caches result
 *
 * @param {string} key - Cache key
 * @param {Function} loader - Async function to load data on cache miss
 * @param {number} [ttl] - TTL in seconds
 * @returns {Promise<any>} Cached or loaded data
 */
export const getOrSet = async (key, loader, ttl = null) => {
  try {
    // Try to get from cache
    const cached = await get(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - load data
    const data = await loader();

    // Don't cache null/undefined values
    if (data !== null && data !== undefined) {
      await set(key, data, ttl);
    }

    return data;
  } catch (error) {
    console.error(`[Cache] Error in getOrSet for "${key}":`, error.message);
    // On error, try to load data directly
    try {
      return await loader();
    } catch (loaderError) {
      console.error(`[Cache] Loader function failed for "${key}":`, loaderError.message);
      throw loaderError;
    }
  }
};

/**
 * Get cache statistics
 * @returns {Promise<Object>} Cache statistics
 */
export const getStats = async () => {
  try {
    if (!isRedisAvailable()) {
      return { available: false };
    }

    const client = getRedisClient();
    const info = await client.info('stats');
    const keyspace = await client.info('keyspace');
    const dbsize = await client.dbsize();

    return {
      available: true,
      totalKeys: dbsize,
      info: info,
      keyspace: keyspace,
    };
  } catch (error) {
    console.error('[Cache] Error getting stats:', error.message);
    return { available: false, error: error.message };
  }
};

export default {
  get,
  set,
  del,
  delPattern,
  exists,
  ttl,
  expire,
  incr,
  decr,
  flushAll,
  mget,
  mset,
  getOrSet,
  getStats,
};
