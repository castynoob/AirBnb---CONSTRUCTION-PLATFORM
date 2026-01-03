// ============================================
// GEOCODE PROXY ROUTES
// Proxies requests to Nominatim OpenStreetMap
// to avoid CORS issues in the browser
// ============================================

import express from 'express';

const router = express.Router();

/**
 * @route   GET /api/geocode/search
 * @desc    Search for addresses using Nominatim
 * @access  Public
 * @query   { q } - Search query string
 */
router.get('/geocode/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 3 characters'
      });
    }

    // Make server-to-server request to Nominatim (no CORS issues)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'INTERVOS Construction Platform (contact@intervos.com)',
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data = await response.json();

    res.json({
      success: true,
      results: data
    });
  } catch (error) {
    console.error('Geocode proxy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch address suggestions',
      error: error.message
    });
  }
});

export default router;
