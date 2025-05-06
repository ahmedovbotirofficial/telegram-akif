require('dotenv').config();

module.exports = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  mongodbUri: process.env.REDIS_URI
}; 