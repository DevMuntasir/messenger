const express = require('express');
const router = express.Router();
const verifyFirebaseToken = require('../middleware/auth');

// Proxy for the RedGifs API. Their API only allows browser requests from
// localhost / redgifs.com origins (CORS), so the web app can't call it
// directly in production — we fetch server-side instead. The temporary
// token is bound to the requesting IP + user agent, which is fine here
// because this server both fetches the token and makes the API calls.
const API = 'https://api.redgifs.com';

let cachedToken = null;

async function getToken(force = false) {
  if (cachedToken && !force) return cachedToken;
  const res = await fetch(`${API}/v2/auth/temporary`);
  if (!res.ok) throw new Error(`RedGifs auth failed: ${res.status}`);
  cachedToken = (await res.json()).token;
  return cachedToken;
}

async function rgGet(path, retry = true) {
  const token = await getToken();
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && retry) {
    await getToken(true);
    return rgGet(path, false);
  }
  if (!res.ok) throw new Error(`RedGifs request failed: ${res.status}`);
  return res.json();
}

// GET /api/gifs/trending
router.get('/trending', verifyFirebaseToken, async (_req, res) => {
  try {
    res.json(await rgGet('/v2/explore/trending-gifs'));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/gifs/search?q=cats
router.get('/search', verifyFirebaseToken, async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'Missing q parameter' });
  try {
    const params = new URLSearchParams({ search_text: q, order: 'trending', count: '30', page: '1' });
    res.json(await rgGet(`/v2/gifs/search?${params}`));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
