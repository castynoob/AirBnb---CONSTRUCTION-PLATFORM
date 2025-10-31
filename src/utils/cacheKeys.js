/**
 * Centralized Cache Key Patterns
 *
 * This file defines all cache keys used throughout the application.
 * Benefits:
 * - Consistent key naming
 * - Easy to track all cache keys
 * - Avoid key collisions
 * - Simplify cache invalidation
 */

/**
 * Default TTL values (in seconds)
 */
export const TTL = {
  ONE_MINUTE: 60,
  FIVE_MINUTES: 300,
  TEN_MINUTES: 600,
  THIRTY_MINUTES: 1800,
  ONE_HOUR: 3600,
  ONE_DAY: 86400,
  ONE_WEEK: 604800,
};

/**
 * User-related cache keys
 */
export const USER_KEYS = {
  /**
   * User profile by user ID
   * @param {number} userId - User ID
   * @returns {string} Cache key
   */
  profile: (userId) => `user:profile:${userId}`,

  /**
   * Entrepreneur profile by user ID
   * @param {number} userId - User ID
   * @returns {string} Cache key
   */
  entrepreneur: (userId) => `user:entrepreneur:${userId}`,

  /**
   * Manager profile by user ID
   * @param {number} userId - User ID
   * @returns {string} Cache key
   */
  manager: (userId) => `user:manager:${userId}`,

  /**
   * Entrepreneur by entrepreneur profile ID
   * @param {number} entrepreneurId - Entrepreneur profile ID
   * @returns {string} Cache key
   */
  entrepreneurById: (entrepreneurId) => `entrepreneur:id:${entrepreneurId}`,

  /**
   * Manager by manager profile ID
   * @param {number} managerId - Manager profile ID
   * @returns {string} Cache key
   */
  managerById: (managerId) => `manager:id:${managerId}`,

  /**
   * Pattern to invalidate all user-related caches for a user
   * @param {number} userId - User ID
   * @returns {string} Pattern
   */
  allForUser: (userId) => `user:*:${userId}`,
};

/**
 * Job-related cache keys
 */
export const JOB_KEYS = {
  /**
   * All jobs list
   * @returns {string} Cache key
   */
  all: () => 'jobs:all',

  /**
   * Single job by ID
   * @param {number} jobId - Job ID
   * @returns {string} Cache key
   */
  single: (jobId) => `job:${jobId}`,

  /**
   * Jobs by manager ID
   * @param {number} managerId - Manager profile ID
   * @returns {string} Cache key
   */
  byManager: (managerId) => `jobs:manager:${managerId}`,

  /**
   * Jobs by entrepreneur ID
   * @param {number} entrepreneurId - Entrepreneur profile ID
   * @returns {string} Cache key
   */
  byEntrepreneur: (entrepreneurId) => `jobs:entrepreneur:${entrepreneurId}`,

  /**
   * Pattern to invalidate all job-related caches
   * @returns {string} Pattern
   */
  allJobs: () => 'jobs:*',

  /**
   * Pattern to invalidate all caches for a specific job
   * @param {number} jobId - Job ID
   * @returns {string} Pattern
   */
  forJob: (jobId) => `job:${jobId}*`,
};

/**
 * Property-related cache keys
 */
export const PROPERTY_KEYS = {
  /**
   * All properties list
   * @returns {string} Cache key
   */
  all: () => 'properties:all',

  /**
   * Single property by ID
   * @param {number} propertyId - Property ID
   * @returns {string} Cache key
   */
  single: (propertyId) => `property:${propertyId}`,

  /**
   * Property with statistics by ID
   * @param {number} propertyId - Property ID
   * @returns {string} Cache key
   */
  withStats: (propertyId) => `property:stats:${propertyId}`,

  /**
   * Properties by manager ID
   * @param {number} managerId - Manager ID
   * @returns {string} Cache key
   */
  byManager: (managerId) => `properties:manager:${managerId}`,

  /**
   * Pattern to invalidate all property-related caches
   * @returns {string} Pattern
   */
  allProperties: () => 'properties:*',

  /**
   * Pattern to invalidate all caches for a specific property
   * @param {number} propertyId - Property ID
   * @returns {string} Pattern
   */
  forProperty: (propertyId) => `property:*:${propertyId}*`,
};

/**
 * Bid-related cache keys
 */
export const BID_KEYS = {
  /**
   * All bids for a job
   * @param {number} jobId - Job ID
   * @returns {string} Cache key
   */
  byJob: (jobId) => `bids:job:${jobId}`,

  /**
   * All bids by entrepreneur
   * @param {number} entrepreneurId - Entrepreneur profile ID
   * @returns {string} Cache key
   */
  byEntrepreneur: (entrepreneurId) => `bids:entrepreneur:${entrepreneurId}`,

  /**
   * Bid count for current period
   * @param {number} entrepreneurId - Entrepreneur profile ID
   * @param {string} period - Period identifier (e.g., "2025-01")
   * @returns {string} Cache key
   */
  count: (entrepreneurId, period) => `bidcount:${entrepreneurId}:${period}`,

  /**
   * Pattern to invalidate all bid-related caches
   * @returns {string} Pattern
   */
  allBids: () => 'bids:*',

  /**
   * Pattern to invalidate all bids for a job
   * @param {number} jobId - Job ID
   * @returns {string} Pattern
   */
  forJob: (jobId) => `bids:job:${jobId}*`,

  /**
   * Pattern to invalidate all bids for an entrepreneur
   * @param {number} entrepreneurId - Entrepreneur profile ID
   * @returns {string} Pattern
   */
  forEntrepreneur: (entrepreneurId) => `bids:entrepreneur:${entrepreneurId}*`,
};

