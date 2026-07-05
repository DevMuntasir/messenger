const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const verifyFirebaseToken = require('../middleware/auth');

// GET /api/messages/:conversationId?limit=30&before=messageId
router.get('/:conversationId', verifyFirebaseToken, async (req, res) => {
  const { limit = 30, before } = req.query;
  try {
    const conv = await Conversation.findOne({
      _id: req.params.conversationId,
      participants: req.user._id,
    });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const filter = {
      conversationId: req.params.conversationId,
      deleted: false,
    };
    if (before) {
      const ref = await Message.findById(before);
      if (ref) filter.createdAt = { $lt: ref.createdAt };
    }

    const msgs = await Message.find(filter)
      .populate('senderId', 'name handle initials g avatarUrl online')
      .populate('replyTo', 'kind text senderId')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(msgs.reverse().map(m => m.toClientJSON(req.user._id)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/:conversationId — REST fallback (normally via socket)
router.post('/:conversationId', verifyFirebaseToken, async (req, res) => {
  const { kind, text, imageUrl, voiceUrl, voiceDuration, replyTo } = req.body;
  if (!kind) return res.status(400).json({ error: 'kind required' });
  try {
    const conv = await Conversation.findOne({
      _id: req.params.conversationId,
      participants: req.user._id,
    });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const msg = await Message.create({
      conversationId: req.params.conversationId,
      senderId: req.user._id,
      kind,
      text: text || null,
      imageUrl: imageUrl || null,
      voiceUrl: voiceUrl || null,
      voiceDuration: voiceDuration || null,
      replyTo: replyTo || null,
      seenBy: [req.user._id],
    });

    const previewText = kind === 'image' ? '📷 Photo' : kind === 'voice' ? '🎤 Voice message' : text;
    await Conversation.findByIdAndUpdate(req.params.conversationId, {
      lastMessage: { text: previewText, kind, senderId: req.user._id, sentAt: msg.createdAt },
      updatedAt: msg.createdAt,
      $inc: conv.participants
        .filter(p => p.toString() !== req.user._id.toString())
        .reduce((acc, p) => ({ ...acc, [`unreadCounts.${conv.unreadCounts.findIndex(u => u.userId.toString() === p.toString())}.count`]: 1 }), {}),
    });

    await msg.populate('senderId', 'name handle initials g avatarUrl online');
    res.status(201).json(msg.toClientJSON(req.user._id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/messages/:messageId/reaction
router.patch('/:messageId/reaction', verifyFirebaseToken, async (req, res) => {
  const { emoji } = req.body;
  try {
    const msg = await Message.findOneAndUpdate(
      { _id: req.params.messageId },
      { reaction: emoji || null },
      { new: true }
    ).populate('senderId', 'name handle initials g avatarUrl online');
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    res.json(msg.toClientJSON(req.user._id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/messages/:messageId — soft delete
router.delete('/:messageId', verifyFirebaseToken, async (req, res) => {
  try {
    const msg = await Message.findOneAndUpdate(
      { _id: req.params.messageId, senderId: req.user._id },
      { deleted: true },
      { new: true }
    );
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
