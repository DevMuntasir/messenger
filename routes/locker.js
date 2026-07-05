// Locker — private per-user media vault backed by Cloudinary.
const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const verifyFirebaseToken = require('../middleware/auth');
const LockerItem = require('../models/LockerItem');

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// GET /api/locker — list current user's items, newest first
router.get('/', verifyFirebaseToken, async (req, res) => {
  try {
    const items = await LockerItem.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(items.map(i => i.toClientJSON()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/locker/upload — multipart image or video
router.post('/upload', verifyFirebaseToken, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  const isVideo = (req.file.mimetype || '').startsWith('video/');
  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'halo-locker',
          resource_type: isVideo ? 'video' : 'image',
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.end(req.file.buffer);
    });

    const item = await LockerItem.create({
      userId: req.user._id,
      kind: isVideo ? 'video' : 'image',
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width || null,
      height: result.height || null,
      duration: result.duration || null,
      bytes: result.bytes || null,
    });
    res.json(item.toClientJSON());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/locker/:id — remove item (Cloudinary + DB)
router.delete('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const item = await LockerItem.findOne({ _id: req.params.id, userId: req.user._id });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    try {
      await cloudinary.uploader.destroy(item.publicId, {
        resource_type: item.kind === 'video' ? 'video' : 'image',
      });
    } catch (cloudErr) {
      // Don't block deletion if Cloudinary cleanup fails
      console.error('Cloudinary destroy failed:', cloudErr.message);
    }

    await item.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
