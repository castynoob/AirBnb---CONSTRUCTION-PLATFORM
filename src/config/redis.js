import Redis from 'ioredis';

/**
 * Redis Client Configuration
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Error handling and logging
 * - Connection state monitoring
 * - Graceful degradation (app continues without cache if Redis fails)
 */

// Redis client instance
let redisClient = null;

// Configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),

  // Connection options
  retryStrategy: (times) => {
    // Stop retrying after 3 attempts if Redis is unavailable
    if (times > 3) {
      console.log('[Redis] ⚠ Redis unavailable - running without cache');
      return null; // Stop retrying
    }
    // Reconnect after exponential backoff
    const delay = Math.min(times * 50, 2000);
    console.log(`[Redis] Reconnecting attempt ${times}, delay: ${delay}ms`);
    return delay;
  },

  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  lazyConnect: false,

  // Connection timeout
  connectTimeout: 10000,

  // Keep-alive
  keepAlive: 30000,
};

// Create Redis client
const createRedisClient = () => {
  try {
    const client = new Redis(redisConfig);

    // Event listeners
    client.on('connect', () => {
      console.log('[Redis] Connecting to Redis server...');
    });

    client.on('ready', () => {
      console.log('[Redis] ✓ Connected and ready');
    });

    client.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
      // Don't crash the application - gracefully degrade
    });

    client.on('close', () => {
      console.log('[Redis] Connection closed');
    });

    client.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...');
    });

    client.on('end', () => {
      console.log('[Redis] Connection ended');
    });

    return client;
  } catch (error) {
    console.error('[Redis] Failed to create Redis client:', error.message);
    return null;
  }
};

// Initialize client
redisClient = createRedisClient();

/**
 * Get Redis client instance
 * @returns {Redis|null} Redis client or null if not connected
 */
export const getRedisClient = () => {
  return redisClient;
};

/**
 * Check if Redis is available and connected
 * @returns {boolean} True if Redis is ready
 */
export const isRedisAvailable = () => {
  return redisClient && redisClient.status === 'ready';
};

/**
 * Ping Redis to check connection
 * @returns {Promise<boolean>} True if ping successful
 */
export const pingRedis = async () => {
  try {
    if (!redisClient) return false;
    const result = await redisClient.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('[Redis] Ping failed:', error.message);
    return false;
  }
};

/**
 * Gracefully close Redis connection
 * @returns {Promise<void>}
 */
export const closeRedis = async () => {
  try {
    if (redisClient) {
      await redisClient.quit();
      console.log('[Redis] Connection closed gracefully');
    }
  } catch (error) {
    console.error('[Redis] Error closing connection:', error.message);
    // Force disconnect
    if (redisClient) {
      redisClient.disconnect();
    }
  }
};

/**
 * Get Redis connection info
 * @returns {Object} Connection information
 */
export const getRedisInfo = () => {
  return {
    host: redisConfig.host,
    port: redisConfig.port,
    db: redisConfig.db,
    status: redisClient ? redisClient.status : 'not initialized',
    isAvailable: isRedisAvailable(),
  };
};

// Export the client directly for advanced usage
export default redisClient;
