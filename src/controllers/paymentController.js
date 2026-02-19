import stripe, { stripeConfig } from '../config/stripe.js';
import Subscription from '../models/subscriptionModel.js';
import { Promoter, PromoCodeRedemption } from '../models/promoterModel.js';
import PromoCode from '../models/promoCodeModel.js';
import db from '../config/db.js';
import * as cache from '../config/cache.js';
import { SUBSCRIPTION_KEYS } from '../utils/cacheKeys.js';
import {
    createUserActivityLog,
    ActivityActions,
    EntityTypes,
} from '../models/userActivityModel.js';
import { notifyPromoterOfReferral } from '../services/promoterNotificationService.js';

// ✅ DYNAMIC - Price IDs are loaded from stripeConfig based on STRIPE_MODE
const PLANS = {
    starter: {
        price_id: stripeConfig.priceIds.starter,
        name: 'Starter Entrepreneur Plan',
        price: 89,
        interval: 'month',
        bids_limit: 15
    },
    basic: {
        price_id: stripeConfig.priceIds.basic,
        name: 'Basic Entrepreneur Plan',
        price: 250,
        interval: 'month',
        bids_limit: 30
    },
    premium: {
        price_id: stripeConfig.priceIds.premium,
        name: 'Premium Entrepreneur Plan',
        price: 429,
        interval: 'month',
        bids_limit: -1
    }
};

// Log which price IDs are being used
console.log(`📋 Using Price IDs (${stripeConfig.mode} mode):`, {
    starter: PLANS.starter.price_id,
    basic: PLANS.basic.price_id,
    premium: PLANS.premium.price_id
});

