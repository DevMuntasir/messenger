const admin = require('../config/firebase');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

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

function setupSocketHandlers(io) {
  // Auth middleware — verify Firebase token on every socket connection
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      let user = await User.findOne({ firebaseUid: decoded.uid });

      // Auto-create user if doesn't exist
      if (!user) {
        try {
          const firebaseUser = await admin.auth().getUser(decoded.uid);
          user = await User.create({
            firebaseUid: decoded.uid,
            email: firebaseUser.email,
            name: firebaseUser.displayName || 'User',
            handle: firebaseUser.email.split('@')[0].toLowerCase() + Math.random().toString(36).slice(2, 5),
            initials: (firebaseUser.displayName || 'U')
              .split(' ')
              .map(w => w[0])
              .join('')
              .toUpperCase()
              .slice(0, 3),
            photoURL: firebaseUser.photoURL,
          });
        } catch (err) {
          console.error('Failed to create user:', err);
          return next(new Error('Failed to create user: ' + err.message));
        }
      }

      socket.user = user;
      next();
    } catch (err) {
      console.error('Token verification failed:', err);
      next(new Error('Invalid token: ' + err.message));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.user;
    console.log(`User ${user._id} connected via socket ${socket.id}`);

    // Mark user online
    try {
      await User.findByIdAndUpdate(user._id, { online: true });
      socket.broadcast.emit('presence_update', {
        userId: user._id.toString(),
        online: true,
        lastSeen: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error marking user online:', err);
    }

    // Global error handler
    socket.on('error', (err) => {
      console.error('Socket error:', err);
    });

    // Join rooms for all conversations
    socket.on('join_conversations', async ({ conversationIds }) => {
      if (!Array.isArray(conversationIds)) return;
      for (const id of conversationIds) {
        const conv = await Conversation.findOne({ _id: id, participants: user._id });
        if (conv) socket.join(id);
      }
    });

    socket.on('leave_conversation', ({ conversationId }) => {
      socket.leave(conversationId);
    });

    // Send message
    socket.on('send_message', async ({ conversationId, kind, text, imageUrl, voiceUrl, voiceDuration }) => {
      try {
        const conv = await Conversation.findOne({ _id: conversationId, participants: user._id });
        if (!conv) {
          return socket.emit('error', {
            event: 'send_message',
            message: 'Conversation not found or access denied',
            code: 'CONV_NOT_FOUND'
          });
        }

        const msg = await Message.create({
          conversationId,
          senderId: user._id,
          kind,
          text: text || null,
          imageUrl: imageUrl || null,
          voiceUrl: voiceUrl || null,
          voiceDuration: voiceDuration || null,
          seenBy: [user._id],
        });

        const previewText = kind === 'image' ? '📷 Photo' : kind === 'voice' ? '🎤 Voice message' : text;

        // Increment unread for other participants, update lastMessage
        const updates = { updatedAt: msg.createdAt, 'lastMessage.text': previewText, 'lastMessage.kind': kind, 'lastMessage.senderId': user._id, 'lastMessage.sentAt': msg.createdAt };
        const bulkOps = conv.participants
          .filter(p => p.toString() !== user._id.toString())
          .map(p => ({
            updateOne: {
              filter: { _id: conversationId, 'unreadCounts.userId': p },
              update: { $inc: { 'unreadCounts.$.count': 1 }, ...updates },
            },
          }));
        if (bulkOps.length) await Conversation.bulkWrite(bulkOps);
        await Conversation.findByIdAndUpdate(conversationId, updates);

        await msg.populate('senderId', 'name handle initials g avatarUrl online');
        const msgData = msg.toClientJSON(user._id);

        // Fetch updated conversation for unread counts
        const updatedConv = await Conversation.findById(conversationId);

        io.to(conversationId).emit('message_received', {
          message: msgData,
          conversation: {
            id: conversationId,
            lastMessage: updatedConv.lastMessage,
            unreadCounts: updatedConv.unreadCounts,
          },
        });
      } catch (err) {
        console.error('Send message error:', err);
        socket.emit('error', {
          event: 'send_message',
          message: err.message,
          code: 'SEND_MESSAGE_FAILED'
        });
      }
    });

    // Typing indicators
    socket.on('typing_start', ({ conversationId }) => {
      socket.to(conversationId).emit('typing', {
        conversationId,
        userId: user._id.toString(),
        userName: user.name,
        isTyping: true,
      });
    });

    socket.on('typing_stop', ({ conversationId }) => {
      socket.to(conversationId).emit('typing', {
        conversationId,
        userId: user._id.toString(),
        userName: user.name,
        isTyping: false,
      });
    });

    // Mark messages seen
    socket.on('mark_seen', async ({ conversationId, messageIds }) => {
      try {
        await Message.updateMany(
          { _id: { $in: messageIds }, seenBy: { $ne: user._id } },
          { $addToSet: { seenBy: user._id } }
        );
        await Conversation.updateOne(
          { _id: conversationId, 'unreadCounts.userId': user._id },
          { $set: { 'unreadCounts.$.count': 0 } }
        );
        socket.to(conversationId).emit('messages_seen', {
          conversationId,
          seenBy: user._id.toString(),
          messageIds,
        });
      } catch (err) {
        console.error('Mark seen error:', err);
        socket.emit('error', {
          event: 'mark_seen',
          message: err.message,
          code: 'MARK_SEEN_FAILED'
        });
      }
    });

    // Disconnect
    socket.on('disconnect', async () => {
      const lastSeen = new Date();
      await User.findByIdAndUpdate(user._id, { online: false, lastSeen });
      socket.broadcast.emit('presence_update', {
        userId: user._id.toString(),
        online: false,
        lastSeen: lastSeen.toISOString(),
      });
    });
  });
}

module.exports = setupSocketHandlers;
