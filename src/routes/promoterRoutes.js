import express from 'express';
import PromoterController from '../controllers/promoterController.js';
import { authenticateAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

// ============================================
// ADMIN ROUTES (require admin authentication)
// ============================================

// Get promoter stats (must be before /:id route)
router.get('/stats', authenticateAdmin, PromoterController.getPromoterStats);

// Create promoter
router.post('/', authenticateAdmin, PromoterController.createPromoter);

// Get all promoters
router.get('/', authenticateAdmin, PromoterController.getPromoters);

// Get promoter by ID
router.get('/:id', authenticateAdmin, PromoterController.getPromoter);

// Update promoter
router.put('/:id', authenticateAdmin, PromoterController.updatePromoter);

// Deactivate promoter
router.delete('/:id', authenticateAdmin, PromoterController.deactivatePromoter);

// Reactivate promoter
router.post('/:id/reactivate', authenticateAdmin, PromoterController.reactivatePromoter);

// Get promoter referrals
router.get('/:id/referrals', authenticateAdmin, PromoterController.getPromoterReferrals);

export default router;
