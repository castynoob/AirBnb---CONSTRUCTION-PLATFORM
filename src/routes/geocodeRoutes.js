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

    // Add timeout and retry logic for Nominatim
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      // Make server-to-server request to Nominatim (no CORS issues)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'INTERVOS-Construction-Platform/1.0 (https://intervos.com; contact@intervos.com)',
            'Accept': 'application/json',
            'Accept-Language': 'en-CA,en;q=0.9,fr-CA;q=0.8,fr;q=0.7'
          },
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`Nominatim API returned ${response.status}`);
        // Return empty results instead of error (graceful degradation)
        return res.json({
          success: true,
          results: [],
          message: 'Address service temporarily unavailable'
        });
      }

      const data = await response.json();

      res.json({
        success: true,
        results: data
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        console.error('Geocode request timed out');
      } else {
        console.error('Geocode fetch error:', fetchError.message);
      }

      // Return empty results instead of 500 error (graceful degradation)
      return res.json({
        success: true,
        results: [],
        message: 'Address service temporarily unavailable'
      });
    }
  } catch (error) {
    console.error('Geocode proxy error:', error);
    // Return empty results instead of 500 error
    res.json({
      success: true,
      results: [],
      message: 'Address service temporarily unavailable'
    });
  }
});

export default router;
