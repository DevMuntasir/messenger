const mongoose = require('mongoose');

const lockerItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, enum: ['image', 'video'], required: true },
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  width: { type: Number, default: null },
  height: { type: Number, default: null },
  duration: { type: Number, default: null }, // seconds, videos only
  bytes: { type: Number, default: null },
  createdAt: { type: Date, default: Date.now },
});

lockerItemSchema.index({ userId: 1, createdAt: -1 });

lockerItemSchema.methods.toClientJSON = function () {
  return {
    id: this._id.toString(),
    kind: this.kind,
    url: this.url,
    width: this.width,
    height: this.height,
    duration: this.duration,
    bytes: this.bytes,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('LockerItem', lockerItemSchema);
