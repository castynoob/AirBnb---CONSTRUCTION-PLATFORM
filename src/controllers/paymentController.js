import stripe from '../config/stripe.js';
import Subscription from '../models/subscriptionModel.js';
import db from '../config/db.js';
import * as cache from '../config/cache.js';
import { SUBSCRIPTION_KEYS } from '../utils/cacheKeys.js';

// ✅ UPDATED - Add price_id for each plan
// TODO: Replace these with your actual Stripe price IDs from dashboard
// ✅ TEMPORARY - These are Stripe's built-in test prices
const PLANS = {
    basic: {
        price_id: 'price_1SJU5t5Dbv5aHRPT6Q3phUCC',  // ✅ Your actual price ID
        name: 'Basic Entrepreneur Plan',
        price: 250,
        interval: 'month',
        bids_limit: 30
    },
    premium: {
        price_id: 'price_1SJU5t5Dbv5aHRPT6Q3phUCC',  // Use same for now to test
        name: 'Premium Entrepreneur Plan',
        price: 429,
        interval: 'month',
        bids_limit: -1
    }
};

const PaymentController = {
    
    /**
     * CREATE SUBSCRIPTION
     * POST /api/payments/create-subscription
     * Body: { plan_type: 'basic' | 'premium', payment_method_id: 'pm_xxx' }
     */
    async createSubscription(req, res) {
        try {
            const { plan_type, payment_method_id } = req.body;
            const user_id = req.user.id;

            if (!plan_type || !payment_method_id) {
                return res.status(400).json({ 
                    error: 'Missing required fields',
                    required: ['plan_type', 'payment_method_id']
                });
            }

            if (!['basic', 'premium'].includes(plan_type)) {
                return res.status(400).json({ 
                    error: 'Invalid plan type',
                    message: 'Plan must be "basic" or "premium"'
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
            if (user.stripe_customer_id) {
                customer = await stripe.customers.retrieve(user.stripe_customer_id);
            } else {
                customer = await stripe.customers.create({
                    email: user.email,
                    payment_method: payment_method_id,
                    invoice_settings: {
                        default_payment_method: payment_method_id
                    },
                    metadata: {
                        user_id: user_id,
                        entrepreneur_profile_id: entrepreneur_profile_id
                    }
                });

                await db.query(
                    'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
                    [customer.id, user_id]
                );
            }

            const plan = PLANS[plan_type];
            
            console.log('🔍 Creating subscription with price:', plan.price_id);

            const subscription = await stripe.subscriptions.create({
                customer: customer.id,
                items: [{ 
                    price: plan.price_id
                }],
                trial_period_days: 14,
                payment_settings: {
                    payment_method_types: ['card'],
                    save_default_payment_method: 'on_subscription'
                },
                expand: ['latest_invoice.payment_intent'],
                metadata: {
                    user_id: user_id,
                    entrepreneur_profile_id: entrepreneur_profile_id,
                    plan_type: plan_type
                }
            });

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

            await Subscription.upsert({
                user_id,
                entrepreneur_profile_id,
                stripe_customer_id: customer.id,
                stripe_subscription_id: subscription.id,
                plan_type,
                status: subscription.status,
                trial_end: trial_end_date,
                current_period_start: period_start_date,
                current_period_end: period_end_date
            });

            if (plan_type === 'basic') {
                await db.query(
                    `INSERT INTO bid_counts (entrepreneur_profile_id, period_start, period_end, bids_used, bids_limit)
                    VALUES ($1, $2, $3, 0, 30)`,
                    [
                        entrepreneur_profile_id,
                        period_start_date,
                        period_end_date
                    ]
                );
            }

            console.log(`✅ Subscription created for user ${user_id}: ${plan_type} plan`);

            res.json({
                success: true,
                message: 'Subscription created successfully! Your 14-day free trial has started.',
                subscription: {
                    id: subscription.id,
                    status: subscription.status,
                    plan_type,
                    trial_end: subscription.trial_end,
                    current_period_end: subscription.current_period_end,
                    is_trial: subscription.status === 'trialing',
                    price: plan_type === 'basic' ? '$250/month' : '$429/month'
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
            if (subscription.plan_type === 'basic' && subscription.entrepreneur_profile_id) {
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
            }

            res.json({
                hasSubscription: true,
                subscription: {
                    plan_type: subscription.plan_type,
                    status: subscription.status,
                    trial_end: subscription.trial_end,
                    trial_days_remaining: trialDaysRemaining,
                    current_period_end: subscription.current_period_end,
                    cancel_at_period_end: subscription.cancel_at_period_end,
                    bids: bidsInfo,
                    is_trial: subscription.status === 'trialing',
                    price: subscription.plan_type === 'basic' ? '$250/month' : '$429/month'
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

            const updatedSub = await stripe.subscriptions.update(
                subscription.stripe_subscription_id,
                { cancel_at_period_end: true }
            );

            await Subscription.cancel(subscription.stripe_subscription_id);

            console.log(`🗑️ Subscription canceled for user ${user_id}`);

            res.json({
                success: true,
                message: 'Subscription will be canceled at the end of your billing period',
                cancel_at: updatedSub.cancel_at,
                access_until: subscription.current_period_end
            });

        } catch (error) {
            console.error('❌ Cancel subscription error:', error);
            res.status(500).json({ error: error.message });
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
                'SELECT stripe_customer_id FROM users WHERE id = $1',
                [user_id]
            );
            const stripe_customer_id = userQuery.rows[0]?.stripe_customer_id;

            if (!stripe_customer_id) {
                return res.status(400).json({ 
                    error: 'No payment method on file',
                    message: 'Please add a payment method before unlocking budgets'
                });
            }

            const paymentIntent = await stripe.paymentIntents.create({
                amount: 2000,
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
                [entrepreneur_id, job_id, 2000, paymentIntent.id, paymentIntent.id, paymentIntent.status]
            );

            console.log(`💰 Budget unlocked for user ${user_id}, job ${job_id}`);

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
                amount_paid: result.rows[0] ? '$20.00' : null
            });

        } catch (error) {
            console.error('❌ Check budget unlock error:', error);
            res.status(500).json({ error: error.message });
        }
    },

    async handleWebhook(req, res) {
        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

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

                default:
                    console.log(`ℹ️ Unhandled event type: ${event.type}`);
            }

            res.json({ received: true });

        } catch (error) {
            console.error('❌ Webhook handler error:', error);
            res.status(500).json({ error: 'Webhook handler failed' });
        }
    }
};

export default PaymentController;