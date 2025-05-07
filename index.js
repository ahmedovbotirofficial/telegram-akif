require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Redis = require('redis');
const config = require('./config/config');
const inviteController = require('./controllers/inviteController');
const membershipUtils = require('./utils/membershipUtils');
const fileUtils = require('./utils/fileUtils');
const express = require('express');
const app = express();
const messagesApi = require('./api/messages');

// Bot token
const token = process.env.TELEGRAM_BOT_TOKEN;

// Create a bot instance
const bot = new TelegramBot(token, { polling: true });

// Store bot info
bot.botInfo = null;
bot.botId = token.split(':')[0];

// Initialize bot info
bot.getMe().then(info => {
  bot.botInfo = info;
  console.log('Bot initialized:', info.username, 'ID:', bot.botId);
}).catch(err => {
  console.error('Error getting bot info:', err);
});

// Connect to Redis
const redisClient = Redis.createClient({
  url: process.env.REDIS_URI
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Connected to Redis'));

(async () => {
  await redisClient.connect();
})();

// Admin ID
const ADMIN_ID = 1543822491;

// Utility function to get user from Redis
const getUser = async (telegramId) => {
  const userData = await redisClient.hGetAll(`user:${telegramId}`);
  if (Object.keys(userData).length === 0) return null;
  return {
    telegramId: parseInt(userData.telegramId),
    username: userData.username || undefined,
    firstName: userData.firstName || undefined,
    lastName: userData.lastName || undefined,
    role: userData.role || 'undefined',
    fullName: userData.fullName || undefined,
    phoneNumber: userData.phoneNumber || undefined,
    state: userData.state || 'normal',
    paymentStatus: userData.paymentStatus || 'none',
    createdAt: userData.createdAt ? new Date(parseInt(userData.createdAt)) : undefined,
    updatedAt: userData.updatedAt ? new Date(parseInt(userData.updatedAt)) : undefined,
    lastInteraction: userData.lastInteraction ? new Date(parseInt(userData.lastInteraction)) : undefined,
    countdownIntervalId: userData.countdownIntervalId ? parseInt(userData.countdownIntervalId) : undefined
  };
};

// Utility function to save user to Redis
const saveUser = async (user) => {
  const userData = {
    telegramId: user.telegramId.toString(),
    username: user.username || '',
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    role: user.role || 'undefined',
    fullName: user.fullName || '',
    phoneNumber: user.phoneNumber || '',
    state: user.state || 'normal',
    paymentStatus: user.paymentStatus || 'none',
    createdAt: user.createdAt ? user.createdAt.getTime().toString() : Date.now().toString(),
    updatedAt: user.updatedAt ? user.updatedAt.getTime().toString() : Date.now().toString(),
    lastInteraction: user.lastInteraction ? user.lastInteraction.getTime().toString() : Date.now().toString(),
    countdownIntervalId: user.countdownIntervalId ? user.countdownIntervalId.toString() : ''
  };
  await redisClient.hSet(`user:${user.telegramId}`, userData);
  await redisClient.sAdd('users', user.telegramId.toString());
};

// Handle /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;

  // Ignore messages from groups
  if (msg.chat.type !== 'private') {
    return;
  }

  try {
    // Check if user exists
    let user = await getUser(chatId);

    if (!user) {
      // Create new user
      user = {
        telegramId: chatId,
        firstName: firstName,
        username: msg.from.username,
        role: 'undefined',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastInteraction: new Date()
      };
      await saveUser(user);

      // Send welcome message with role selection keyboard
      const options = {
        reply_markup: {
          keyboard: [
            [{ text: "Foydalanuvchi" }, { text: "Haydovchi" }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await bot.sendMessage(
        chatId,
        `Salom, ${firstName}! Akif Taxi botiga xush kelibsiz. Iltimos, o'zingizga mos rolni tanlang:`,
        options
      );
    } else {
      // User exists, show role-specific keyboard
      if (chatId === ADMIN_ID) {
        // Admin keyboard
        const adminKeyboard = {
          reply_markup: {
            keyboard: [
              [{ text: "Statistika" }, { text: "To'lovlarni tasdiqlash" }],
              [{ text: "Foydalanuvchilar ro'yxati" }, { text: "Haydovchilar ro'yxati" }],
              [{ text: "Xabar yuborish" }],
              [{ text: "Bot haqida" }, { text: "Aloqa" }]
            ],
            resize_keyboard: true
          }
        };

        await bot.sendMessage(
          chatId,
          `Salom, ${firstName}! Siz admin sifatida tizimga kirdingiz.`,
          adminKeyboard
        );
      } else if (user.role === "user") {
        // Mini App keyboard
        const miniAppKeyboard = {
          reply_markup: {
            inline_keyboard: [
              [{
                text: "Mini Appni ochish",
                web_app: { url: "https://v0-akiftaxi.vercel.app/" }
              }]
            ],
            resize_keyboard: true
          }
        };

        // Send Mini App button first
        await bot.sendMessage(
          chatId,
          "Taksi chaqirish uchun quyidagi tugmani bosing:",
          miniAppKeyboard
        );

        // User keyboard
        const userKeyboard = {
          reply_markup: {
            keyboard: [
              [{ text: "Bot haqida" }, { text: "Aloqa" }]
            ],
            resize_keyboard: true
          }
        };

        await bot.sendMessage(
          chatId,
          `Salom, ${firstName}! Siz foydalanuvchi sifatida ro'yxatdan o'tgansiz.`,
          userKeyboard
        );
      } else if (user.role === "driver") {
        // Driver keyboard based on trial status
        const driverKeyboard = {
          reply_markup: {
            keyboard: [
              [{ text: "To'lov" }],
              [{ text: "Status" }, { text: "Bot haqida" }],
              [{ text: "Aloqa" }]
            ],
            resize_keyboard: true
          }
        };

        await bot.sendMessage(
          chatId,
          `Salom, ${user.fullName || firstName}! Siz haydovchi sifatida ro'yxatdan o'tdingiz. Guruhda qolish uchun to'lov qilishingiz kerak.`,
          driverKeyboard
        );
      }
    }
  } catch (error) {
    console.error('Error in /start command:', error);
    await bot.sendMessage(chatId, 'Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// Handle role selection
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "Foydalanuvchi" || text === "Haydovchi") {
    try {
      const user = await getUser(chatId);
      
      if (!user) {
        return await bot.sendMessage(chatId, 'Xatolik yuz berdi. Iltimos, /start buyrug\'ini bosing.');
      }

      // Update user role
      user.role = text === "Foydalanuvchi" ? "user" : "driver";
      await saveUser(user);

      if (user.role === "user") {
        // Mini App keyboard
        const miniAppKeyboard = {
          reply_markup: {
            inline_keyboard: [
              [{
                text: "Mini Appni ochish",
                web_app: { url: "https://v0-akiftaxi.vercel.app/" }
              }]
            ],
            resize_keyboard: true
          }
        };

        // Send Mini App button first
        await bot.sendMessage(
          chatId,
          "Taksi chaqirish uchun quyidagi tugmani bosing:",
          miniAppKeyboard
        );

        // User keyboard
        const userKeyboard = {
          reply_markup: {
            keyboard: [
              [{ text: "Bot haqida" }, { text: "Aloqa" }]
            ],
            resize_keyboard: true
          }
        };

        // Send registration message with regular keyboard
        await bot.sendMessage(
          chatId,
          `Siz foydalanuvchi sifatida ro'yxatdan o'tdingiz.`,
          userKeyboard
        );
      } else {
        // Driver registration process
        user.state = "waiting_fullname";
        await saveUser(user);

        const driverKeyboard = {
          reply_markup: {
            keyboard: [
              [{ text: "Bekor qilish" }]
            ],
            resize_keyboard: true
          }
        };

        await bot.sendMessage(
          chatId,
          `Siz haydovchi sifatida ro'yxatdan o'tmoqdasiz. Iltimos, to'liq ism familiyangizni kiriting:`,
          driverKeyboard
        );
      }
    } catch (error) {
      console.error('Error in role selection:', error);
      await bot.sendMessage(chatId, 'Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
    }
  }
});

// Handle driver registration
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Check if message is from a group
  if (msg.chat.type !== 'private') {
    return; // Ignore messages from groups
  }

  try {
    const user = await getUser(chatId);

    if (!user || user.role !== "driver") return;

    if (text === "Bekor qilish") {
      user.state = "normal";
      await saveUser(user);
      
      const options = {
        reply_markup: {
          keyboard: [
            [{ text: "Foydalanuvchi" }, { text: "Haydovchi" }]
          ],
          resize_keyboard: true
        }
      };

      await bot.sendMessage(
        chatId,
        "Ro'yxatdan o'tish bekor qilindi. Iltimos, qaytadan rolni tanlang:",
        options
      );
      return;
    }

    if (user.state === "waiting_fullname") {
      user.fullName = text;
      user.state = "waiting_phone";
      await saveUser(user);

      const phoneKeyboard = {
        reply_markup: {
          keyboard: [
            [{ text: "Telefon raqamni yuborish", request_contact: true }],
            [{ text: "Bekor qilish" }]
          ],
          resize_keyboard: true
        }
      };

      await bot.sendMessage(
        chatId,
        `Iltimos, telefon raqamingizni yuboring:`,
        phoneKeyboard
      );
    } else if (user.state === "waiting_phone") {
      // Handle contact message
      if (msg.contact) {
        user.phoneNumber = msg.contact.phone_number;
        user.state = "normal";
        await saveUser(user);

        try {
          // Check if user is in the group
          console.log(`Checking if user ${chatId} is in group ${config.telegramChatId}`);
          const chatMember = await bot.getChatMember(config.telegramChatId, chatId);
          console.log(`User status in group: ${chatMember.status}`);
          
          const isInGroup = ['member', 'administrator', 'creator'].includes(chatMember.status);

          if (isInGroup) {
            // Temporarily remove user from group
            console.log(`Temporarily removing user ${chatId} from group ${config.telegramChatId}`);
            await bot.banChatMember(config.telegramChatId, chatId);
            await bot.unbanChatMember(config.telegramChatId, chatId, { only_if_banned: true });
            
            await bot.sendMessage(
              chatId,
              "Siz guruhda allaqachon bor ekansiz. Sizni vaqtincha chiqarib yubordik. Endi yangi havola orqali qayta kirasiz."
            );
          }

          // Create one-time invite link
          const inviteLink = await inviteController.createTrialInviteLink(bot, chatId, user.fullName, redisClient);
          
          if (inviteLink) {
            const keyboard = {
              reply_markup: {
                inline_keyboard: [
                  [{ text: "Guruhga qo'shilish", url: inviteLink }]
                ]
              }
            };

            await bot.sendMessage(
              chatId,
              "Guruhga qo'shilish uchun quyidagi havolani bosing. Bu havola faqat 10 sekund davomida va faqat bir marta ishlaydi:",
              keyboard
            );
          } else {
            await bot.sendMessage(
              chatId,
              "Havola yaratishda xatolik yuz berdi. Iltimos, keyinroq qaytadan urinib ko'ring."
            );
          }
        } catch (error) {
          console.error('Error handling group membership:', error);
          if (error.message.includes('Bot is not admin')) {
            await bot.sendMessage(
              chatId,
              "Bot guruhda admin emas. Iltimos, botni guruhga admin qilib qo'ying."
            );
          } else {
            await bot.sendMessage(
              chatId,
              "Guruh bilan bog'lanishda xatolik yuz berdi. Iltimos, keyinroq qaytadan urinib ko'ring."
            );
          }
        }

        const driverKeyboard = {
          reply_markup: {
            keyboard: [
              [{ text: "To'lov" }],
              [{ text: "Status" }, { text: "Bot haqida" }],
              [{ text: "Aloqa" }]
            ],
            resize_keyboard: true
          }
        };

        await bot.sendMessage(
          chatId,
          `Salom, ${user.fullName}! Siz haydovchi sifatida ro'yxatdan o'tdingiz. Guruhda qolish uchun to'lov qilishingiz kerak.`,
          driverKeyboard
        );
      } else {
        await bot.sendMessage(
          chatId,
          "Iltimos, telefon raqamingizni yuborish tugmasini bosing."
        );
      }
    }
  } catch (error) {
    console.error('Error in driver registration:', error);
    await bot.sendMessage(chatId, 'Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// Handle group messages
bot.on('message', async (msg) => {
  try {
    // Check if message is from the target group
    if (msg.chat.id.toString() === config.telegramChatId) {
      console.log('Received group message:', msg.message_id); // Debug log
      
      // Save message to Redis
      const groupMessage = {
        messageId: msg.message_id.toString(),
        chatId: msg.chat.id.toString(),
        userId: msg.from.id.toString(),
        username: msg.from.username || '',
        firstName: msg.from.first_name || '',
        lastName: msg.from.last_name || '',
        text: msg.text || '',
        date: (new Date(msg.date * 1000)).getTime().toString(),
        createdAt: Date.now().toString()
      };

      await redisClient.hSet(`groupmessage:${msg.message_id}`, groupMessage);
      await redisClient.sAdd('groupmessages', msg.message_id.toString());
      console.log('Saved group message:', msg.message_id); // Debug log
    }
  } catch (error) {
    console.error('Error saving group message:', error);
  }
});

// Handle group join request
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "Guruhga qo'shilish") {
    try {
      const user = await getUser(chatId);

      if (!user || user.role !== "driver") {
        return await bot.sendMessage(chatId, "Bu funksiya faqat haydovchilar uchun mavjud.");
      }

      // Check if user is already in the group
      try {
        const chatMember = await bot.getChatMember(config.telegramChatId, chatId);
        const isInGroup = ['member', 'administrator', 'creator'].includes(chatMember.status);
        
        if (isInGroup) {
          // User is already in the group
          await bot.sendMessage(
            chatId,
            "Siz allaqachon guruhda bor ekansiz."
          );
          return;
        }
      } catch (error) {
        // User is not in the group, continue with creating invite link
        console.log(`User ${chatId} is not in the group, creating invite link`);
      }

      if (user.paymentStatus === "approved") {
        const inviteLink = await inviteController.createPaymentInviteLink(bot, chatId, null, redisClient);
        
        if (inviteLink) {
          const keyboard = {
            reply_markup: {
              inline_keyboard: [
                [{ text: "Guruhga qo'shilish", url: inviteLink }]
              ]
            }
          };

          await bot.sendMessage(
            chatId,
            "Guruhga qo'shilish uchun quyidagi havolani bosing:",
            keyboard
          );
        }
      } else if (user.paymentStatus === "none") {
        // Create a new trial invite link
        const inviteLink = await inviteController.createTrialInviteLink(bot, chatId, user.fullName, redisClient);
        
        if (inviteLink) {
          const keyboard = {
            reply_markup: {
              inline_keyboard: [
                [{ text: "Guruhga qo'shilish", url: inviteLink }]
              ]
            }
          };

          await bot.sendMessage(
            chatId,
            "Guruhga qo'shilish uchun quyidagi havolani bosing. Bu havola faqat 10 sekund davomida va faqat bir marta ishlaydi:",
            keyboard
          );
        }
      } else if (user.paymentStatus === "pending") {
        await bot.sendMessage(
          chatId,
          "Sizning to'lovingiz hali tasdiqlanmagan. Iltimos, kutib turing."
        );
      }
    } catch (error) {
      console.error('Error in group join request:', error);
      await bot.sendMessage(chatId, 'Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
    }
  }
});

// Handle new chat members
bot.on('new_chat_members', async (msg) => {
  try {
    const newMembers = msg.new_chat_members;
    const chatId = msg.chat.id;

    for (const member of newMembers) {
      if (member.id === bot.botId) continue; // Skip if the new member is the bot itself

      const user = await getUser(member.id);
      if (!user || user.role !== "driver") continue; // Skip if not a registered driver

      // Find active trial invite
      const inviteIds = await redisClient.sMembers(`invites:user:${member.id}`);
      let invite = null;
      for (const inviteId of inviteIds) {
        const inv = await redisClient.hGetAll(`invite:${inviteId}`);
        if (inv.status === 'active' && inv.type === 'trial') {
          invite = {
            id: inviteId,
            ...inv,
            telegramId: parseInt(inv.telegramId),
            createdAt: new Date(parseInt(inv.createdAt)),
            expiresAt: inv.expiresAt ? new Date(parseInt(inv.expiresAt)) : undefined
          };
          break;
        }
      }

      if (invite) {
        // Mark invite as used
        await redisClient.hSet(`invite:${invite.id}`, 'status', 'used');

        // Send welcome message first
        await bot.sendMessage(
          member.id,
          "✅ Guruhga muvaffaqiyatli qo'shildingiz! 10 sekundlik sinov muddati boshlandi."
        );

        // Start countdown timer
        let secondsLeft = 10;
        const countdownInterval = setInterval(async () => {
          secondsLeft--;
          if (secondsLeft > 0) {
            await bot.sendMessage(
              member.id,
              `⚠️ Ogohlantirish: Sinov muddati tugashiga ${secondsLeft} sekund qoldi!`
            );
          } else {
            clearInterval(countdownInterval);
            
            // Remove user from group after trial period
            try {
              await bot.banChatMember(chatId, member.id);
              await bot.unbanChatMember(chatId, member.id, { only_if_banned: true });
            } catch (error) {
              console.error('Error removing user from group:', error);
            }
            
            // Send message with payment button
            const paymentKeyboard = {
              reply_markup: {
                keyboard: [
                  [{ text: "To'lov qilish" }],
                  [{ text: "Status" }, { text: "Bot haqida" }],
                  [{ text: "Aloqa" }]
                ],
                resize_keyboard: true
              }
            };
            
            await bot.sendMessage(
              member.id,
              "❌ Sinov muddati tugadi! Guruhda qolish uchun to'lov qilishingiz kerak.",
              paymentKeyboard
            );
          }
        }, 1000);

        // Store the interval ID in the user object for later cleanup if needed
        user.countdownIntervalId = countdownInterval;
        await saveUser(user);
      }
    }
  } catch (error) {
    console.error('Error handling new chat members:', error);
  }
});

// Handle payment request
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Check if message is from a group
  if (msg.chat.type !== 'private') {
    return;
  }

  if (text === "To'lov") {
    try {
      const user = await getUser(chatId);

      if (!user || user.role !== "driver") {
        return await bot.sendMessage(chatId, "Bu funksiya faqat haydovchilar uchun mavjud.");
      }

      // Check if user is in trial period
      const trialStatus = await membershipUtils.checkTrialPeriod(chatId, redisClient);
      if (trialStatus.isTrialActive) {
        return await bot.sendMessage(
          chatId,
          "Siz hali sinov muddatida ekansiz. To'lov qilish uchun sinov muddati tugashini kutib turing."
        );
      }

      // Set user state to waiting for payment photo
      user.state = "waiting_payment_photo";
      await saveUser(user);

      const paymentKeyboard = {
        reply_markup: {
          keyboard: [
            [{ text: "Bekor qilish" }]
          ],
          resize_keyboard: true
        }
      };

      await bot.sendMessage(
        chatId,
        "Guruhda qolish uchun 50,000 so'm to'lovni amalga oshiring.\n\n" +
        "To'lov usullari:\n" +
        "- 8600 1234 5678 9101 (MasterCard)\n" +
        "- 9860 1234 5678 9101 (Visa)\n\n" +
        "To'lovni amalga oshirgach, to'lov cheki yoki screenshot rasmini yuboring.",
        paymentKeyboard
      );
    } catch (error) {
      console.error('Error in payment request:', error);
      await bot.sendMessage(chatId, 'Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
    }
  }
});

// Handle payment photo
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;

  // Check if message is from a group
  if (msg.chat.type !== 'private') {
    return;
  }

  try {
    const user = await getUser(chatId);

    if (!user || user.role !== "driver") {
      return await bot.sendMessage(chatId, "Bu funksiya faqat haydovchilar uchun mavjud.");
    }

    if (user.state !== "waiting_payment_photo") {
      return;
    }

    const photoId = msg.photo[msg.photo.length - 1].file_id;

    // Save payment photo
    const savedPhotoPath = await fileUtils.saveTelegramPhoto(bot, photoId, chatId);
    console.log(`To'lov cheki saqlandi: ${savedPhotoPath}`);

    // Set payment status to pending
    user.paymentStatus = "pending";
    user.state = "normal";
    await saveUser(user);

    const driverKeyboard = {
      reply_markup: {
        keyboard: [
          [{ text: "Status" }, { text: "Bot haqida" }],
          [{ text: "Aloqa" }]
        ],
        resize_keyboard: true
      }
    };

    await bot.sendMessage(
      chatId,
      "To'lov cheki qabul qilindi. Administrator tomonidan tekshirilgandan so'ng sizga xabar beriladi.",
      driverKeyboard
    );
  } catch (error) {
    console.error('Error in payment photo:', error);
    await bot.sendMessage(chatId, 'Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// Handle status request
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "Status") {
    try {
      const user = await getUser(chatId);
      
      if (!user) {
        return await bot.sendMessage(chatId, "Foydalanuvchi topilmadi. Iltimos, /start buyrug'ini bosing.");
      }
      
      let statusMessage = `👤 Foydalanuvchi: ${user.fullName || user.firstName}\n`;
      statusMessage += `📱 Telefon: ${user.phoneNumber || "Kiritilmagan"}\n`;
      statusMessage += `👨‍💼 Rol: ${user.role === "driver" ? "Haydovchi" : "Foydalanuvchi"}\n`;
      
      if (user.role === "driver") {
        // Check trial status
        const trialStatus = await membershipUtils.checkTrialPeriod(chatId, redisClient);
        
        if (trialStatus.isTrialActive) {
          statusMessage += `⏱️ Guruhda qolish muddati: ${trialStatus.secondsLeft} sekund qoldi\n`;
        } else if (user.paymentStatus === "pending") {
          statusMessage += `⏳ To'lov holati: Tekshirilmoqda\n`;
        } else {
          statusMessage += `❌ To'lov holati: To'lov qilinmagan\n`;
        }
      }
      
      await bot.sendMessage(chatId, statusMessage);
    } catch (error) {
      console.error('Error in status request:', error);
      await bot.sendMessage(chatId, 'Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
    }
  } else if (text === "Bot haqida") {
    await bot.sendMessage(
      chatId,
      "Akif Taxi boti - haydovchilar va foydalanuvchilar uchun qulay platforma.\n\n" +
      "Haydovchilar uchun:\n" +
      "- 10 sekundlik sinov muddati\n" +
      "- Guruhga qo'shilish imkoniyati\n" +
      "- To'lov orqali doimiy a'zolik\n\n" +
      "Foydalanuvchilar uchun:\n" +
      "- Taksi chaqirish imkoniyati\n" +
      "- Tezkor va qulay xizmat"
    );
  } else if (text === "Aloqa") {
    await bot.sendMessage(
      chatId,
      "Savollar va takliflar uchun: @akiftaxi_admin\n" +
      "Texnik yordam: @akiftaxi_support"
    );
  }
});

// Handle admin commands
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Check if message is from admin
  if (chatId !== ADMIN_ID) {
    return;
  }

  try {
    switch (text) {
      case "Statistika": {
        const statsUserIds = await redisClient.sMembers('users');
        let totalUsers = 0, totalDrivers = 0, approvedPayments = 0, pendingPayments = 0;

        for (const userId of statsUserIds) {
          const user = await getUser(parseInt(userId));
          if (user.role === "user") totalUsers++;
          if (user.role === "driver") totalDrivers++;
          if (user.role === "driver" && user.paymentStatus === "approved") approvedPayments++;
          if (user.role === "driver" && user.paymentStatus === "pending") pendingPayments++;
        }

        const statsMessage = `📊 Statistika:\n\n` +
          `👥 Foydalanuvchilar: ${totalUsers}\n` +
          `🚗 Haydovchilar: ${totalDrivers}\n` +
          `✅ Tasdiqlangan to'lovlar: ${approvedPayments}\n` +
          `⏳ Tekshirilayotgan to'lovlar: ${pendingPayments}`;

        await bot.sendMessage(chatId, statsMessage);
        break;
      }

      case "Xabar yuborish": {
        const messageKeyboard = {
          reply_markup: {
            keyboard: [
              [{ text: "Foydalanuvchilarga" }, { text: "Haydovchilarga" }],
              [{ text: "Hammaga" }],
              [{ text: "Orqaga" }]
            ],
            resize_keyboard: true
          }
        };
        await bot.sendMessage(chatId, "Xabar yubormoqchi bo'lgan guruhni tanlang:", messageKeyboard);
        break;
      }

      case "Foydalanuvchilarga":
      case "Haydovchilarga":
      case "Hammaga": {
        // Store the target group in user state
        const targetGroup = text === "Foydalanuvchilarga" ? "user" : 
                           text === "Haydovchilarga" ? "driver" : "all";
        
        // Create or update admin user
        let adminUser = await getUser(chatId);
        if (!adminUser) {
          adminUser = {
            telegramId: chatId,
            firstName: msg.from.first_name,
            role: "admin",
            createdAt: new Date(),
            updatedAt: new Date(),
            lastInteraction: new Date()
          };
        }
        adminUser.state = `waiting_message_${targetGroup}`;
        await saveUser(adminUser);

        const backKeyboard = {
          reply_markup: {
            keyboard: [
              [{ text: "Orqaga" }]
            ],
            resize_keyboard: true
          }
        };

        await bot.sendMessage(
          chatId, 
          "Yubormoqchi bo'lgan xabaringizni yuboring (matn, rasm, video yoki boshqa kontent):",
          backKeyboard
        );
        break;
      }

      case "Orqaga": {
        const adminKeyboard = {
          reply_markup: {
            keyboard: [
              [{ text: "Statistika" }, { text: "To'lovlarni tasdiqlash" }],
              [{ text: "Foydalanuvchilar ro'yxati" }, { text: "Haydovchilar ro'yxati" }],
              [{ text: "Xabar yuborish" }],
              [{ text: "Bot haqida" }, { text: "Aloqa" }]
            ],
            resize_keyboard: true
          }
        };
        await bot.sendMessage(chatId, "Admin panel:", adminKeyboard);
        break;
      }

      case "To'lovlarni tasdiqlash": {
        const pendingUserIds = await redisClient.sMembers('users');
        const pendingUsers = [];
        
        for (const userId of pendingUserIds) {
          const user = await getUser(parseInt(userId));
          if (user.role === "driver" && user.paymentStatus === "pending") {
            pendingUsers.push(user);
          }
        }
        
        if (pendingUsers.length === 0) {
          await bot.sendMessage(chatId, "Tekshirilishi kerak bo'lgan to'lovlar yo'q.");
          return;
        }

        const fs = require('fs').promises;
        const path = require('path');

        for (const user of pendingUsers) {
          // Get payment receipt path
          const userDir = path.join(__dirname, 'Uploads', 'payments', user.telegramId.toString());
          
          try {
            // Check if directory exists
            await fs.access(userDir);
            
            // Read directory contents
            const files = await fs.readdir(userDir);
            
            if (files.length > 0) {
              // Get the most recent file
              const latestFile = files.sort().reverse()[0];
              const receiptPath = path.join(userDir, latestFile);
              
              // Send payment receipt photo with user info and buttons
              await bot.sendPhoto(chatId, receiptPath, {
                caption: `👤 Foydalanuvchi: ${user.fullName}\n` +
                        `📱 Telefon: ${user.phoneNumber}\n` +
                        `💰 To'lov holati: Tekshirilmoqda`,
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: "✅ Tasdiqlash", callback_data: `approve_${user.telegramId}` },
                      { text: "❌ Rad etish", callback_data: `reject_${user.telegramId}` }
                    ]
                  ]
                }
              });
            } else {
              await bot.sendMessage(
                chatId,
                `👤 Foydalanuvchi: ${user.fullName}\n` +
                `📱 Telefon: ${user.phoneNumber}\n` +
                `💰 To'lov holati: Tekshirilmoqda\n` +
                `⚠️ To'lov cheki topilmadi`
              );
            }
          } catch (error) {
            console.error('Error accessing payment receipt:', error);
            await bot.sendMessage(
              chatId,
              `👤 Foydalanuvchi: ${user.fullName}\n` +
              `📱 Telefon: ${user.phoneNumber}\n` +
              `💰 To'lov holati: Tekshirilmoqda\n` +
              `⚠️ To'lov cheki topilmadi`
            );
          }
        }
        break;
      }

      case "Foydalanuvchilar ro'yxati": {
        const usersUserIds = await redisClient.sMembers('users');
        const users = [];
        
        for (const userId of usersUserIds) {
          const user = await getUser(parseInt(userId));
          if (user.role === "user") users.push(user);
        }
        
        if (users.length === 0) {
          await bot.sendMessage(chatId, "Foydalanuvchilar ro'yxati bo'sh.");
          return;
        }

        let usersMessage = "👥 Foydalanuvchilar ro'yxati:\n\n";
        for (const user of users) {
          usersMessage += `👤 ${user.fullName || user.firstName}\n` +
                         `📱 Username: @${user.username || "Yo'q"}\n` +
                         `🆔 ID: ${user.telegramId}\n\n`;
        }

        await bot.sendMessage(chatId, usersMessage);
        break;
      }

      case "Haydovchilar ro'yxati": {
        const driversUserIds = await redisClient.sMembers('users');
        const drivers = [];
        
        for (const userId of driversUserIds) {
          const user = await getUser(parseInt(userId));
          if (user.role === "driver") drivers.push(user);
        }
        
        if (drivers.length === 0) {
          await bot.sendMessage(chatId, "Haydovchilar ro'yxati bo'sh.");
          return;
        }

        let driversMessage = "🚗 Haydovchilar ro'yxati:\n\n";
        for (const driver of drivers) {
          driversMessage += `👤 ${driver.fullName}\n` +
                          `📱 Telefon: ${driver.phoneNumber}\n` +
                          `💰 To'lov: ${driver.paymentStatus === "approved" ? "✅ Tasdiqlangan" : 
                                      driver.paymentStatus === "pending" ? "⏳ Tekshirilmoqda" : "❌ Yo'q"}\n` +
                          `🆔 ID: ${driver.telegramId}\n\n`;
        }

        await bot.sendMessage(chatId, driversMessage);
        break;
      }
    }
  } catch (error) {
    console.error('Error in admin command:', error);
    await bot.sendMessage(chatId, 'Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// Handle admin callback queries
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  if (chatId !== ADMIN_ID) return;

  try {
    const [action, userId] = query.data.split('_');
    const user = await getUser(parseInt(userId));

    if (!user) {
      await bot.answerCallbackQuery(query.id, "Foydalanuvchi topilmadi!");
      return;
    }

    if (action === "approve") {
      user.paymentStatus = "approved";
      user.lastInteraction = new Date(); // Reset timer
      await saveUser(user);

      // Delete the payment confirmation message
      await bot.deleteMessage(chatId, query.message.message_id);

      // Send message to the driver
      await bot.sendMessage(
        user.telegramId,
        "✅ Sizning to'lovingiz tasdiqlandi! Endi siz guruhda qolishingiz mumkin."
      );

      // Create new invite link for the driver
      const inviteLink = await inviteController.createPaymentInviteLink(bot, user.telegramId, null, redisClient);
      
      if (inviteLink) {
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Guruhga qo'shilish", url: inviteLink }]
            ]
          }
        };

        await bot.sendMessage(
          user.telegramId,
          "Guruhga qo'shilish uchun quyidagi havolani bosing. Bu havola faqat 15 sekund davomida va faqat bir marta ishlaydi:",
          keyboard
        );

        // Start countdown timer
        let secondsLeft = 15;
        const countdownInterval = setInterval(async () => {
          secondsLeft--;
          if (secondsLeft > 0) {
            await bot.sendMessage(
              user.telegramId,
              `⚠️ Ogohlantirish: Havola tugashiga ${secondsLeft} sekund qoldi!`
            );
          } else {
            clearInterval(countdownInterval);
            // Remove user from group
            try {
              await bot.banChatMember(config.telegramChatId, user.telegramId);
              await bot.unbanChatMember(config.telegramChatId, user.telegramId, { only_if_banned: true });
            } catch (error) {
              console.error('Error removing user from group:', error);
            }
            
            await bot.sendMessage(
              user.telegramId,
              "❌ Guruhdan foydalanish muddati tugadi! Yangi muddat uchun to'lov qilishingiz kerak."
            );
          }
        }, 1000);

        // Store the interval ID in the user object for later cleanup if needed
        user.countdownIntervalId = countdownInterval;
        await saveUser(user);
      }

      await bot.answerCallbackQuery(query.id, "To'lov tasdiqlandi!");
    } else if (action === "reject") {
      user.paymentStatus = "none";
      await saveUser(user);

      // Delete the payment confirmation message
      await bot.deleteMessage(chatId, query.message.message_id);

      // Send message to the driver
      await bot.sendMessage(
        user.telegramId,
        "❌ Sizning to'lovingiz rad etildi. Iltimos, qaytadan to'lov qiling."
      );

      await bot.answerCallbackQuery(query.id, "To'lov rad etildi!");
    }
  } catch (error) {
    console.error('Error in admin callback query:', error);
    await bot.answerCallbackQuery(query.id, "Xatolik yuz berdi!");
  }
});

