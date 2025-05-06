const express = require('express');
const router = express.Router();
const TelegramBot = require('node-telegram-bot-api');
const config = require('../config/config');
const User = require('../models/User');
const GroupMessage = require('../models/GroupMessage');

// Admin ID
const ADMIN_ID = 1543822491;

// Create bot instance without polling
const bot = new TelegramBot(config.telegramBotToken, { 
  polling: false,
  filepath: false
});

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
  try {
    const telegramId = req.headers['telegram-id'];
    console.log('Received telegram-id:', telegramId); // Debug log
    
    if (!telegramId) {
      return res.status(401).json({ error: 'Telegram ID is required' });
    }

    // Convert to number for comparison
    const adminId = parseInt(telegramId);
    console.log('Admin ID check:', adminId, ADMIN_ID); // Debug log
    
    if (adminId !== ADMIN_ID) {
      return res.status(403).json({ 
        error: 'Access denied. Admin only.',
        received: adminId,
        expected: ADMIN_ID
      });
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all messages from the group
router.get('/group-messages', isAdmin, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    
    console.log('Fetching messages with params:', { limit, offset }); // Debug log
    
    // Get messages from database
    const messages = await GroupMessage.find({ chatId: config.telegramChatId })
      .sort({ date: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));

    console.log('Found messages:', messages.length); // Debug log

    res.json({
      success: true,
      count: messages.length,
      messages: messages
    });
  } catch (error) {
    console.error('Error getting group messages:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get group messages',
      details: error.message
    });
  }
});

// Get message details by ID
router.get('/message/:messageId', isAdmin, async (req, res) => {
  try {
    const { messageId } = req.params;
    
    // Get message from database
    const message = await GroupMessage.findOne({ 
      messageId: parseInt(messageId),
      chatId: config.telegramChatId
    });
    
    if (!message) {
      return res.status(404).json({ 
        success: false, 
        error: 'Message not found' 
      });
    }

    res.json({
      success: true,
      message: message
    });
  } catch (error) {
    console.error('Error getting message details:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get message details',
      details: error.message
    });
  }
});

module.exports = router; 