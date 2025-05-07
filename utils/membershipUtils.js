/**
 * Check if a user is in trial period
 * @param {Number} userId User's Telegram ID
 * @param {Object} redisClient Redis client
 * @returns {Promise<Object>} Trial status and seconds left
 */
const checkTrialPeriod = async (userId, redisClient) => {
  try {
    const user = await redisClient.hGetAll(`user:${userId}`);
    
    if (Object.keys(user).length === 0) {
      return { isTrialActive: false, secondsLeft: 0 };
    }
    
    // Check if user has an active countdown interval
    if (user.countdownIntervalId) {
      // Calculate remaining time based on when the user joined
      const now = new Date();
      const joinTime = user.lastInteraction ? new Date(parseInt(user.lastInteraction)) : now;
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
 * @param {Object} redisClient Redis client
 * @returns {Promise<Object>} Invite status and ID
 */
const checkInviteLink = async (inviteLink, redisClient) => {
  try {
    const inviteId = await redisClient.get(`invitelink:${inviteLink}`);
    
    if (!inviteId) {
      return { isValid: false, inviteId: null };
    }
    
    const invite = await redisClient.hGetAll(`invite:${inviteId}`);
    
    // Check if invite is expired
    if (invite.status === 'expired' || (invite.expiresAt && new Date() > new Date(parseInt(invite.expiresAt)))) {
      return { isValid: false, inviteId: null };
    }
    
    // Check if invite is already used
    if (invite.status === 'used') {
      return { isValid: false, inviteId: null };
    }
    
    return { isValid: true, inviteId };
  } catch (error) {
    console.error('Error checking invite link:', error);
    return { isValid: false, inviteId: null };
  }
};

/**
 * Mark an invite link as used
 * @param {String} inviteId The invite ID
 * @param {Object} redisClient Redis client
 * @returns {Promise<Boolean>} Success status
 */
const markInviteLinkAsUsed = async (inviteId, redisClient) => {
  try {
    const inviteExists = await redisClient.exists(`invite:${inviteId}`);
    
    if (!inviteExists) {
      return false;
    }
    
    await redisClient.hSet(`invite:${inviteId}`, 'status', 'used');
    
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
 * @param {Object} redisClient Redis client
 * @returns {Promise<Object>} Success status and message
 */
const confirmPaymentAndCreateInvite = async (userId, inviteId, createInviteLink, redisClient) => {
  try {
    const user = await redisClient.hGetAll(`user:${userId}`);
    
    if (Object.keys(user).length === 0) {
      return { success: false, message: 'User not found' };
    }
    
    // Update user payment status
    await redisClient.hSet(`user:${userId}`, {
      paymentStatus: 'approved',
      lastInteraction: Date.now().toString()
    });
    
    // Mark the invite as used
    if (inviteId) {
      await markInviteLinkAsUsed(inviteId, redisClient);
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