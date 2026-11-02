const SecurityLog = require('../models/SecurityLog');

const logSecurityEvent = async ({
  userId,
  email,
  eventType,
  req,
  details = {},
}) => {
  try {
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '') : '';
    const userAgent = req ? (req.headers['user-agent'] || '') : '';

    // Sanitize details: strip any password, secret, token keys
    const sanitizedDetails = { ...details };
    delete sanitizedDetails.password;
    delete sanitizedDetails.currentPassword;
    delete sanitizedDetails.newPassword;
    delete sanitizedDetails.token;
    delete sanitizedDetails.accessToken;
    delete sanitizedDetails.refreshToken;
    delete sanitizedDetails.passwordResetToken;

    await SecurityLog.create({
      userId: userId || req?.user?._id,
      email: email || req?.user?.email,
      eventType,
      ipAddress: String(ipAddress).slice(0, 100),
      userAgent: String(userAgent).slice(0, 300),
      details: sanitizedDetails,
    });
  } catch (err) {
    // Non-blocking: fail quietly to not break the main operation
    console.error('[SecurityLog Error]:', err.message);
  }
};

module.exports = { logSecurityEvent };