/**
 * Subscription-related cache keys
 */
export const SUBSCRIPTION_KEYS = {
  /**
   * Subscription status by user ID
   * @param {number} userId - User ID
   * @returns {string} Cache key
   */
  status: (userId) => `subscription:${userId}`,

  /**
   * Pattern to invalidate subscription for a user
   * @param {number} userId - User ID
   * @returns {string} Pattern
   */
  forUser: (userId) => `subscription:${userId}*`,
};

/**
 * Review-related cache keys
 */
export const REVIEW_KEYS = {
  /**
   * Reviews submitted by a user
   * @param {number} reviewerId - Reviewer user ID
   * @returns {string} Cache key
   */
  byReviewer: (reviewerId) => `reviews:reviewer:${reviewerId}`,

  /**
   * Reviews received by a user
   * @param {number} reviewedUserId - Reviewed user ID
   * @returns {string} Cache key
   */
  byReviewedUser: (reviewedUserId) => `reviews:reviewed:${reviewedUserId}`,

  /**
   * Review for a specific job
   * @param {number} jobId - Job ID
   * @returns {string} Cache key
   */
  byJob: (jobId) => `reviews:job:${jobId}`,

  /**
   * Pattern to invalidate all reviews involving a user
   * @param {number} userId - User ID
   * @returns {string} Pattern
   */
  forUser: (userId) => `reviews:*:${userId}*`,
};

/**
 * Message/Conversation-related cache keys
 */
export const MESSAGE_KEYS = {
  /**
   * All conversations for a user
   * @param {number} userId - User ID
   * @returns {string} Cache key
   */
  conversations: (userId) => `conversations:${userId}`,

  /**
   * Messages in a conversation
   * @param {number} conversationId - Conversation ID
   * @returns {string} Cache key
   */
  messages: (conversationId) => `messages:conversation:${conversationId}`,

  /**
   * Unread message count for a user
   * @param {number} userId - User ID
   * @returns {string} Cache key
   */
  unreadCount: (userId) => `unread:${userId}`,

  /**
   * Pattern to invalidate all message-related caches for a user
   * @param {number} userId - User ID
   * @returns {string} Pattern
   */
  forUser: (userId) => `*:${userId}`,

  /**
   * Pattern to invalidate conversation caches
   * @param {number} conversationId - Conversation ID
   * @returns {string} Pattern
   */
  forConversation: (conversationId) => `*:conversation:${conversationId}*`,
};

/**
 * Payment-related cache keys
 */
export const PAYMENT_KEYS = {
  /**
   * Budget unlock status for a job and entrepreneur
   * @param {number} jobId - Job ID
   * @param {number} entrepreneurId - Entrepreneur profile ID
   * @returns {string} Cache key
   */
  budgetUnlock: (jobId, entrepreneurId) => `budget:unlock:${jobId}:${entrepreneurId}`,

  /**
   * Pattern to invalidate budget unlocks for a job
   * @param {number} jobId - Job ID
   * @returns {string} Pattern
   */
  forJob: (jobId) => `budget:unlock:${jobId}:*`,
};

/**
 * Rate limiting cache keys
 */
export const RATE_LIMIT_KEYS = {
  /**
   * Login attempts by IP or email
   * @param {string} identifier - IP address or email
   * @returns {string} Cache key
   */
  login: (identifier) => `ratelimit:login:${identifier}`,

  /**
   * API requests by user ID
   * @param {number} userId - User ID
   * @returns {string} Cache key
   */
  api: (userId) => `ratelimit:api:${userId}`,

  /**
   * Bid submissions by entrepreneur
   * @param {number} entrepreneurId - Entrepreneur profile ID
   * @returns {string} Cache key
   */
  bidSubmission: (entrepreneurId) => `ratelimit:bid:${entrepreneurId}`,

  /**
   * Email sending by user
   * @param {number} userId - User ID
   * @returns {string} Cache key
   */
  email: (userId) => `ratelimit:email:${userId}`,
};

/**
 * Helper function to get current period identifier (YYYY-MM)
 * Used for bid counting
 * @returns {string} Period identifier
 */
export const getCurrentPeriod = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

/**
 * Helper function to build cache key with prefix
 * @param {string} prefix - Key prefix
 * @param {string} key - Key suffix
 * @returns {string} Full cache key
 */
export const buildKey = (prefix, key) => `${prefix}:${key}`;

export default {
  TTL,
  USER_KEYS,
  JOB_KEYS,
  PROPERTY_KEYS,
  BID_KEYS,
  SUBSCRIPTION_KEYS,
  REVIEW_KEYS,
  MESSAGE_KEYS,
  PAYMENT_KEYS,
  RATE_LIMIT_KEYS,
  getCurrentPeriod,
  buildKey,
};
