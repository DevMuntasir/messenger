const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  handle: { type: String, required: true, unique: true, lowercase: true, trim: true },
  initials: { type: String, required: true, maxlength: 3 },
  g: { type: String, enum: ['A','B','C','D','E','F','G','H','I','J','K','L'], default: 'A' },
  avatarUrl: { type: String, default: null },
  online: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
  activeStatus: { type: Boolean, default: true },
  readReceipts: { type: Boolean, default: true },
  pushToken: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

userSchema.methods.toClientJSON = function () {
  return {
    id: this._id.toString(),
    firebaseUid: this.firebaseUid,
    name: this.name,
    handle: this.handle,
    initials: this.initials,
    g: this.g,
    avatarUrl: this.avatarUrl,
    online: this.online,
    lastSeen: this.lastSeen,
    activeStatus: this.activeStatus,
    readReceipts: this.readReceipts,
  };
};

module.exports = mongoose.model('User', userSchema);
