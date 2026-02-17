import Subscription from '../models/subscriptionModel.js';
import { Promoter } from '../models/promoterModel.js';
import db from '../config/db.js';
import * as cache from '../config/cache.js';
import { SUBSCRIPTION_KEYS, TTL } from '../utils/cacheKeys.js';

/**
 * Require active subscription
 * Blocks access if user doesn't have active or trialing subscription
 * Now with Redis caching for improved performance
 * Promoters get free access bypass
 */
const requireSubscription = async (req, res, next) => {
    try {
        const user_id = req.user.id;

        // ============================================
        // CHECK IF USER IS A PROMOTER (FREE ACCESS)
        // ============================================
        const userQuery = await db.query(
            'SELECT is_promoter, promoter_id FROM users WHERE id = $1',
            [user_id]
        );

        if (userQuery.rows.length > 0 && userQuery.rows[0].is_promoter) {
            const promoter = await Promoter.findById(userQuery.rows[0].promoter_id);

            if (promoter && promoter.is_active) {
                // Promoter has free access
                req.subscription = {
                    status: 'active',
                    plan_type: 'premium',
                    is_promoter: true,
                    promoter_id: promoter.id
                };
                console.log(`🎫 Promoter bypass: ${promoter.promoter_name}`);
                return next();
            }
        }

        // ============================================
        // REGULAR SUBSCRIPTION CHECK
        // ============================================

        // Try to get subscription from cache first
        const cacheKey = SUBSCRIPTION_KEYS.status(user_id);
        let subscription = await cache.get(cacheKey);

        // Cache miss - fetch from database
        if (!subscription) {
            subscription = await Subscription.findByUserId(user_id);

            // Cache the result (even if null)
            if (subscription) {
                await cache.set(cacheKey, subscription, TTL.FIVE_MINUTES);
            }
        }

        if (!subscription) {
            return res.status(403).json({
                error: 'Subscription required',
                message: 'Start your 14-day free trial to access this feature!',
                action: 'create_subscription'
            });
        }

        // Allow during trial AND active status
        const allowedStatuses = ['active', 'trialing'];

        if (!allowedStatuses.includes(subscription.status)) {
            if (subscription.status === 'past_due') {
                return res.status(403).json({
                    error: 'Payment failed',
                    message: 'Your trial has ended and payment failed. Please update your payment method.',
                    status: subscription.status,
                    action: 'update_payment_method'
                });
            }

            return res.status(403).json({
                error: 'Subscription inactive',
                message: `Your subscription is ${subscription.status}.`,
                status: subscription.status,
                action: 'reactivate_subscription'
            });
        }

        // Check if trial has actually expired by date (webhook may not have fired yet)
        if (subscription.status === 'trialing' && subscription.trial_end) {
            const now = new Date();
            const trialEnd = new Date(subscription.trial_end);
            if (now >= trialEnd) {
                // Trial has expired - update status locally and notify Stripe
                console.log(`⏰ Trial expired for user ${user_id}, trial_end: ${trialEnd.toISOString()}`);

                // Update local status to past_due (Stripe will handle the actual charge)
                try {
                    await db.query(
                        `UPDATE subscriptions SET status = 'past_due', updated_at = NOW() WHERE user_id = $1 AND status = 'trialing'`,
                        [user_id]
                    );
                    // Invalidate cache
                    await cache.del(cacheKey);
                } catch (updateErr) {
                    console.error('Error updating expired trial status:', updateErr);
                }

                return res.status(403).json({
                    error: 'Trial expired',
                    message: 'Your 14-day free trial has ended. Your card will be charged automatically. If payment fails, please update your payment method.',
                    status: 'trial_expired',
                    action: 'update_payment_method'
                });
            }
        }

        // Attach subscription to request
        req.subscription = subscription;
        next();

    } catch (error) {
        console.error('Subscription middleware error:', error);
        res.status(500).json({ error: 'Server error checking subscription' });
    }
};

/**
 * Check bid limit for basic plan users
 * Premium users get unlimited bids
 * Now with Redis counters for real-time bid tracking
 */
