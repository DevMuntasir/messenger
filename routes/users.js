const express = require('express');
const router = express.Router();
const User = require('../models/User');
const verifyFirebaseToken = require('../middleware/auth');

// GET /api/users/search?q=
router.get('/search', verifyFirebaseToken, async (req, res) => {
  const q = req.query.q?.trim() || '';
  const currentUserId = req.user._id;
  const filter = { _id: { $ne: currentUserId } };
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { handle: { $regex: q, $options: 'i' } },
    ];
  }
  try {
    const users = await User.find(filter).limit(50).sort({ name: 1 });
    res.json(users.map(u => u.toClientJSON()));
  } catch (err) {
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
