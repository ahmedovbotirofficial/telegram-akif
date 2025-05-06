const mongoose = require('mongoose');

const groupMessageSchema = new mongoose.Schema({
  messageId: {
    type: Number,
    required: true,
    unique: true
  },
  chatId: {
    type: Number,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  text: {
    type: String
  },
  from: {
    id: Number,
    username: String,
    firstName: String,
    lastName: String
  },
  hasPhoto: {
    type: Boolean,
    default: false
  },
  hasVideo: {
    type: Boolean,
    default: false
  },
  hasDocument: {
    type: Boolean,
    default: false
  },
  hasVoice: {
    type: Boolean,
    default: false
  },
  hasAudio: {
    type: Boolean,
    default: false
  },
  hasAnimation: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
groupMessageSchema.index({ chatId: 1, date: -1 });

const GroupMessage = mongoose.model('GroupMessage', groupMessageSchema);

module.exports = GroupMessage; 