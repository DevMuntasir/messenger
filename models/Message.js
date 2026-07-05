const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['text', 'image', 'voice'], required: true },
  text: { type: String, default: null },
  imageUrl: { type: String, default: null },
  imagePublicId: { type: String, default: null },
  voiceUrl: { type: String, default: null },
  voiceDuration: { type: String, default: null },
  reaction: { type: String, default: null },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

messageSchema.index({ conversationId: 1, createdAt: -1 });

messageSchema.methods.toClientJSON = function (currentUserId) {
  const senderId = this.senderId._id || this.senderId;
  return {
    id: this._id.toString(),
    conversationId: this.conversationId.toString(),
    from: senderId.toString() === currentUserId.toString() ? 'me' : 'them',
    kind: this.kind,
    text: this.text,
    uri: this.imageUrl,
    dur: this.voiceDuration,
    react: this.reaction,
    replyTo: this.replyTo ? (this.replyTo._id || this.replyTo).toString() : null,
    // Snapshot of the quoted message (present when replyTo is populated) so the
    // client can render the quote even if the original isn't in its loaded window.
    replyPreview: this.replyTo && this.replyTo.kind !== undefined ? {
      kind: this.replyTo.kind,
      text: this.replyTo.text,
      senderId: (this.replyTo.senderId?._id || this.replyTo.senderId)?.toString() || null,
    } : null,
    time: formatTime(this.createdAt),
    createdAt: this.createdAt,
    seenBy: this.seenBy.map(id => id.toString()),
    senderId: senderId.toString(),
    who: this.senderId?.toClientJSON ? this.senderId.toClientJSON() : null,
  };
};

function formatTime(date) {
  if (!date) return '';
  const now = new Date();
  const d = new Date(date);
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (diffDays < 7) return days[d.getDay()];
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

module.exports = mongoose.model('Message', messageSchema);
