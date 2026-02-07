import express from 'express';
import PromoCodeController from '../controllers/promoCodeController.js';
import { authenticateAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

// ============================================
// ADMIN ROUTES (require admin authentication)
// ============================================

// Get statistics - must come before /:id
router.get('/stats', authenticateAdmin, PromoCodeController.getStats);

// Create new promo code
router.post('/', authenticateAdmin, PromoCodeController.create);

// Get all promo codes
router.get('/', authenticateAdmin, PromoCodeController.getAll);

// Get single promo code
router.get('/:id', authenticateAdmin, PromoCodeController.getById);

// Get promo code uses (who used it)
router.get('/:id/uses', authenticateAdmin, PromoCodeController.getUses);

// Deactivate promo code
router.delete('/:id', authenticateAdmin, PromoCodeController.deactivate);

// Reactivate promo code
router.post('/:id/reactivate', authenticateAdmin, PromoCodeController.reactivate);

// Delete promo code (only if never used)
router.delete('/:id/delete', authenticateAdmin, PromoCodeController.delete);

export default router;
