import Stripe from 'stripe';

// Get Stripe mode from environment (default to 'test' for safety)
const STRIPE_MODE = process.env.STRIPE_MODE || 'test';
const isLiveMode = STRIPE_MODE === 'live';

// Select keys based on mode
const STRIPE_SECRET_KEY = isLiveMode
    ? process.env.STRIPE_SECRET_KEY_LIVE
    : process.env.STRIPE_SECRET_KEY_TEST;

const STRIPE_PUBLISHABLE_KEY = isLiveMode
    ? process.env.STRIPE_PUBLISHABLE_KEY_LIVE
    : process.env.STRIPE_PUBLISHABLE_KEY_TEST;

const STRIPE_WEBHOOK_SECRET = isLiveMode
    ? process.env.STRIPE_WEBHOOK_SECRET_LIVE
    : process.env.STRIPE_WEBHOOK_SECRET_TEST;

// Price IDs based on mode
const STRIPE_PRICE_ID_STARTER = isLiveMode
    ? process.env.STRIPE_PRICE_ID_STARTER_LIVE
    : process.env.STRIPE_PRICE_ID_STARTER_TEST;

const STRIPE_PRICE_ID_BASIC = isLiveMode
    ? process.env.STRIPE_PRICE_ID_BASIC_LIVE
    : process.env.STRIPE_PRICE_ID_BASIC_TEST;

const STRIPE_PRICE_ID_PREMIUM = isLiveMode
    ? process.env.STRIPE_PRICE_ID_PREMIUM_LIVE
    : process.env.STRIPE_PRICE_ID_PREMIUM_TEST;

// Log current mode on startup
console.log(`💳 Stripe initialized in ${STRIPE_MODE.toUpperCase()} mode`);

// Initialize Stripe with the appropriate secret key
const stripe = Stripe(STRIPE_SECRET_KEY);

// Export configuration for use in other files
export const stripeConfig = {
    mode: STRIPE_MODE,
    isLiveMode,
    publishableKey: STRIPE_PUBLISHABLE_KEY,
    webhookSecret: STRIPE_WEBHOOK_SECRET,
    priceIds: {
        starter: STRIPE_PRICE_ID_STARTER,
        basic: STRIPE_PRICE_ID_BASIC,
        premium: STRIPE_PRICE_ID_PREMIUM
    }
};

export default stripe;
