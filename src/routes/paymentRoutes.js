import express from 'express';
const router = express.Router();

import PaymentController from '../controllers/paymentController.js';
import PromoterController from '../controllers/promoterController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireEntrepreneur } from '../middleware/roleMiddleware.js';
import { requireSubscription } from '../middleware/subscriptionMiddleware.js';

// ============================================
// SUBSCRIPTION ROUTES
// ============================================

router.post('/create-subscription', 
    authenticateToken,
    requireEntrepreneur,
    PaymentController.createSubscription
);

router.get('/subscription', 
    authenticateToken,
    requireEntrepreneur,
    PaymentController.getSubscription
);

router.post('/cancel-subscription',
    authenticateToken,
    requireEntrepreneur,
    requireSubscription,
    PaymentController.cancelSubscription
);

// Swap the price on an existing Stripe subscription. Used by SubscriptionModal
// when the user is on a plan already — creating a new subscription would 400.
router.post('/change-plan',
    authenticateToken,
    requireEntrepreneur,
    requireSubscription,
    PaymentController.changePlan
);

router.put('/payment-method',
    authenticateToken,
    requireEntrepreneur,
    PaymentController.updatePaymentMethod
);

// ============================================
// BUDGET UNLOCK ROUTES
// ============================================

router.post('/unlock-budget', 
    authenticateToken,
    requireEntrepreneur,
    requireSubscription,
    PaymentController.unlockBudget
);

router.get('/budget-status/:job_id',
    authenticateToken,
    requireEntrepreneur,
    PaymentController.checkBudgetUnlock
);

// ============================================
// BILLING HISTORY ROUTE
// ============================================

router.get('/billing-history',
    authenticateToken,
    requireEntrepreneur,
    PaymentController.getBillingHistory
);

// ============================================
// PROMO CODE VALIDATION (PUBLIC - No auth required)
// ============================================

router.post('/validate-promo-code', PromoterController.validatePromoCode);

// ============================================
// QUEUED PROMO CODE ROUTES (During trial)
// ============================================

// Queue a promo code to apply after trial ends
router.post('/queue-promo-code',
    authenticateToken,
    requireEntrepreneur,
    PaymentController.queuePromoCode
);

// Apply promo code immediately (cancels trial)
router.post('/apply-promo-now',
    authenticateToken,
    requireEntrepreneur,
    PaymentController.applyPromoNow
);

// Get queued promo code
router.get('/queued-promo',
    authenticateToken,
    requireEntrepreneur,
    PaymentController.getQueuedPromo
);

// Cancel queued promo code
router.delete('/queued-promo',
    authenticateToken,
    requireEntrepreneur,
    PaymentController.cancelQueuedPromo
);

// ============================================
// STRIPE CONFIG ROUTE (PUBLIC - No auth required)
// ============================================

router.get('/stripe-config', PaymentController.getStripeConfig);
router.get('/tax-config', PaymentController.getTaxConfig);

// ============================================
// WEBHOOK ROUTE — mounted directly in server.js, NOT here.
// Stripe requires the raw body (Buffer) for signature verification, and
// this router is mounted after express.json() runs — so it would parse the
// body first and break constructEvent(). See server.js:~132 for the mount.
// ============================================

export default router;