const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  imageUrl: { type: String, required: true },
  caption: { type: String, default: '', maxlength: 500 },
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true, index: true },
});

// Auto-delete expired stories
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

storySchema.methods.toJSON = function () {
  return {
    id: this._id.toString(),
    userId: this.userId.toString(),
    imageUrl: this.imageUrl,
    caption: this.caption,
    createdAt: this.createdAt,
    expiresAt: this.expiresAt,
  };
};

module.exports = mongoose.model('Story', storySchema);
