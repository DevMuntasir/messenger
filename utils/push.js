const admin = require('../config/firebase');
const User = require('../models/User');

// Sends a data-only FCM message (no `notification` payload) so the app's
// background JS task runs on Android and can render both the system
// notification and the chat head. A `notification` payload would be displayed
// by the OS directly and skip our handler entirely.
async function sendMessagePush({ recipientIds, sender, conversationId, previewText, unreadCounts = [] }) {
  let recipients;
  try {
    recipients = await User.find({
      _id: { $in: recipientIds },
      pushToken: { $nin: [null, ''] },
    });
  } catch (err) {
    console.error('Push: failed to load recipients:', err.message);
    return;
  }

  await Promise.all(
    recipients.map(async (recipient) => {
      const unread =
        unreadCounts.find((u) => u.userId?.toString() === recipient._id.toString())?.count || 1;
      try {
        await admin.messaging().send({
          token: recipient.pushToken,
          data: {
            type: 'new_message',
            conversationId: conversationId.toString(),
            senderId: sender._id.toString(),
            senderName: sender.name || 'New message',
            senderInitials: sender.initials || '',
            senderAvatarUrl: sender.avatarUrl || '',
            senderG: sender.g || 'A',
            preview: previewText || '',
            unreadCount: String(unread),
          },
          android: {
            // High priority grants the app a short window to start the chat
            // head foreground service even while backgrounded (Android 12+).
            priority: 'high',
          },
        });
      } catch (err) {
        const code = err.errorInfo?.code || err.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument'
        ) {
          // Token is dead (app uninstalled / token rotated) — drop it.
          await User.updateOne(
            { _id: recipient._id, pushToken: recipient.pushToken },
            { pushToken: null }
          ).catch(() => {});
        } else {
          console.error(`Push send failed for user ${recipient._id}:`, err.message);
        }
      }
    })
  );
}

module.exports = { sendMessagePush };
