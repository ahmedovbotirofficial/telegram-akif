const User = require('../models/User');
const DriverInvite = require('../models/DriverInvite');

/**
 * Check if a user is in trial period
 * @param {Number} userId User's Telegram ID
 * @returns {Promise<Object>} Trial status and seconds left
 */
const checkTrialPeriod = async (userId) => {
  try {
    const user = await User.findOne({ telegramId: userId });
    
    if (!user) {
      return { isTrialActive: false, secondsLeft: 0 };
    }
    
    // Check if user has an active countdown interval
    if (user.countdownIntervalId) {
      // Calculate remaining time based on when the user joined
      const now = new Date();
      const joinTime = user.lastInteraction || now;
      const elapsedSeconds = Math.floor((now - joinTime) / 1000);
      
      // For trial period, 10 seconds
      if (user.paymentStatus === "none") {
        const secondsLeft = Math.max(0, 10 - elapsedSeconds);
        return { 
          isTrialActive: secondsLeft > 0, 
          secondsLeft 
        };
      }
      
      // For paid period, 15 seconds
      if (user.paymentStatus === "approved") {
        const secondsLeft = Math.max(0, 15 - elapsedSeconds);
        return { 
          isTrialActive: secondsLeft > 0, 
          secondsLeft 
        };
      }
    }
    
    // If user has no active countdown interval, they're not in a trial period
    return { isTrialActive: false, secondsLeft: 0 };
  } catch (error) {
    console.error('Error checking trial period:', error);
    return { isTrialActive: false, secondsLeft: 0 };
  }
};

/**
 * Check if an invite link is valid
 * @param {String} inviteLink The invite link to check
 * @returns {Promise<Object>} Invite status and ID
 */
const checkInviteLink = async (inviteLink) => {
  try {
    const invite = await DriverInvite.findOne({ inviteLink });
    
    if (!invite) {
      return { isValid: false, inviteId: null };
    }
    
    // Check if invite is expired
    if (invite.status === 'expired' || (invite.expiresAt && new Date() > invite.expiresAt)) {
      return { isValid: false, inviteId: null };
    }
    
    // Check if invite is already used
    if (invite.status === 'used') {
      return { isValid: false, inviteId: null };
    }
    
    return { isValid: true, inviteId: invite._id };
  } catch (error) {
    console.error('Error checking invite link:', error);
    return { isValid: false, inviteId: null };
  }
};

/**
 * Mark an invite link as used
 * @param {String} inviteId The invite ID
 * @returns {Promise<Boolean>} Success status
 */
const markInviteLinkAsUsed = async (inviteId) => {
  try {
    const invite = await DriverInvite.findById(inviteId);
    
    if (!invite) {
      return false;
    }
    
    invite.status = 'used';
    await invite.save();
    
    return true;
  } catch (error) {
    console.error('Error marking invite link as used:', error);
    return false;
  }
};

/**
 * Confirm payment and create new invite link
 * @param {Number} userId User's Telegram ID
 * @param {String} inviteId The invite ID
 * @param {Function} createInviteLink Function to create invite link
 * @returns {Promise<Object>} Success status and message
 */
const confirmPaymentAndCreateInvite = async (userId, inviteId, createInviteLink) => {
  try {
    const user = await User.findOne({ telegramId: userId });
    
    if (!user) {
      return { success: false, message: 'User not found' };
    }
    
    // Update user payment status
    user.paymentStatus = "approved";
    user.lastInteraction = new Date(); // Reset the timer for 15 seconds
    await user.save();
    
    // Mark the invite as used
    if (inviteId) {
      await markInviteLinkAsUsed(inviteId);
    }
    
    return { success: true, message: 'Payment confirmed' };
  } catch (error) {
    console.error('Error confirming payment:', error);
    return { success: false, message: 'Error confirming payment' };
  }
};

module.exports = {
  checkTrialPeriod,
  checkInviteLink,
  markInviteLinkAsUsed,
  confirmPaymentAndCreateInvite
}; 