// Handle admin messages for broadcasting
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if message is from admin
  if (chatId !== ADMIN_ID) {
    return;
  }

  try {
    const adminUser = await getUser(chatId);
    if (!adminUser || !adminUser.state?.startsWith('waiting_message_')) {
      return;
    }

    const targetGroup = adminUser.state.split('_')[2]; // Get target group from state
    let users = [];

    // Get target users based on group
    const broadcastUserIds = await redisClient.sMembers('users');
    for (const userId of broadcastUserIds) {
      const user = await getUser(parseInt(userId));
      if (targetGroup === 'user' && user.role === 'user') users.push(user);
      else if (targetGroup === 'driver' && user.role === 'driver') users.push(user);
      else if (targetGroup === 'all') users.push(user);
    }

    // Send message to all target users
    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      try {
        if (msg.text) {
          await bot.sendMessage(user.telegramId, msg.text);
        } else if (msg.photo) {
          const photoId = msg.photo[msg.photo.length - 1].file_id;
          await bot.sendPhoto(user.telegramId, photoId, { caption: msg.caption });
        } else if (msg.video) {
          await bot.sendVideo(user.telegramId, msg.video.file_id, { caption: msg.caption });
        } else if (msg.document) {
          await bot.sendDocument(user.telegramId, msg.document.file_id);
        } else if (msg.voice) {
          await bot.sendVoice(user.telegramId, msg.voice.file_id);
        } else if (msg.audio) {
          await bot.sendAudio(user.telegramId, msg.audio.file_id);
        } else if (msg.animation) {
          await bot.sendAnimation(user.telegramId, msg.animation.file_id);
        }
        successCount++;
      } catch (error) {
        console.error(`Error sending message to user ${user.telegramId}:`, error);
        failCount++;
      }
    }

    // Reset admin state
    adminUser.state = "normal";
    await saveUser(adminUser);

    // Send summary to admin
    const summaryMessage = `📨 Xabar yuborish natijasi:\n\n` +
                         `✅ Muvaffaqiyatli: ${successCount}\n` +
                         `❌ Xatolik: ${failCount}\n` +
                         `📊 Jami: ${users.length}`;

    const adminKeyboard = {
      reply_markup: {
        keyboard: [
          [{ text: "Statistika" }, { text: "To'lovlarni tasdiqlash" }],
          [{ text: "Foydalanuvchilar ro'yxati" }, { text: "Haydovchilar ro'yxati" }],
          [{ text: "Xabar yuborish" }],
          [{ text: "Bot haqida" }, { text: "Aloqa" }]
        ],
        resize_keyboard: true
      }
    };

    await bot.sendMessage(chatId, summaryMessage, adminKeyboard);
  } catch (error) {
    console.error('Error in admin message broadcast:', error);
    await bot.sendMessage(chatId, 'Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
  }
});

// Add messages API routes
app.use('/api', messagesApi);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

console.log('Bot is running...');