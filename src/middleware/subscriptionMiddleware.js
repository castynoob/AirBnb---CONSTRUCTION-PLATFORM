import Subscription from '../models/subscriptionModel.js';
import db from '../config/db.js';

/**
 * Require active subscription
 * Blocks access if user doesn't have active or trialing subscription
 */
const requireSubscription = async (req, res, next) => {
    try {
        const user_id = req.user.id;
        const subscription = await Subscription.findByUserId(user_id);

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

        // Basic plan = check bid count (30 max)
        const entrepreneur_profile_id = subscription.entrepreneur_profile_id;

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
                 VALUES ($1, $2, $3, 0, 30)`,
                [
                    entrepreneur_profile_id,
                    subscription.current_period_start,
                    subscription.current_period_end
                ]
            );
            req.canBid = true;
            req.bidsRemaining = 30;
            return next();
        }

        // Check if 30-bid limit reached
        if (bidCount.bids_used >= bidCount.bids_limit) {
            return res.status(403).json({
                error: 'Bid limit reached',
                message: 'You have used all 30 bids for this month. Upgrade to Premium for unlimited bids.',
                bids_used: bidCount.bids_used,
                bids_limit: bidCount.bids_limit,
                upgrade_price: '$429/month',
                action: 'upgrade_to_premium'
            });
        }

        req.canBid = true;
        req.bidsRemaining = bidCount.remaining;
        next();

    } catch (error) {
        console.error('Bid limit middleware error:', error);
        res.status(500).json({ error: 'Server error checking bid limit' });
    }
};

/**
 * Increment bid count after successful bid creation
 * Only for basic plan users
 */
const incrementBidCount = async (entrepreneur_profile_id) => {
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
            console.log(`📊 Bid count incremented: ${result.rows[0].bids_used}/${result.rows[0].bids_limit}`);
        }
    } catch (error) {
        console.error('Error incrementing bid count:', error);
        // Don't throw - this is not critical
    }
};

export { requireSubscription, checkBidLimit, incrementBidCount };