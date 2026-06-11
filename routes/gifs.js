const express = require('express');
const router = express.Router();
const verifyFirebaseToken = require('../middleware/auth');

// Proxy for the Tenor API.
const API = 'https://api.tenor.com/v2';
const API_KEY = 'AIzaSyDyWJsO-awYAL1JNnNEUXMq9ykJqXfMWGQ'; // Tenor API key

async function tenorGet(path, params = {}) {
  const searchParams = new URLSearchParams({ key: API_KEY, ...params });
  const url = `${API}${path}?${searchParams}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tenor request failed: ${res.status}`);
  return res.json();
}

// GET /api/gifs/featured?contentfilter=moderate
router.get('/featured', verifyFirebaseToken, async (req, res) => {
  try {
    const params = {
      limit: '30',
      contentfilter: req.query.contentfilter || 'moderate',
    };
    res.json(await tenorGet('/featured', params));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/gifs/trending - alias for /featured (backward compatibility)
router.get('/trending', verifyFirebaseToken, async (req, res) => {
  try {
    const params = {
      limit: '30',
      contentfilter: req.query.contentfilter || 'moderate',
    };
    res.json(await tenorGet('/featured', params));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/gifs/search?q=cats&contentfilter=moderate
router.get('/search', verifyFirebaseToken, async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'Missing q parameter' });
  try {
    const params = {
      q,
      limit: '30',
      contentfilter: req.query.contentfilter || 'moderate',
    };
    res.json(await tenorGet('/search', params));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