const checkBidLimit = async (req, res, next) => {
    try {
        const subscription = req.subscription; // Already attached by requireSubscription

        // Premium plan = unlimited bids
        if (subscription.plan_type === 'premium') {
            req.canBid = true;
            req.bidsRemaining = -1; // unlimited
            return next();
        }

        // Starter/Basic plan = check bid count
        const BID_LIMITS = { starter: 15, basic: 30 };
        const bidLimit = BID_LIMITS[subscription.plan_type] || 30;

        const entrepreneur_profile_id = subscription.entrepreneur_profile_id;
        const { BID_KEYS, getCurrentPeriod } = await import('../utils/cacheKeys.js');
        const currentPeriod = getCurrentPeriod();
        const cacheKey = BID_KEYS.count(entrepreneur_profile_id, currentPeriod);

        // Try to get count from Redis first
        let bidsUsed = await cache.get(cacheKey);

        // Cache miss - fetch from database and initialize Redis counter
        if (bidsUsed === null) {
            const bidCountQuery = await db.query(
                `SELECT bids_limit, bids_used, (bids_limit - bids_used) as remaining
                 FROM bid_counts
                 WHERE entrepreneur_profile_id = $1
                 AND period_end > NOW()
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [entrepreneur_profile_id]
            );

            let bidCount = bidCountQuery.rows[0];

            // Create new period if none exists
            if (!bidCount) {
                await db.query(
                    `INSERT INTO bid_counts (entrepreneur_profile_id, period_start, period_end, bids_used, bids_limit)
                     VALUES ($1, $2, $3, 0, $4)`,
                    [
                        entrepreneur_profile_id,
                        subscription.current_period_start,
                        subscription.current_period_end,
                        bidLimit
                    ]
                );
                bidsUsed = 0;
            } else {
                bidsUsed = bidCount.bids_used;
            }

            // Initialize Redis counter
            await cache.set(cacheKey, bidsUsed, TTL.ONE_WEEK);
        }

        // Check if bid limit reached
        if (bidsUsed >= bidLimit) {
            const upgradeMsg = subscription.plan_type === 'starter'
                ? `You have used all ${bidLimit} bids for this month. Upgrade to Basic ($250/month) or Premium ($429/month) for more bids.`
                : `You have used all ${bidLimit} bids for this month. Upgrade to Premium for unlimited bids.`;
            return res.status(403).json({
                error: 'Bid limit reached',
                message: upgradeMsg,
                bids_used: bidsUsed,
                bids_limit: bidLimit,
                action: 'upgrade_plan'
            });
        }

        req.canBid = true;
        req.bidsRemaining = bidLimit - bidsUsed;
        next();

    } catch (error) {
        console.error('Bid limit middleware error:', error);
        res.status(500).json({ error: 'Server error checking bid limit' });
    }
};

/**
 * Increment bid count after successful bid creation
 * Only for basic plan users
 * Now using Redis atomic increment with database sync
 */
const incrementBidCount = async (entrepreneur_profile_id) => {
    try {
        const { BID_KEYS, getCurrentPeriod } = await import('../utils/cacheKeys.js');
        const currentPeriod = getCurrentPeriod();
        const cacheKey = BID_KEYS.count(entrepreneur_profile_id, currentPeriod);

        // Atomic increment in Redis
        const newCount = await cache.incr(cacheKey);

        // Sync with database (background, non-blocking)
        db.query(
            `UPDATE bid_counts
             SET bids_used = bids_used + 1,
                 updated_at = NOW()
             WHERE entrepreneur_profile_id = $1
             AND period_end > NOW()
             RETURNING bids_used, bids_limit`,
            [entrepreneur_profile_id]
        ).then(result => {
            if (result.rows.length > 0) {
                console.log(`📊 Bid count incremented: ${result.rows[0].bids_used}/${result.rows[0].bids_limit}`);
            }
        }).catch(error => {
            console.error('Error syncing bid count to database:', error);
        });

        // Set TTL if this is a new counter
        if (newCount === 1) {
            await cache.expire(cacheKey, TTL.ONE_WEEK);
        }

        return newCount;
    } catch (error) {
        console.error('Error incrementing bid count:', error);
        // Fallback to database-only increment
        try {
            const result = await db.query(
                `UPDATE bid_counts
                 SET bids_used = bids_used + 1,
                     updated_at = NOW()
                 WHERE entrepreneur_profile_id = $1
                 AND period_end > NOW()
                 RETURNING bids_used, bids_limit`,
                [entrepreneur_profile_id]
            );
            if (result.rows.length > 0) {
                return result.rows[0].bids_used;
            }
        } catch (dbError) {
            console.error('Database fallback also failed:', dbError);
        }
    }
};

export { requireSubscription, checkBidLimit, incrementBidCount };