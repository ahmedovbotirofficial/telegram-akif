const config = require('../config/config');
const membershipUtils = require('../utils/membershipUtils');
const { v4: uuidv4 } = require('uuid');

/**
 * Create a trial invite link for a user
 * @param {Object} bot Bot object
 * @param {Number} userId User's Telegram ID
 * @param {String} fullName User's full name
 * @param {Object} redisClient Redis client
 * @returns {Promise<String|null>} Created invite link or null
 */
const createTrialInviteLink = async (bot, userId, fullName, redisClient) => {
  try {
    // Check if user already has an active invite
    const inviteIds = await redisClient.sMembers(`invites:user:${userId}`);
    let existingInvite = null;
    for (const inviteId of inviteIds) {
      const invite = await redisClient.hGetAll(`invite:${inviteId}`);
      if (invite.status === 'active' && invite.type === 'trial') {
        existingInvite = {
          id: inviteId,
          ...invite,
          telegramId: parseInt(invite.telegramId),
          createdAt: new Date(parseInt(invite.createdAt)),
          expiresAt: invite.expiresAt ? new Date(parseInt(invite.expiresAt)) : undefined
        };
        break;
      }
    }

    if (existingInvite) {
      // Check if the existing invite is still valid (not expired)
      const now = new Date();
      const inviteAge = (now - existingInvite.createdAt) / 1000; // age in seconds
      
      if (inviteAge <= 10) { // 10 seconds trial period
        return existingInvite.inviteLink;
      } else {
        // Mark old invite as expired
        await redisClient.hSet(`invite:${existingInvite.id}`, 'status', 'expired');
      }
    }

    // Check if bot is admin in the group
    try {
      // Get bot ID from bot object
      const botId = bot.botId || bot.token.split(':')[0];
      console.log(`Checking bot permissions for bot ID: ${botId} in chat: ${config.telegramChatId}`);
      
      const botMember = await bot.getChatMember(config.telegramChatId, botId);
      console.log(`Bot member status: ${botMember.status}, can_invite_users: ${botMember.can_invite_users}`);
      
      if (botMember.status !== 'administrator' || !botMember.can_invite_users) {
        throw new Error('Bot is not admin or cannot invite users');
      }
    } catch (error) {
      console.error('Error checking bot permissions:', error);
      throw new Error('Bot permissions check failed');
    }

    // Create new invite link
    const inviteLink = await bot.createChatInviteLink(config.telegramChatId, {
      member_limit: 1,
      expire_date: Math.floor(Date.now() / 1000) + 10 // 10 seconds expiry
    });

    // Save invite information
    const inviteId = uuidv4();
    const newInvite = {
      telegramId: userId.toString(),
      fullName,
      inviteLink: inviteLink.invite_link,
      type: 'trial',
      status: 'active',
      createdAt: Date.now().toString(),
      expiresAt: (Date.now() + 10 * 1000).toString()
    };

    await redisClient.hSet(`invite:${inviteId}`, newInvite);
    await redisClient.sAdd(`invites:user:${userId}`, inviteId);
    await redisClient.set(`invitelink:${inviteLink.invite_link}`, inviteId, { EX: 10 });
    await redisClient.sAdd('invites', inviteId);

    return inviteLink.invite_link;
  } catch (error) {
    console.error('Error creating trial invite link:', error);
    return null;
  }
};

/**
 * Create a payment invite link for a user
 * @param {Object} bot Bot object
 * @param {Number} userId User's Telegram ID
 * @param {String} inviteId Optional invite ID to confirm
 * @param {Object} redisClient Redis client
 * @returns {Promise<String|null>} Created invite link or null
 */
const createPaymentInviteLink = async (bot, userId, inviteId = null, redisClient) => {
  try {
    // Get user
    const user = await redisClient.hGetAll(`user:${userId}`);
    if (Object.keys(user).length === 0) {
      throw new Error('User not found');
    }

    // Check if bot is admin in the group
    try {
      // Get bot ID from bot object
      const botId = bot.botId || bot.token.split(':')[0];
      console.log(`Checking bot permissions for bot ID: ${botId} in chat: ${config.telegramChatId}`);
      
      const botMember = await bot.getChatMember(config.telegramChatId, botId);
      console.log(`Bot member status: ${botMember.status}, can_invite_users: ${botMember.can_invite_users}`);
      
      if (botMember.status !== 'administrator' || !botMember.can_invite_users) {
        throw new Error('Bot is not admin or cannot invite users');
      }
    } catch (error) {
      console.error('Error checking bot permissions:', error);
      throw new Error('Bot permissions check failed');
    }

    // Create invite link
    const inviteLink = await bot.createChatInviteLink(config.telegramChatId, {
      member_limit: 1,
      expire_date: Math.floor(Date.now() / 1000) + 15 // 15 seconds expiry
    });

    // Save invite information
    const newInviteId = uuidv4();
    const newInvite = {
      telegramId: userId.toString(),
      fullName: user.fullName,
      inviteLink: inviteLink.invite_link,
      type: 'payment',
      status: 'active',
      createdAt: Date.now().toString(),
      expiresAt: (Date.now() + 15 * 1000).toString()
    };

    await redisClient.hSet(`invite:${newInviteId}`, newInvite);
    await redisClient.sAdd(`invites:user:${userId}`, newInviteId);
    await redisClient.set(`invitelink:${inviteLink.invite_link}`, newInviteId, { EX: 15 });
    await redisClient.sAdd('invites', newInviteId);

    // If inviteId is provided, confirm the payment
    if (inviteId) {
      const confirmResult = await membershipUtils.confirmPaymentAndCreateInvite(
        userId,
        inviteId,
        (bot, userId, fullName) => createTrialInviteLink(bot, userId, fullName, redisClient),
        redisClient
      );

      if (!confirmResult.success) {
        console.error('Failed to confirm payment:', confirmResult.message);
        return null;
      }
    }

    return inviteLink.invite_link;
  } catch (error) {
    console.error('Error creating payment invite link:', error);
    throw error;
  }
};

module.exports = {
  createTrialInviteLink,
  createPaymentInviteLink
};