const PaymentController = {
    
    /**
     * CREATE SUBSCRIPTION
     * POST /api/payments/create-subscription
     * Body: { plan_type: 'basic' | 'premium', payment_method_id: 'pm_xxx', promo_code?: string }
     */
    async createSubscription(req, res) {
        try {
            const { plan_type, payment_method_id, promo_code } = req.body;
            const user_id = req.user.id;

            // ============================================
            // PROMO CODE HANDLING
            // ============================================
            if (promo_code) {
                const upperCode = promo_code.toUpperCase().trim();

                // Check if it's an activation code (promoter free access)
                const promoterByActivation = await Promoter.findByActivationCode(upperCode);
                if (promoterByActivation) {
                    // Check if already activated
                    if (promoterByActivation.user_id) {
                        return res.status(400).json({
                            error: 'Activation code already used',
                            message: 'This activation code has already been used'
                        });
                    }

                    // Get entrepreneur profile
                    const entrepreneurQuery = await db.query(
                        'SELECT id FROM entrepreneur_profiles WHERE user_id = $1',
                        [user_id]
                    );

                    if (entrepreneurQuery.rows.length === 0) {
                        return res.status(403).json({
                            error: 'Entrepreneur account required',
                            message: 'Only entrepreneurs can use activation codes'
                        });
                    }

                    const entrepreneur_profile_id = entrepreneurQuery.rows[0].id;

                    // Activate promoter - grant free access
                    await Promoter.activate(promoterByActivation.id, user_id);

                    // Create actual subscription record for promoter (free premium access)
                    const now = new Date();
                    const farFuture = new Date('2099-12-31'); // Promoters get indefinite access

                    const subscription = await Subscription.upsert({
                        user_id,
                        entrepreneur_profile_id,
                        stripe_customer_id: null,
                        stripe_subscription_id: `promoter_${promoterByActivation.id}_${user_id}`,
                        plan_type: 'premium',
                        status: 'active',
                        trial_end: null,
                        current_period_start: now,
                        current_period_end: farFuture
                    });

                    // Update user's promoter status
                    await db.query(
                        'UPDATE users SET is_promoter = true, promoter_id = $1 WHERE id = $2',
                        [promoterByActivation.id, user_id]
                    );

                    console.log(`✅ Promoter activated: ${promoterByActivation.promoter_name} (user: ${user_id})`);

                    // Invalidate subscription cache
                    const cacheKey = `${SUBSCRIPTION_KEYS.USER_SUBSCRIPTION}:${user_id}`;
                    cache.del(cacheKey);

                    return res.json({
                        success: true,
                        message: 'Promoter account activated! You have free platform access.',
                        is_promoter: true,
                        subscription: {
                            id: subscription.id,
                            status: 'active',
                            plan_type: 'premium',
                            is_promoter: true,
                            current_period_start: subscription.current_period_start,
                            current_period_end: subscription.current_period_end
                        }
                    });
                }

                // Check if it's a free_access promo code from the new system
                const promoCodeResult = await PromoCode.validate(upperCode);

                // If only promo_code is provided (no plan_type/payment_method_id),
                // it must be a valid free_access code
                if (!plan_type && !payment_method_id) {
                    if (!promoCodeResult.valid) {
                        return res.status(400).json({
                            error: 'Invalid promo code',
                            message: promoCodeResult.message || 'This promo code is invalid or has expired'
                        });
                    }
                    if (promoCodeResult.code_type !== 'free_access') {
                        return res.status(400).json({
                            error: 'Discount code requires plan selection',
                            message: 'This is a discount code. Please select a plan to apply the discount.'
                        });
                    }
                }

                if (promoCodeResult.valid && promoCodeResult.code_type === 'free_access') {
                    // Get entrepreneur profile
                    const entrepreneurQuery = await db.query(
                        'SELECT id FROM entrepreneur_profiles WHERE user_id = $1',
                        [user_id]
                    );

                    if (entrepreneurQuery.rows.length === 0) {
                        return res.status(403).json({
                            error: 'Entrepreneur account required',
                            message: 'Only entrepreneurs can use this code'
                        });
                    }

                    const entrepreneur_profile_id = entrepreneurQuery.rows[0].id;

                    // Check if user already has an active subscription
                    const existingSub = await Subscription.findByUserId(user_id);

                    // If user is on trial, return trial options instead of error
                    if (existingSub && existingSub.status === 'trialing') {
                        const trialEnd = new Date(existingSub.trial_end);
                        const now = new Date();
                        const daysRemaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));

                        return res.status(200).json({
                            requires_trial_decision: true,
                            message: 'You are currently on a trial. Choose how to apply this promo code.',
                            promo_code: upperCode,
                            promo_code_id: promoCodeResult.promoCode.id,
                            promo_type: promoCodeResult.code_type,
                            trial_info: {
                                trial_end: existingSub.trial_end,
                                days_remaining: Math.max(0, daysRemaining),
                                plan_type: existingSub.plan_type
                            },
                            options: {
                                queue: {
                                    label: 'Apply After Trial',
                                    description: `Keep your trial and automatically apply this promo code when it ends on ${trialEnd.toLocaleDateString()}.`
                                },
                                apply_now: {
                                    label: 'Apply Now',
                                    description: 'Cancel your trial immediately and activate the promo code now. You will lose remaining trial days.',
                                    warning: `You will lose ${Math.max(0, daysRemaining)} remaining trial days.`
                                }
                            }
                        });
                    }

                    if (existingSub && existingSub.status === 'active') {
                        return res.status(400).json({
                            error: 'Active subscription exists',
                            message: 'You already have an active paid subscription'
                        });
                    }

                    // Create free subscription (no Stripe needed)
                    const now = new Date();
                    const farFuture = new Date('2099-12-31'); // Free access indefinitely

                    const subscription = await Subscription.upsert({
                        user_id,
                        entrepreneur_profile_id,
                        stripe_customer_id: null,
                        stripe_subscription_id: `promo_free_${promoCodeResult.promoCode.id}_${user_id}`,
                        plan_type: 'premium',
                        status: 'active',
                        trial_end: null,
                        current_period_start: now,
                        current_period_end: farFuture
                    });

                    // Record promo code usage
                    await PromoCode.recordUse(promoCodeResult.promoCode.id, user_id, subscription.id);

                    console.log(`✅ Free access activated via promo code: ${upperCode} (user: ${user_id})`);

                    // Invalidate subscription cache
                    const cacheKey = `${SUBSCRIPTION_KEYS.USER_SUBSCRIPTION}:${user_id}`;
                    cache.del(cacheKey);

                    return res.json({
                        success: true,
                        message: 'Free access activated! You have full platform access.',
                        is_promoter: true,
                        subscription: {
                            id: subscription.id,
                            status: 'active',
                            plan_type: 'premium',
                            is_free_access: true,
                            current_period_start: subscription.current_period_start,
                            current_period_end: subscription.current_period_end
                        }
                    });
                }
            }

            // ============================================
            // REGULAR SUBSCRIPTION FLOW
            // ============================================

            if (!plan_type || !payment_method_id) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    required: ['plan_type', 'payment_method_id']
                });
            }

            if (!['starter', 'basic', 'premium'].includes(plan_type)) {
                return res.status(400).json({
                    error: 'Invalid plan type',
                    message: 'Plan must be "starter", "basic", or "premium"'
                });
            }

            const entrepreneurQuery = await db.query(
                'SELECT id FROM entrepreneur_profiles WHERE user_id = $1',
                [user_id]
            );

            if (entrepreneurQuery.rows.length === 0) {
                return res.status(403).json({ 
                    error: 'Entrepreneur account required',
                    message: 'Only entrepreneurs can create subscriptions'
                });
            }

            const entrepreneur_profile_id = entrepreneurQuery.rows[0].id;

            const existingSub = await Subscription.findByUserId(user_id);
            if (existingSub && ['active', 'trialing'].includes(existingSub.status)) {
                return res.status(400).json({ 
                    error: 'Active subscription exists',
                    message: 'You already have an active subscription',
                    current_subscription: {
                        plan_type: existingSub.plan_type,
                        status: existingSub.status
                    }
                });
            }

            const userQuery = await db.query(
                'SELECT email, stripe_customer_id FROM users WHERE id = $1',
                [user_id]
            );
            const user = userQuery.rows[0];

            let customer;
            let needsCustomerUpdate = false;

            if (user.stripe_customer_id) {
                try {
                    // Try to retrieve existing customer
                    customer = await stripe.customers.retrieve(user.stripe_customer_id);

                    // Check if customer was deleted
                    if (customer.deleted) {
                        console.log(`⚠️ Customer ${user.stripe_customer_id} was deleted, creating new one`);
                        customer = null;
                        needsCustomerUpdate = true;
                    }
                } catch (err) {
                    // Customer doesn't exist in current Stripe mode (test vs live)
                    console.log(`⚠️ Customer ${user.stripe_customer_id} not found in ${stripeConfig.mode} mode, creating new one`);
                    customer = null;
                    needsCustomerUpdate = true;
                }
            }

            // Create new customer if needed
            if (!customer) {
                customer = await stripe.customers.create({
                    email: user.email,
                    payment_method: payment_method_id,
                    invoice_settings: {
                        default_payment_method: payment_method_id
                    },
                    metadata: {
                        user_id: user_id,
                        entrepreneur_profile_id: entrepreneur_profile_id,
                        stripe_mode: stripeConfig.mode
                    }
                });
                needsCustomerUpdate = true;
                console.log(`✅ Created new Stripe customer: ${customer.id} (${stripeConfig.mode} mode)`);
            }

            // Update database with new customer ID
            if (needsCustomerUpdate) {
                await db.query(
                    'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
                    [customer.id, user_id]
                );
            }

            const plan = PLANS[plan_type];

            console.log('🔍 Creating subscription with price:', plan.price_id);

            // Check for referral code (discount)
            let referralPromoter = null;
            let promoCodeRecord = null;
            let stripePromoCodeId = null;

            if (promo_code) {
                const upperCode = promo_code.toUpperCase().trim();

                // First check old promoter referral codes
                referralPromoter = await Promoter.findByReferralCode(upperCode);

                if (referralPromoter) {
                    // Check max redemptions
                    const redemptionCheck = await Promoter.checkMaxRedemptions(referralPromoter.id);
                    if (!redemptionCheck.allowed) {
                        return res.status(400).json({
                            error: 'Promo code limit reached',
                            message: 'This promo code has reached its maximum redemptions'
                        });
                    }

                    stripePromoCodeId = referralPromoter.stripe_promo_code_id;
                    console.log(`🎟️ Applying referral code: ${upperCode} (${referralPromoter.discount_percent}% off)`);
                } else {
                    // Check new promo_codes table
                    const promoCodeResult = await PromoCode.validate(upperCode);
                    if (promoCodeResult.valid) {
                        promoCodeRecord = promoCodeResult.promoCode;
                        stripePromoCodeId = promoCodeRecord.stripe_promo_code_id;
                        console.log(`🎟️ Applying promo code: ${upperCode} (${promoCodeResult.discount_percent}% off for ${promoCodeResult.discount_duration} months)`);
                    }
                }
            }

            // Build subscription options
            const subscriptionOptions = {
                customer: customer.id,
                items: [{
                    price: plan.price_id
                }],
                trial_period_days: 14,
                default_payment_method: payment_method_id,
                payment_settings: {
                    payment_method_types: ['card'],
                    save_default_payment_method: 'on_subscription'
                },
                expand: ['latest_invoice.payment_intent'],
                metadata: {
                    user_id: user_id,
                    entrepreneur_profile_id: entrepreneur_profile_id,
                    plan_type: plan_type,
                    promo_code: promo_code || null,
                    promoter_id: referralPromoter?.id || null,
                    promo_code_id: promoCodeRecord?.id || null
                }
            };

            // Add promotion code if referral code was provided
            if (stripePromoCodeId) {
                subscriptionOptions.promotion_code = stripePromoCodeId;
            }

            const subscription = await stripe.subscriptions.create(subscriptionOptions);

            console.log('📨 Stripe subscription response:', {
                id: subscription.id,
                status: subscription.status,
                trial_end: subscription.trial_end,
                current_period_start: subscription.current_period_start,
                current_period_end: subscription.current_period_end
            });

            // Safety checks for timestamps
            const trial_end_date = subscription.trial_end 
                ? new Date(subscription.trial_end * 1000) 
                : null;

            const period_start_date = subscription.current_period_start 
                ? new Date(subscription.current_period_start * 1000) 
                : new Date();

            const period_end_date = subscription.current_period_end 
                ? new Date(subscription.current_period_end * 1000) 
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            console.log('📅 Parsed dates:', {
                trial_end: trial_end_date,
                period_start: period_start_date,
                period_end: period_end_date
            });

            // Build subscription data with promo code info
            const subscriptionData = {
                user_id,
                entrepreneur_profile_id,
                stripe_customer_id: customer.id,
                stripe_subscription_id: subscription.id,
                plan_type,
                status: subscription.status,
                trial_end: trial_end_date,
                current_period_start: period_start_date,
                current_period_end: period_end_date
            };

            await Subscription.upsert(subscriptionData);

            // Update subscription with promo code info if referral was used
            if (referralPromoter) {
                await db.query(
                    `UPDATE subscriptions
                     SET promoter_id = $1, promo_code_used = $2, discount_percent = $3, discount_months = $4
                     WHERE stripe_subscription_id = $5`,
                    [
                        referralPromoter.id,
                        promo_code.toUpperCase(),
                        referralPromoter.discount_percent,
                        referralPromoter.discount_duration,
                        subscription.id
                    ]
                );

                // Record the redemption (non-blocking - don't fail subscription if this fails)
                try {
                    const subQuery = await db.query(
                        'SELECT id FROM subscriptions WHERE stripe_subscription_id = $1',
                        [subscription.id]
                    );

                    if (subQuery.rows.length > 0) {
                        const redemption = await PromoCodeRedemption.create({
                            referral_code: promo_code.toUpperCase(),
                            promoter_id: referralPromoter.id,
                            redeemed_by_user_id: user_id,
                            subscription_id: subQuery.rows[0].id,
                            discount_percent: referralPromoter.discount_percent,
                            discount_duration: referralPromoter.discount_duration
                        });

                        // Send notification to promoter (async, non-blocking)
                        const userInfo = await db.query(
                            'SELECT first_name, last_name FROM users WHERE id = $1',
                            [user_id]
                        );
                        if (userInfo.rows.length > 0) {
                            notifyPromoterOfReferral(referralPromoter, userInfo.rows[0], redemption.id)
                                .catch(err => console.error('Notification error:', err));
                        }
                        console.log(`✅ Referral recorded: ${promo_code} for user ${user_id}`);
                    }
                } catch (redemptionError) {
                    // Log error but don't fail the subscription
                    console.error('⚠️ Failed to record redemption (subscription still successful):', redemptionError.message);
                }
            }

            // Record promo code usage from new promo_codes table
            if (promoCodeRecord) {
                try {
                    const subQuery = await db.query(
                        'SELECT id FROM subscriptions WHERE stripe_subscription_id = $1',
                        [subscription.id]
                    );

                    if (subQuery.rows.length > 0) {
                        await PromoCode.recordUse(
                            promoCodeRecord.id,
                            user_id,
                            subQuery.rows[0].id
                        );
                        console.log(`✅ Promo code usage recorded: ${promo_code} for user ${user_id}`);
                    }
                } catch (promoError) {
                    console.error('⚠️ Failed to record promo code usage (subscription still successful):', promoError.message);
                }
            }

            if (plan_type === 'starter' || plan_type === 'basic') {
                const bidsLimit = plan_type === 'starter' ? 15 : 30;
                await db.query(
                    `INSERT INTO bid_counts (entrepreneur_profile_id, period_start, period_end, bids_used, bids_limit)
                    VALUES ($1, $2, $3, 0, $4)`,
                    [
                        entrepreneur_profile_id,
                        period_start_date,
                        period_end_date,
                        bidsLimit
                    ]
                );
            }

            console.log(`✅ Subscription created for user ${user_id}: ${plan_type} plan`);

            // Log user activity
            const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
            const userAgent = req.headers['user-agent'];
            await createUserActivityLog(
                user_id,
                ActivityActions.SUBSCRIPTION_CREATED,
                EntityTypes.SUBSCRIPTION,
                subscription.id,
                { plan_type: plan_type, trial_end: subscription.trial_end },
                ipAddress,
                userAgent
            );

            res.json({
                success: true,
                message: 'Subscription created successfully! Your 14-day free trial has started.',
                subscription: {
                    id: subscription.id,
                    status: subscription.status,
                    plan_type,
                    trial_end: subscription.trial_end,
                    current_period_start: period_start_date,
                    current_period_end: subscription.current_period_end,
                    is_trial: subscription.status === 'trialing',
                    price: `$${PLANS[plan_type].price}/month`
                }
            });

        } catch (error) {
            console.error('❌ Create subscription error:', error);
            res.status(500).json({
                error: 'Failed to create subscription',
                message: error.message
            });
        }
    },

    // ... rest of your functions stay the same ...
    async getSubscription(req, res) {
        try {
            const user_id = req.user.id;
            const subscription = await Subscription.findByUserId(user_id);

            if (!subscription) {
                return res.json({ 
                    hasSubscription: false,
                    message: 'No subscription found. Start your 14-day free trial today!'
                });
            }

            let bidsInfo = null;
            if ((subscription.plan_type === 'starter' || subscription.plan_type === 'basic') && subscription.entrepreneur_profile_id) {
                const bidCountQuery = await db.query(
                    `SELECT bids_limit, bids_used, (bids_limit - bids_used) as remaining
                     FROM bid_counts 
                     WHERE entrepreneur_profile_id = $1 
                     AND period_end > NOW()
                     ORDER BY created_at DESC 
                     LIMIT 1`,
                    [subscription.entrepreneur_profile_id]
                );
                
                if (bidCountQuery.rows.length > 0) {
                    const bidData = bidCountQuery.rows[0];
                    bidsInfo = {
                        used: bidData.bids_used,
                        limit: bidData.bids_limit,
                        remaining: bidData.remaining
                    };
                }
            }

            let trialDaysRemaining = null;
            if (subscription.status === 'trialing' && subscription.trial_end) {
                const now = new Date();
                const trialEnd = new Date(subscription.trial_end);
                const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
                trialDaysRemaining = Math.max(0, daysLeft);

                // Detect expired trial and update status to past_due
                if (now >= trialEnd) {
                    try {
                        await db.query(
                            `UPDATE subscriptions SET status = 'past_due', updated_at = NOW() WHERE user_id = $1 AND status = 'trialing'`,
                            [user_id]
                        );
                        subscription.status = 'past_due';
                        console.log(`⏰ Trial expired for user ${user_id} - updated to past_due`);
                    } catch (updateErr) {
                        console.error('Error updating expired trial status:', updateErr);
                    }
                }
            }

            // Check if this is a free access subscription (promo code or promoter)
            const isFreeAccess = subscription.stripe_subscription_id?.startsWith('promo_free_') ||
                                 subscription.stripe_subscription_id?.startsWith('promoter_');

            // Get promo code info if it's a free access subscription
            let promoCodeInfo = null;
            if (isFreeAccess && subscription.stripe_subscription_id?.startsWith('promo_free_')) {
                // Extract promo code ID from stripe_subscription_id (format: promo_free_{promo_id}_{user_id})
                const parts = subscription.stripe_subscription_id.split('_');
                if (parts.length >= 3) {
                    const promoCodeId = parts[2];
                    try {
                        const promoQuery = await db.query(
                            'SELECT code, discount_type, discount_value FROM promo_codes WHERE id = $1',
                            [promoCodeId]
                        );
                        if (promoQuery.rows.length > 0) {
                            promoCodeInfo = {
                                code: promoQuery.rows[0].code,
                                discount_type: promoQuery.rows[0].discount_type,
                                discount_value: promoQuery.rows[0].discount_value
                            };
                        }
                    } catch (err) {
                        console.error('Error fetching promo code info:', err);
                    }
                }
            }

            res.json({
                hasSubscription: true,
                subscription: {
                    plan_type: subscription.plan_type,
                    status: subscription.status,
                    trial_end: subscription.trial_end,
                    trial_days_remaining: trialDaysRemaining,
                    current_period_start: subscription.current_period_start,
                    current_period_end: subscription.current_period_end,
                    cancel_at_period_end: subscription.cancel_at_period_end,
                    bids: bidsInfo,
                    is_trial: subscription.status === 'trialing',
                    is_free_access: isFreeAccess,
                    promo_code: promoCodeInfo,
                    price: isFreeAccess ? 'Free' : (subscription.plan_type === 'starter' ? '$89/month' : subscription.plan_type === 'basic' ? '$250/month' : '$429/month')
                }
            });

        } catch (error) {
            console.error('❌ Get subscription error:', error);
            res.status(500).json({ error: error.message });
        }
    },

    async cancelSubscription(req, res) {
        try {
            const user_id = req.user.id;
            const subscription = await Subscription.findByUserId(user_id);

            if (!subscription) {
                return res.status(404).json({ error: 'No subscription found' });
            }

            if (!['active', 'trialing'].includes(subscription.status)) {
                return res.status(400).json({
                    error: 'Cannot cancel inactive subscription',
                    current_status: subscription.status
                });
            }

            let updatedSub = null;
            let stripeError = null;

            // Try to cancel on Stripe if we have a valid subscription ID
            if (subscription.stripe_subscription_id) {
                try {
                    updatedSub = await stripe.subscriptions.update(
                        subscription.stripe_subscription_id,
                        { cancel_at_period_end: true }
                    );
                } catch (stripeErr) {
                    console.error('❌ Stripe cancel error:', stripeErr.message);
                    stripeError = stripeErr;
                    // Continue to update local database even if Stripe fails
                    // This handles cases where Stripe subscription was already deleted
                }
            }

            // Update local database
            await Subscription.cancel(subscription.stripe_subscription_id);

            console.log(`🗑️ Subscription canceled for user ${user_id}`);

            // Log user activity
            try {
                const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
                const userAgent = req.headers['user-agent'];
                await createUserActivityLog(
                    user_id,
                    ActivityActions.SUBSCRIPTION_CANCELLED,
                    EntityTypes.SUBSCRIPTION,
                    subscription.stripe_subscription_id,
                    { plan_type: subscription.plan_type, cancel_at: updatedSub?.cancel_at },
                    ipAddress,
                    userAgent
                );
            } catch (logError) {
                console.error('❌ Activity log error (non-fatal):', logError.message);
            }

            res.json({
                success: true,
                message: 'Subscription will be canceled at the end of your billing period',
                cancel_at: updatedSub?.cancel_at || null,
                access_until: subscription.current_period_end,
                stripe_synced: !stripeError
            });

        } catch (error) {
            console.error('❌ Cancel subscription error:', error);
            res.status(500).json({
                error: 'Failed to cancel subscription',
                message: error.message
            });
        }
    },

    async unlockBudget(req, res) {
        try {
            const { job_id, payment_method_id } = req.body;
            const user_id = req.user.id;

            if (!job_id || !payment_method_id) {
                return res.status(400).json({ 
                    error: 'Missing required fields',
                    required: ['job_id', 'payment_method_id']
                });
            }

            const entrepreneurQuery = await db.query(
                'SELECT id FROM entrepreneur_profiles WHERE user_id = $1',
                [user_id]
            );

            if (entrepreneurQuery.rows.length === 0) {
                return res.status(403).json({ 
                    error: 'Entrepreneur account required',
                    message: 'Only entrepreneurs can unlock budgets'
                });
            }

            const entrepreneur_id = entrepreneurQuery.rows[0].id;

            const jobQuery = await db.query('SELECT id, title FROM jobs WHERE id = $1', [job_id]);
            if (jobQuery.rows.length === 0) {
                return res.status(404).json({ error: 'Job not found' });
            }

            const existingUnlock = await db.query(
                'SELECT * FROM budget_unlocks WHERE entrepreneur_id = $1 AND job_id = $2',
                [entrepreneur_id, job_id]
            );

            if (existingUnlock.rows.length > 0) {
                return res.status(400).json({ 
                    error: 'Budget already unlocked',
                    message: 'You have already unlocked the budget for this job',
                    unlocked_at: existingUnlock.rows[0].unlocked_at
                });
            }

            const userQuery = await db.query(
                'SELECT email, stripe_customer_id FROM users WHERE id = $1',
                [user_id]
            );
            const user = userQuery.rows[0];
            let stripe_customer_id = user?.stripe_customer_id;
            let needsCustomerUpdate = false;

            // Verify existing customer exists in current Stripe mode
            if (stripe_customer_id) {
                try {
                    const existingCustomer = await stripe.customers.retrieve(stripe_customer_id);
                    if (existingCustomer.deleted) {
                        console.log(`⚠️ Customer ${stripe_customer_id} was deleted, creating new one`);
                        stripe_customer_id = null;
                        needsCustomerUpdate = true;
                    }
                } catch (err) {
                    console.log(`⚠️ Customer ${stripe_customer_id} not found in ${stripeConfig.mode} mode, creating new one`);
                    stripe_customer_id = null;
                    needsCustomerUpdate = true;
                }
            }

            // Create Stripe customer if one doesn't exist or wasn't found in current mode
            if (!stripe_customer_id) {
                console.log(`🔧 Creating new Stripe customer for user ${user_id} (${stripeConfig.mode} mode)`);
                const customer = await stripe.customers.create({
                    email: user.email,
                    payment_method: payment_method_id,
                    metadata: {
                        user_id: user_id,
                        entrepreneur_profile_id: entrepreneur_id,
                        stripe_mode: stripeConfig.mode
                    }
                });

                stripe_customer_id = customer.id;
                needsCustomerUpdate = true;
                console.log(`✅ Stripe customer created: ${stripe_customer_id}`);
            }

            // Save customer ID to database if needed
            if (needsCustomerUpdate) {
                await db.query(
                    'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
                    [stripe_customer_id, user_id]
                );
            }

            const paymentIntent = await stripe.paymentIntents.create({
                amount: 1999,
                currency: 'usd',
                customer: stripe_customer_id,
                payment_method: payment_method_id,
                confirm: true,
                automatic_payment_methods: {
                    enabled: true,
                    allow_redirects: 'never'
                },
                description: `Budget unlock for job ${job_id}`,
                metadata: {
                    user_id: user_id,
                    entrepreneur_id: entrepreneur_id,
                    job_id: job_id,
                    job_title: jobQuery.rows[0].title
                }
            });

            await db.query(
                `INSERT INTO budget_unlocks 
                 (entrepreneur_id, job_id, amount, payment_id, stripe_payment_intent_id, status) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [entrepreneur_id, job_id, 1999, paymentIntent.id, paymentIntent.id, paymentIntent.status]
            );

            console.log(`💰 Budget unlocked for user ${user_id}, job ${job_id}`);

            // Log user activity
            const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
            const userAgent = req.headers['user-agent'];
            await createUserActivityLog(
                user_id,
                ActivityActions.BUDGET_UNLOCKED,
                EntityTypes.JOB,
                job_id,
                { amount: 1999, job_title: jobQuery.rows[0].title },
                ipAddress,
                userAgent
            );

            res.json({
                success: true,
                message: 'Budget unlocked successfully!',
                payment_intent_id: paymentIntent.id,
                amount_paid: '$20.00'
            });

        } catch (error) {
            console.error('❌ Unlock budget error:', error);
            res.status(500).json({
                error: 'Failed to unlock budget',
                message: error.message
            });
        }
    },

    async checkBudgetUnlock(req, res) {
        try {
            const { job_id } = req.params;
            const user_id = req.user.id;

            const entrepreneurQuery = await db.query(
                'SELECT id FROM entrepreneur_profiles WHERE user_id = $1',
                [user_id]
            );

            if (entrepreneurQuery.rows.length === 0) {
                return res.json({ unlocked: false });
            }

            const entrepreneur_id = entrepreneurQuery.rows[0].id;

            const result = await db.query(
                `SELECT * FROM budget_unlocks 
                 WHERE entrepreneur_id = $1 AND job_id = $2 AND status = 'succeeded'`,
                [entrepreneur_id, job_id]
            );

            res.json({
                unlocked: result.rows.length > 0,
                unlock_date: result.rows[0]?.unlocked_at || null,
                amount_paid: result.rows[0] ? '$19.99' : null
            });

        } catch (error) {
            console.error('❌ Check budget unlock error:', error);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * GET BILLING HISTORY
     * GET /api/payments/billing-history
     * Returns subscription payments and budget unlock payments for the user
     */
    async getBillingHistory(req, res) {
        try {
            const user_id = req.user.id;

            // Get entrepreneur profile ID
            const entrepreneurQuery = await db.query(
                'SELECT id FROM entrepreneur_profiles WHERE user_id = $1',
                [user_id]
            );

            if (entrepreneurQuery.rows.length === 0) {
                return res.status(403).json({
                    error: 'Entrepreneur account required',
                    message: 'Only entrepreneurs can view billing history'
                });
            }

            const entrepreneur_id = entrepreneurQuery.rows[0].id;

            // Get subscription history
            const subscriptionQuery = await db.query(
                `SELECT
                    s.id,
                    s.plan_type,
                    s.status,
                    s.created_at,
                    s.current_period_start,
                    s.current_period_end,
                    s.stripe_subscription_id,
                    CASE
                        WHEN s.plan_type = 'premium' THEN 429.00
                        WHEN s.plan_type = 'basic' THEN 250.00
                        WHEN s.plan_type = 'starter' THEN 89.00
                        ELSE 0
                    END as amount,
                    'subscription' as payment_type
                FROM subscriptions s
                WHERE s.user_id = $1
                ORDER BY s.created_at DESC`,
                [user_id]
            );

            // Get budget unlock history with job details
            const budgetUnlocksQuery = await db.query(
                `SELECT
                    bu.id,
                    bu.amount,
                    bu.status,
                    bu.unlocked_at,
                    bu.created_at,
                    bu.stripe_payment_intent_id,
                    j.title as job_title,
                    j.category as job_category,
                    'budget_unlock' as payment_type
                FROM budget_unlocks bu
                JOIN jobs j ON bu.job_id = j.id
                WHERE bu.entrepreneur_id = $1
                ORDER BY bu.created_at DESC`,
                [entrepreneur_id]
            );

            // Format subscription payments
            const subscriptionPayments = subscriptionQuery.rows.map(sub => ({
                id: sub.id,
                type: 'subscription',
                description: `${sub.plan_type === 'premium' ? 'Premium' : sub.plan_type === 'starter' ? 'Starter' : 'Basic'} Plan Subscription`,
                amount: parseFloat(sub.amount),
                status: sub.status,
                date: sub.created_at,
                period_start: sub.current_period_start,
                period_end: sub.current_period_end,
                stripe_id: sub.stripe_subscription_id
            }));

            // Format budget unlock paymentss - Budget unlock costs $20 USD
            const BUDGET_UNLOCK_COST = 19.99;
            const budgetUnlockPayments = budgetUnlocksQuery.rows.map(unlock => ({
                id: unlock.id,
                type: 'budget_unlock',
                description: `Budget Unlock: ${unlock.job_title}`,
                job_title: unlock.job_title,
                job_category: unlock.job_category,
                amount: BUDGET_UNLOCK_COST,
                status: unlock.status,
                date: unlock.unlocked_at || unlock.created_at,
                stripe_id: unlock.stripe_payment_intent_id
            }));

            // Combine and sort by date (newest first)
            const allPayments = [...subscriptionPayments, ...budgetUnlockPayments]
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            // Calculate totals
            const totalSubscriptionSpent = subscriptionPayments
                .filter(p => p.status === 'active' || p.status === 'trialing')
                .reduce((sum, p) => sum + p.amount, 0);

            const totalBudgetUnlockSpent = budgetUnlockPayments
                .filter(p => p.status === 'succeeded')
                .length * BUDGET_UNLOCK_COST;

            res.json({
                payments: allPayments,
                summary: {
                    total_subscription_payments: subscriptionPayments.length,
                    total_budget_unlocks: budgetUnlockPayments.length,
                    total_spent: totalSubscriptionSpent + totalBudgetUnlockSpent,
                    subscription_spent: totalSubscriptionSpent,
                    budget_unlock_spent: totalBudgetUnlockSpent
                }
            });

        } catch (error) {
            console.error('❌ Get billing history error:', error);
            res.status(500).json({ error: error.message });
        }
    },

    async handleWebhook(req, res) {
        const sig = req.headers['stripe-signature'];
        const webhookSecret = stripeConfig.webhookSecret;

        let event;

        try {
            event = stripe.webhooks.constructEvent(
                req.body,
                sig,
                webhookSecret
            );
        } catch (err) {
            console.error('⚠️ Webhook signature verification failed:', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        console.log(`📨 Webhook received: ${event.type}`);

        try {
            switch (event.type) {
                case 'customer.subscription.updated':
                case 'customer.subscription.created':
                    const subscription = event.data.object;
                    await Subscription.upsert({
                        user_id: subscription.metadata.user_id,
                        entrepreneur_profile_id: subscription.metadata.entrepreneur_profile_id,
                        stripe_customer_id: subscription.customer,
                        stripe_subscription_id: subscription.id,
                        plan_type: subscription.metadata.plan_type,
                        status: subscription.status,
                        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
                        current_period_start: new Date(subscription.current_period_start * 1000),
                        current_period_end: new Date(subscription.current_period_end * 1000)
                    });
                    console.log(`✅ Subscription ${subscription.id} updated to status: ${subscription.status}`);

                    // Invalidate subscription cache
                    if (subscription.metadata.user_id) {
                        await cache.del(SUBSCRIPTION_KEYS.status(subscription.metadata.user_id));
                        console.log(`🗑️ Cache invalidated for user ${subscription.metadata.user_id}`);
                    }
                    break;

                case 'customer.subscription.deleted':
                    const deletedSub = event.data.object;
                    await Subscription.updateStatus(deletedSub.id, 'canceled');
                    console.log(`🗑️ Subscription ${deletedSub.id} canceled`);

                    // Invalidate subscription cache
                    if (deletedSub.metadata?.user_id) {
                        await cache.del(SUBSCRIPTION_KEYS.status(deletedSub.metadata.user_id));
                        console.log(`🗑️ Cache invalidated for user ${deletedSub.metadata.user_id}`);
                    }
                    break;

                case 'invoice.payment_failed':
                    const failedInvoice = event.data.object;
                    if (failedInvoice.subscription) {
                        await Subscription.updateStatus(failedInvoice.subscription, 'past_due');
                        console.log(`❌ Payment failed for subscription ${failedInvoice.subscription}`);

                        // Get user_id from subscription and invalidate cache
                        const subData = await db.query(
                            'SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1',
                            [failedInvoice.subscription]
                        );
                        if (subData.rows.length > 0) {
                            await cache.del(SUBSCRIPTION_KEYS.status(subData.rows[0].user_id));
                            console.log(`🗑️ Cache invalidated for user ${subData.rows[0].user_id}`);
                        }
                    }
                    break;

                case 'invoice.payment_succeeded':
                    const succeededInvoice = event.data.object;
                    console.log(`✅ Payment succeeded for subscription ${succeededInvoice.subscription}`);

                    // Invalidate subscription cache on successful payment
                    if (succeededInvoice.subscription) {
                        const subData = await db.query(
                            'SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1',
                            [succeededInvoice.subscription]
                        );
                        if (subData.rows.length > 0) {
                            await cache.del(SUBSCRIPTION_KEYS.status(subData.rows[0].user_id));
                            console.log(`🗑️ Cache invalidated for user ${subData.rows[0].user_id}`);
                        }
                    }
                    break;

                // ============================================
                // STRIPE CONNECT EVENTS
                // ============================================
                case 'account.updated':
                    const account = event.data.object;
                    console.log(`🔗 Connect account updated: ${account.id}`);

                    // Update entrepreneur profile with latest Stripe account status
                    const isOnboarded = account.details_submitted && account.charges_enabled;
                    await db.query(
                        `UPDATE entrepreneur_profiles
                         SET stripe_connect_onboarded = $1,
                             stripe_connect_details_submitted = $2,
                             stripe_connect_charges_enabled = $3,
                             stripe_connect_payouts_enabled = $4,
                             stripe_onboarding_completed_at = CASE
                                 WHEN $1 = true AND stripe_onboarding_completed_at IS NULL
                                 THEN NOW()
                                 ELSE stripe_onboarding_completed_at
                             END,
                             updated_at = NOW()
                         WHERE stripe_connect_account_id = $5`,
                        [
                            isOnboarded,
                            account.details_submitted,
                            account.charges_enabled,
                            account.payouts_enabled,
                            account.id
                        ]
                    );
                    console.log(`✅ Entrepreneur profile updated for Connect account ${account.id}`);
                    break;

                case 'payment_intent.succeeded':
                    const paymentIntent = event.data.object;
                    console.log(`💰 PaymentIntent succeeded: ${paymentIntent.id}`);

                    // Update contract if this payment is for a contract
                    if (paymentIntent.metadata?.contract_id) {
                        await db.query(
                            `UPDATE contracts
                             SET payment_status = 'succeeded',
                                 status = 'paid',
                                 stripe_charge_id = $1,
                                 paid_at = NOW(),
                                 updated_at = NOW()
                             WHERE id = $2`,
                            [paymentIntent.latest_charge, paymentIntent.metadata.contract_id]
                        );

                        // Log contract event
                        await db.query(
                            `INSERT INTO contract_events (contract_id, event_type, actor_role, stripe_event_id, event_data)
                             VALUES ($1, 'payment_succeeded', 'system', $2, $3)`,
                            [
                                paymentIntent.metadata.contract_id,
                                event.id,
                                JSON.stringify({ payment_intent_id: paymentIntent.id, amount: paymentIntent.amount })
                            ]
                        );
                        console.log(`✅ Contract ${paymentIntent.metadata.contract_id} payment recorded`);
                    }
                    break;

                case 'payment_intent.payment_failed':
                    const failedPayment = event.data.object;
                    console.log(`❌ PaymentIntent failed: ${failedPayment.id}`);

                    if (failedPayment.metadata?.contract_id) {
                        await db.query(
                            `UPDATE contracts
                             SET payment_status = 'failed',
                                 updated_at = NOW()
                             WHERE id = $1`,
                            [failedPayment.metadata.contract_id]
                        );

                        // Log contract event
                        await db.query(
                            `INSERT INTO contract_events (contract_id, event_type, actor_role, stripe_event_id, event_data)
                             VALUES ($1, 'payment_failed', 'system', $2, $3)`,
                            [
                                failedPayment.metadata.contract_id,
                                event.id,
                                JSON.stringify({
                                    payment_intent_id: failedPayment.id,
                                    error: failedPayment.last_payment_error?.message
                                })
                            ]
                        );
                        console.log(`❌ Contract ${failedPayment.metadata.contract_id} payment failed`);
                    }
                    break;

                case 'transfer.created':
                    const transfer = event.data.object;
                    console.log(`💸 Transfer created: ${transfer.id}`);

                    if (transfer.metadata?.contract_id) {
                        await db.query(
                            `UPDATE contracts
                             SET stripe_transfer_id = $1,
                                 payout_status = 'processing',
                                 updated_at = NOW()
                             WHERE id = $2`,
                            [transfer.id, transfer.metadata.contract_id]
                        );
                        console.log(`✅ Contract ${transfer.metadata.contract_id} transfer initiated`);
                    }
                    break;

                case 'transfer.paid':
                    const paidTransfer = event.data.object;
                    console.log(`✅ Transfer paid: ${paidTransfer.id}`);

                    // Find contract by transfer ID and update payout status
                    await db.query(
                        `UPDATE contracts
                         SET payout_status = 'completed',
                             payout_completed_at = NOW(),
                             updated_at = NOW()
                         WHERE stripe_transfer_id = $1`,
                        [paidTransfer.id]
                    );
                    break;

                case 'transfer.failed':
                    const failedTransfer = event.data.object;
                    console.log(`❌ Transfer failed: ${failedTransfer.id}`);

                    await db.query(
                        `UPDATE contracts
                         SET payout_status = 'failed',
                             updated_at = NOW()
                         WHERE stripe_transfer_id = $1`,
                        [failedTransfer.id]
                    );
                    break;

                default:
                    console.log(`ℹ️ Unhandled event type: ${event.type}`);
            }

            res.json({ received: true });

        } catch (error) {
            console.error('❌ Webhook handler error:', error);
            res.status(500).json({ error: 'Webhook handler failed' });
        }
    },

    /**
     * UPDATE PAYMENT METHOD
     * PUT /api/payments/payment-method
     * Body: { payment_method_id: 'pm_xxx' }
     * Updates the default payment method for both customer and subscription
     */
    async updatePaymentMethod(req, res) {
        try {
            const { payment_method_id } = req.body;
            const user_id = req.user.id;

            if (!payment_method_id) {
                return res.status(400).json({
                    error: 'Missing required field',
                    required: ['payment_method_id']
                });
            }

            // Get user's Stripe customer ID
            const userQuery = await db.query(
                'SELECT stripe_customer_id FROM users WHERE id = $1',
                [user_id]
            );

            if (!userQuery.rows[0]?.stripe_customer_id) {
                return res.status(400).json({
                    error: 'No Stripe customer found',
                    message: 'You need an active subscription to update payment method'
                });
            }

            const stripe_customer_id = userQuery.rows[0].stripe_customer_id;

            // Get current subscription
            const subscription = await Subscription.findByUserId(user_id);

            if (!subscription) {
                return res.status(404).json({
                    error: 'No subscription found',
                    message: 'You need an active subscription to update payment method'
                });
            }

            // Attach the new payment method to the customer
            await stripe.paymentMethods.attach(payment_method_id, {
                customer: stripe_customer_id
            });

            // Update customer's default payment method
            await stripe.customers.update(stripe_customer_id, {
                invoice_settings: {
                    default_payment_method: payment_method_id
                }
            });

            // Update subscription's default payment method
            await stripe.subscriptions.update(subscription.stripe_subscription_id, {
                default_payment_method: payment_method_id
            });

            console.log(`✅ Payment method updated for user ${user_id}`);

            // If subscription was past_due, try to pay the latest invoice and sync status
            if (subscription.status === 'past_due') {
                try {
                    const stripeSubscription = await stripe.subscriptions.retrieve(
                        subscription.stripe_subscription_id
                    );

                    // Try to pay any open invoice
                    if (stripeSubscription.latest_invoice) {
                        const invoice = await stripe.invoices.retrieve(stripeSubscription.latest_invoice);

                        if (invoice.status === 'open') {
                            await stripe.invoices.pay(stripeSubscription.latest_invoice);
                            console.log(`✅ Retried payment for past_due subscription ${subscription.stripe_subscription_id}`);
                        }
                    }

                    // Always sync the actual Stripe status back to local DB
                    // (invoice may have already been paid by Stripe auto-charge)
                    const currentStatus = stripeSubscription.status;
                    if (currentStatus !== subscription.status) {
                        await db.query(
                            `UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE stripe_subscription_id = $2`,
                            [currentStatus, subscription.stripe_subscription_id]
                        );
                        console.log(`✅ Subscription ${subscription.stripe_subscription_id} synced to ${currentStatus}`);
                    }
                } catch (retryError) {
                    console.error('⚠️ Failed to retry/sync payment:', retryError.message);
                    // Don't fail the request - payment method was still updated
                }
            }

            // Invalidate subscription cache
            await cache.del(SUBSCRIPTION_KEYS.status(user_id));

            // Log user activity
            const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
            const userAgent = req.headers['user-agent'];
            await createUserActivityLog(
                user_id,
                ActivityActions.SUBSCRIPTION_RENEWED,
                EntityTypes.SUBSCRIPTION,
                subscription.stripe_subscription_id,
                { action: 'payment_method_updated' },
                ipAddress,
                userAgent
            );

            res.json({
                success: true,
                message: 'Payment method updated successfully',
                subscription_status: subscription.status
            });

        } catch (error) {
            console.error('❌ Update payment method error:', error);
            res.status(500).json({
                error: 'Failed to update payment method',
                message: error.message
            });
        }
    },

    /**
     * GET STRIPE CONFIG
     * GET /api/payments/stripe-config
     * Returns the current Stripe mode and publishable key for frontend
     */
    async getStripeConfig(req, res) {
        try {
            res.json({
                mode: stripeConfig.mode,
                publishableKey: stripeConfig.publishableKey,
                isLiveMode: stripeConfig.isLiveMode
            });
        } catch (error) {
            console.error('❌ Get Stripe config error:', error);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * QUEUE PROMO CODE FOR AFTER TRIAL
     * POST /api/payments/queue-promo-code
     * Body: { promo_code: string, promo_code_id: uuid }
     * Queues a promo code to be applied when the user's trial ends
     */
    async queuePromoCode(req, res) {
        try {
            const { promo_code, promo_code_id } = req.body;
            const user_id = req.user.id;

            if (!promo_code || !promo_code_id) {
                return res.status(400).json({
                    error: 'Missing required fields',
                    required: ['promo_code', 'promo_code_id']
                });
            }

            // Get current subscription
            const subscription = await Subscription.findByUserId(user_id);

            if (!subscription) {
                return res.status(404).json({ error: 'No subscription found' });
            }

            if (subscription.status !== 'trialing') {
                return res.status(400).json({
                    error: 'Not on trial',
                    message: 'Promo codes can only be queued during an active trial'
                });
            }

            // Validate promo code still exists and is valid
            const promoCodeResult = await PromoCode.validate(promo_code.toUpperCase());
            if (!promoCodeResult.valid) {
                return res.status(400).json({
                    error: 'Invalid promo code',
                    message: promoCodeResult.message || 'This promo code is no longer valid'
                });
            }

            // Queue the promo code
            await db.query(
                `UPDATE subscriptions
                 SET queued_promo_code = $1,
                     queued_promo_code_id = $2,
                     queued_at = NOW(),
                     updated_at = NOW()
                 WHERE user_id = $3`,
                [promo_code.toUpperCase(), promo_code_id, user_id]
            );

            const trialEnd = new Date(subscription.trial_end);

            console.log(`📋 Promo code ${promo_code} queued for user ${user_id}, will apply after trial ends on ${trialEnd.toISOString()}`);

            // Invalidate subscription cache
            const cacheKey = `${SUBSCRIPTION_KEYS.USER_SUBSCRIPTION}:${user_id}`;
            cache.del(cacheKey);

            res.json({
                success: true,
                message: `Promo code queued! It will be automatically applied when your trial ends on ${trialEnd.toLocaleDateString()}.`,
                queued_promo_code: promo_code.toUpperCase(),
                trial_end: subscription.trial_end
            });

        } catch (error) {
            console.error('❌ Queue promo code error:', error);
            res.status(500).json({
                error: 'Failed to queue promo code',
                message: error.message
            });
        }
    },

    /**
     * APPLY PROMO CODE NOW (CANCEL TRIAL)
     * POST /api/payments/apply-promo-now
     * Body: { promo_code: string }
     * Cancels the current trial and applies the promo code immediately
     */
    async applyPromoNow(req, res) {
        try {
            const { promo_code } = req.body;
            const user_id = req.user.id;

            if (!promo_code) {
                return res.status(400).json({
                    error: 'Missing promo code'
                });
            }

            const upperCode = promo_code.toUpperCase().trim();

            // Validate promo code
            const promoCodeResult = await PromoCode.validate(upperCode);
            if (!promoCodeResult.valid) {
                return res.status(400).json({
                    error: 'Invalid promo code',
                    message: promoCodeResult.message || 'This promo code is invalid or has expired'
                });
            }

            if (promoCodeResult.code_type !== 'free_access') {
                return res.status(400).json({
                    error: 'Invalid promo type',
                    message: 'Only free access promo codes can be applied immediately during trial'
                });
            }

            // Get current subscription
            const subscription = await Subscription.findByUserId(user_id);

            if (!subscription) {
                return res.status(404).json({ error: 'No subscription found' });
            }

            if (subscription.status !== 'trialing') {
                return res.status(400).json({
                    error: 'Not on trial',
                    message: 'This action is only available during an active trial'
                });
            }

            // Get entrepreneur profile
            const entrepreneurQuery = await db.query(
                'SELECT id FROM entrepreneur_profiles WHERE user_id = $1',
                [user_id]
            );

            if (entrepreneurQuery.rows.length === 0) {
                return res.status(403).json({
                    error: 'Entrepreneur account required'
                });
            }

            const entrepreneur_profile_id = entrepreneurQuery.rows[0].id;

            // Cancel the Stripe trial subscription if it exists
            if (subscription.stripe_subscription_id && !subscription.stripe_subscription_id.startsWith('promo_') && !subscription.stripe_subscription_id.startsWith('promoter_')) {
                try {
                    await stripe.subscriptions.cancel(subscription.stripe_subscription_id, {
                        prorate: false
                    });
                    console.log(`🗑️ Cancelled Stripe trial subscription: ${subscription.stripe_subscription_id}`);
                } catch (stripeErr) {
                    console.error('⚠️ Error cancelling Stripe subscription:', stripeErr.message);
                    // Continue anyway - the subscription might already be cancelled
                }
            }

            // Create new free subscription from promo code
            const now = new Date();
            const farFuture = new Date('2099-12-31');

            const newSubscription = await Subscription.upsert({
                user_id,
                entrepreneur_profile_id,
                stripe_customer_id: subscription.stripe_customer_id,
                stripe_subscription_id: `promo_free_${promoCodeResult.promoCode.id}_${user_id}`,
                plan_type: 'premium',
                status: 'active',
                trial_end: null,
                current_period_start: now,
                current_period_end: farFuture
            });

            // Clear any queued promo code
            await db.query(
                `UPDATE subscriptions
                 SET queued_promo_code = NULL,
                     queued_promo_code_id = NULL,
                     queued_at = NULL
                 WHERE user_id = $1`,
                [user_id]
            );

            // Record promo code usage
            await PromoCode.recordUse(promoCodeResult.promoCode.id, user_id, newSubscription.id);

            console.log(`✅ Trial cancelled and promo code ${upperCode} applied immediately for user ${user_id}`);

            // Invalidate subscription cache
            const cacheKey = `${SUBSCRIPTION_KEYS.USER_SUBSCRIPTION}:${user_id}`;
            cache.del(cacheKey);

            res.json({
                success: true,
                message: 'Trial cancelled and promo code applied! You now have free premium access.',
                subscription: {
                    id: newSubscription.id,
                    status: 'active',
                    plan_type: 'premium',
                    is_free_access: true,
                    current_period_start: newSubscription.current_period_start,
                    current_period_end: newSubscription.current_period_end
                }
            });

        } catch (error) {
            console.error('❌ Apply promo now error:', error);
            res.status(500).json({
                error: 'Failed to apply promo code',
                message: error.message
            });
        }
    },

    /**
     * GET QUEUED PROMO CODE
     * GET /api/payments/queued-promo
     * Returns any queued promo code for the current user
     */
    async getQueuedPromo(req, res) {
        try {
            const user_id = req.user.id;

            const result = await db.query(
                `SELECT s.queued_promo_code, s.queued_promo_code_id, s.queued_at, s.trial_end,
                        pc.code_type, pc.description
                 FROM subscriptions s
                 LEFT JOIN promo_codes pc ON s.queued_promo_code_id = pc.id
                 WHERE s.user_id = $1 AND s.queued_promo_code IS NOT NULL`,
                [user_id]
            );

            if (result.rows.length === 0) {
                return res.json({ has_queued_promo: false });
            }

            const row = result.rows[0];

            res.json({
                has_queued_promo: true,
                queued_promo: {
                    code: row.queued_promo_code,
                    code_type: row.code_type,
                    description: row.description,
                    queued_at: row.queued_at,
                    will_apply_on: row.trial_end
                }
            });

        } catch (error) {
            console.error('❌ Get queued promo error:', error);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * CANCEL QUEUED PROMO CODE
     * DELETE /api/payments/queued-promo
     * Removes a queued promo code
     */
    async cancelQueuedPromo(req, res) {
        try {
            const user_id = req.user.id;

            await db.query(
                `UPDATE subscriptions
                 SET queued_promo_code = NULL,
                     queued_promo_code_id = NULL,
                     queued_at = NULL,
                     updated_at = NOW()
                 WHERE user_id = $1`,
                [user_id]
            );

            console.log(`🗑️ Cancelled queued promo code for user ${user_id}`);

            // Invalidate subscription cache
            const cacheKey = `${SUBSCRIPTION_KEYS.USER_SUBSCRIPTION}:${user_id}`;
            cache.del(cacheKey);

            res.json({
                success: true,
                message: 'Queued promo code cancelled'
            });

        } catch (error) {
            console.error('❌ Cancel queued promo error:', error);
            res.status(500).json({ error: error.message });
        }
    }
};

export default PaymentController;