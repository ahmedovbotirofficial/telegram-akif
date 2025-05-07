const express = require('express');
const router = express.Router();
const Redis = require('redis');

const redisClient = Redis.createClient({
  url: process.env.REDIS_URI
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Connected to Redis for API'));

(async () => {
  await redisClient.connect();
})();

// Get group messages
router.get('/group-messages', async (req, res) => {
  try {
    const messageIds = await redisClient.sMembers('groupmessages');
    const messages = [];

    for (const messageId of messageIds) {
      const message = await redisClient.hGetAll(`groupmessage:${messageId}`);
      messages.push({
        messageId: parseInt(message.messageId),
        chatId: parseInt(message.chatId),
        userId: parseInt(message.userId),
        username: message.username,
        firstName: message.firstName,
        lastName: message.lastName,
        text: message.text,
        date: new Date(parseInt(message.date)),
        createdAt: new Date(parseInt(message.createdAt))
      });
    }

    res.json(messages.sort((a, b) => b.date - a.date));
  } catch (error) {
    console.error('Error fetching group messages:', error);
    res.status(500).json({ error: 'Error fetching group messages' });
  }
});

module.exports = router;