const express = require('express');
const router = express.Router();
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const verifyFirebaseToken = require('../middleware/auth');

function buildConvClient(conv, currentUserId) {
  const otherId = conv.participants.find(
    p => p._id.toString() !== currentUserId.toString()
  );
  const person = otherId || conv.participants[0];
  const unreadEntry = conv.unreadCounts.find(
    u => u.userId.toString() === currentUserId.toString()
  );
  const unread = unreadEntry ? unreadEntry.count : 0;
  const last = conv.lastMessage;

  let sub = 'Active recently';
  if (person.online) sub = 'Active now';
  if (conv.isGroup) sub = `${conv.participants.length} members`;

  return {
    id: conv._id.toString(),
    person: person.toClientJSON ? person.toClientJSON() : { id: person._id?.toString() },
    unread,
    time: formatTime(last?.sentAt),
    sub,
    preview: buildPreview(last, conv.participants, currentUserId),
    seen: unread === 0,
    group: conv.isGroup || false,
    groupName: conv.groupName,
  };
}

function buildPreview(last, participants, currentUserId) {
  if (!last?.sentAt) return '';
  const isMe = last.senderId?.toString() === currentUserId.toString();
  const prefix = isMe ? 'You: ' : '';
  if (last.kind === 'image') return `${prefix}📷 Photo`;
  if (last.kind === 'voice') return `${prefix}🎤 Voice message`;
  return `${prefix}${last.text || ''}`;
}

function formatTime(date) {
  if (!date) return '';
  const now = new Date();
  const d = new Date(date);
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (diffDays < 7) return days[d.getDay()];
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// GET /api/conversations
router.get('/', verifyFirebaseToken, async (req, res) => {
  try {
    const convs = await Conversation.find({ participants: req.user._id })
      .populate('participants', 'name handle initials g avatarUrl online lastSeen activeStatus readReceipts firebaseUid')
      .sort({ updatedAt: -1 });
    res.json(convs.map(c => buildConvClient(c, req.user._id)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/conversations — get-or-create DM
router.post('/', verifyFirebaseToken, async (req, res) => {
  const { participantId } = req.body;
  if (!participantId) return res.status(400).json({ error: 'participantId required' });
  try {
    const other = await User.findById(participantId);
    if (!other) return res.status(404).json({ error: 'User not found' });

    let conv = await Conversation.findOne({
      participants: { $all: [req.user._id, other._id], $size: 2 },
      isGroup: false,
    }).populate('participants', 'name handle initials g avatarUrl online lastSeen activeStatus readReceipts firebaseUid');

    if (!conv) {
      conv = await Conversation.create({
        participants: [req.user._id, other._id],
        unreadCounts: [
          { userId: req.user._id, count: 0 },
          { userId: other._id, count: 0 },
        ],
      });
      conv = await Conversation.findById(conv._id).populate(
        'participants', 'name handle initials g avatarUrl online lastSeen activeStatus readReceipts firebaseUid'
      );
    }

    res.json(buildConvClient(conv, req.user._id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conversations/:id
router.get('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const conv = await Conversation.findOne({
      _id: req.params.id,
      participants: req.user._id,
    }).populate('participants', 'name handle initials g avatarUrl online lastSeen activeStatus readReceipts firebaseUid');
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    res.json(buildConvClient(conv, req.user._id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/conversations/:id/seen — reset unread count
router.patch('/:id/seen', verifyFirebaseToken, async (req, res) => {
  try {
    await Conversation.updateOne(
      { _id: req.params.id, 'unreadCounts.userId': req.user._id },
      { $set: { 'unreadCounts.$.count': 0 } }
    );
    await Message.updateMany(
      { conversationId: req.params.id, seenBy: { $ne: req.user._id } },
      { $addToSet: { seenBy: req.user._id } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, buildConvClient, formatTime };
