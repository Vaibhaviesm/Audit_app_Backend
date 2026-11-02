const jwt = require('jsonwebtoken');
const { JWT_ACCESS_SECRET, JWT_SECRET } = require('../config/env');
const User = require('../models/User');
const { logSecurityEvent } = require('../services/securityLogger');

const secretToUse = JWT_ACCESS_SECRET || JWT_SECRET;

const protect = async (req, res, next) => {
  try {
    let token;

    if (req.cookies && (req.cookies.accessToken || req.cookies.token)) {
      token = req.cookies.accessToken || req.cookies.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
        code: 'AUTH_REQUIRED',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secretToUse);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Access token expired. Session refresh required.',
          code: 'TOKEN_EXPIRED',
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid authorization token. Please log in again.',
        code: 'INVALID_TOKEN',
      });
    }

    const user = await User.findById(decoded.id).select('-passwordHash -passwordResetToken -passwordResetExpires');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'The user belonging to this token no longer exists.',
        code: 'USER_NOT_FOUND',
      });
    }

    if (user.status !== 'Active') {
      await logSecurityEvent({
        userId: user._id,
        email: user.email,
        eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        req,
        details: { reason: 'Attempted access with deactivated account' },
      });
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    // Session revocation check via tokenVersion
    if (decoded.tokenVersion !== undefined && user.tokenVersion !== undefined && decoded.tokenVersion < user.tokenVersion) {
      return res.status(401).json({
        success: false,
        message: 'Session has been revoked or expired. Please log in again.',
        code: 'SESSION_REVOKED',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session. Please log in again.',
      code: 'AUTH_FAILED',
    });
  }
};

module.exports = { protect };
