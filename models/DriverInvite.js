const mongoose = require('mongoose');

const driverInviteSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true },
  fullName: { type: String, required: true },
  inviteLink: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  isActive: { type: Boolean, default: true },
  isExpired: { type: Boolean, default: false },
  isInGroup: { type: Boolean, default: false },
  hasPaid: { type: Boolean, default: false }
});

module.exports = mongoose.model('DriverInvite', driverInviteSchema); 