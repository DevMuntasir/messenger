const express = require('express');
const router = express.Router();
const User = require('../models/User');
const verifyFirebaseToken = require('../middleware/auth');

// GET /api/users/search?q=
router.get('/search', verifyFirebaseToken, async (req, res) => {
  console.log('🔍 [Backend] GET /api/users/search called');
  const q = req.query.q?.trim() || '';
  const currentUserId = req.user._id;
  console.log('🔍 [Backend] Query:', q, 'CurrentUserId:', currentUserId);
  const filter = { _id: { $ne: currentUserId } };
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { handle: { $regex: q, $options: 'i' } },
    ];
  }
  try {
    const users = await User.find(filter).limit(50).sort({ name: 1 });
    console.log('🔍 [Backend] Found', users.length, 'users');
    res.json(users.map(u => u.toClientJSON() || {}));
  } catch (err) {
    console.error('❌ [Backend] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id
router.get('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.toClientJSON());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
