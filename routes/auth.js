const express = require('express');
const router = express.Router();
const admin = require('../config/firebase');
const User = require('../models/User');
const verifyFirebaseToken = require('../middleware/auth');

// POST /api/auth/register — called after Firebase signup
router.post('/register', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }
  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { name, handle, g } = req.body;
  if (!name || !handle) {
    return res.status(400).json({ error: 'name and handle are required' });
  }

  const initials = name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3);

  try {
    let user = await User.findOne({ firebaseUid: decoded.uid });
    if (user) return res.json({ user: user.toClientJSON() });

    const handleExists = await User.findOne({ handle: handle.toLowerCase() });
    if (handleExists) {
      return res.status(409).json({ error: 'Handle already taken' });
    }

    user = await User.create({
      firebaseUid: decoded.uid,
      name: name.trim(),
      handle: handle.toLowerCase().trim(),
      initials,
      g: g || 'A',
    });

    res.status(201).json({ user: user.toClientJSON() });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Handle already taken' });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', verifyFirebaseToken, (req, res) => {
  res.json({ user: req.user.toClientJSON() });
});

// PATCH /api/auth/me
router.patch('/me', verifyFirebaseToken, async (req, res) => {
  const allowed = ['name', 'handle', 'g', 'activeStatus', 'readReceipts', 'pushToken'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (updates.name) {
    updates.initials = updates.name
      .split(' ')
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 3);
  }
  try {
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json({ user: user.toClientJSON() });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Handle already taken' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
