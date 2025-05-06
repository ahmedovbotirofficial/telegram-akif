const config = require('../config/config');
const User = require('../models/User');
const DriverInvite = require('../models/DriverInvite');
const membershipUtils = require('../utils/membershipUtils');

/**
 * Create a trial invite link for a user
 * @param {Object} bot Bot object
 * @param {Number} userId User's Telegram ID
 * @param {String} fullName User's full name
 * @returns {Promise<String|null>} Created invite link or null
 */
const createTrialInviteLink = async (bot, userId, fullName) => {
  try {
    // Check if user already has an active invite
    const existingInvite = await DriverInvite.findOne({
      telegramId: userId,
      status: 'active',
      type: 'trial'
    });

    if (existingInvite) {
      // Check if the existing invite is still valid (not expired)
      const now = new Date();
      const inviteAge = (now - existingInvite.createdAt) / 1000; // age in seconds
      
      if (inviteAge <= 10) { // 10 seconds trial period
        return existingInvite.inviteLink;
      } else {
        // Mark old invite as expired
        existingInvite.status = 'expired';
        await existingInvite.save();
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
    const newInvite = new DriverInvite({
      telegramId: userId,
      fullName,
      inviteLink: inviteLink.invite_link,
      type: 'trial',
      status: 'active',
      expiresAt: new Date(Date.now() + 10 * 1000) // 10 seconds from now
    });

    await newInvite.save();
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
 * @returns {Promise<String|null>} Created invite link or null
 */
const createPaymentInviteLink = async (bot, userId, inviteId = null) => {
  try {
    // Get user
    const user = await User.findOne({ telegramId: userId });
    if (!user) {
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
    const newInvite = new DriverInvite({
      telegramId: userId,
      fullName: user.fullName,
      inviteLink: inviteLink.invite_link,
      type: 'payment',
      status: 'active',
      expiresAt: new Date(Date.now() + 15 * 1000) // 15 seconds from now
    });

    await newInvite.save();

    // If inviteId is provided, confirm the payment
    if (inviteId) {
      const confirmResult = await membershipUtils.confirmPaymentAndCreateInvite(
        userId,
        inviteId,
        createTrialInviteLink
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