const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const {
  JWT_ACCESS_SECRET,
  JWT_ACCESS_EXPIRES_IN,
  JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRES_IN,
  JWT_SECRET,
  NODE_ENV,
} = require('../config/env');
const { logSecurityEvent } = require('../services/securityLogger');

const accessSecret = JWT_ACCESS_SECRET || JWT_SECRET;
const refreshSecret = JWT_REFRESH_SECRET || JWT_SECRET;

const setAuthCookies = (res, user) => {
  const isProd = NODE_ENV === 'production' || Boolean(process.env.VERCEL);

  const accessToken = jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email,
      tokenVersion: user.tokenVersion || 0,
    },
    accessSecret,
    { expiresIn: JWT_ACCESS_EXPIRES_IN || '15m' }
  );

  const refreshToken = jwt.sign(
    {
      id: user._id,
      tokenVersion: user.tokenVersion || 0,
      tokenType: 'refresh',
    },
    refreshSecret,
    { expiresIn: JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  const accessCookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 mins
  };

  const refreshCookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  res.cookie('accessToken', accessToken, accessCookieOptions);
  res.cookie('token', accessToken, accessCookieOptions); // Compatibility alias
  res.cookie('refreshToken', refreshToken, refreshCookieOptions);

  return { accessToken, refreshToken };
};

const clearAuthCookies = (res) => {
  const isProd = NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  const cookieOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  };
  res.clearCookie('accessToken', cookieOpts);
  res.clearCookie('token', cookieOpts);
  res.clearCookie('refreshToken', cookieOpts);
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      await logSecurityEvent({
        email: normalizedEmail,
        eventType: 'LOGIN_FAILED',
        req,
        details: { reason: 'User not found' },
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Check account lockout
    if (user.isLocked()) {
      const remainingMinutes = Math.ceil((new Date(user.lockUntil).getTime() - Date.now()) / 60000);
      await logSecurityEvent({
        userId: user._id,
        email: user.email,
        eventType: 'LOGIN_FAILED',
        req,
        details: { reason: 'Account locked due to consecutive failed attempts', remainingMinutes },
      });
      return res.status(429).json({
        success: false,
        message: `Account temporarily locked due to consecutive failed attempts. Try again in ${remainingMinutes} minute(s).`,
        code: 'ACCOUNT_LOCKED',
      });
    }

    if (user.status !== 'Active') {
      await logSecurityEvent({
        userId: user._id,
        email: user.email,
        eventType: 'LOGIN_FAILED',
        req,
        details: { reason: 'Account is deactivated' },
      });
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated. Please contact an administrator.',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      let locked = false;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min lock
        locked = true;
      }
      await user.save();

      await logSecurityEvent({
        userId: user._id,
        email: user.email,
        eventType: 'LOGIN_FAILED',
        req,
        details: { reason: 'Incorrect password', failedAttempts: user.failedLoginAttempts, locked },
      });

      if (locked) {
        return res.status(429).json({
          success: false,
          message: 'Account temporarily locked due to consecutive failed attempts. Please try again in 15 minutes.',
          code: 'ACCOUNT_LOCKED',
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Login successful: reset failed attempts
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();
    await user.save();

    setAuthCookies(res, user);

    await logSecurityEvent({
      userId: user._id,
      email: user.email,
      eventType: 'LOGIN_SUCCESS',
      req,
    });

    res.status(200).json({
      success: true,
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

exports.refresh = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token not provided. Please log in.',
        code: 'NO_REFRESH_TOKEN',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, refreshSecret);
    } catch (err) {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: 'Refresh session expired or invalid. Please log in again.',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    const user = await User.findById(decoded.id).select('-passwordHash -passwordResetToken -passwordResetExpires');
    if (!user) {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: 'User belonging to this session no longer exists.',
      });
    }

    if (user.status !== 'Active') {
      clearAuthCookies(res);
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated. Please contact an administrator.',
      });
    }

    // Concurrency / revocation check
    if (decoded.tokenVersion !== undefined && user.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: 'Session has been revoked. Please log in again.',
        code: 'SESSION_REVOKED',
      });
    }

    // Rotate tokens
    setAuthCookies(res, user);

    await logSecurityEvent({
      userId: user._id,
      email: user.email,
      eventType: 'TOKEN_REFRESH',
      req,
    });

    res.status(200).json({
      success: true,
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-passwordHash -passwordResetToken -passwordResetExpires')
      .populate('companyAssignments', 'name code industry')
      .populate('plantAssignments', 'name code city state');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found.',
      });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    if (req.user) {
      await logSecurityEvent({
        userId: req.user._id,
        email: req.user.email,
        eventType: 'LOGOUT',
        req,
      });
    }

    clearAuthCookies(res);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    next(error);
  }
};

exports.logoutAll = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    clearAuthCookies(res);

    await logSecurityEvent({
      userId: user._id,
      email: user.email,
      eventType: 'SESSIONS_REVOKED',
      req,
      details: { action: 'User revoked all sessions' },
    });

    res.status(200).json({
      success: true,
      message: 'All active sessions have been securely revoked. Please log in again.',
    });
  } catch (error) {
    next(error);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Both current password and new password are required.',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long.',
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password.',
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password does not match.',
      });
    }

    user.passwordHash = await User.hashPassword(newPassword);
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate other active sessions
    await user.save();

    // Issue refreshed cookies for the current session
    setAuthCookies(res, user);

    await logSecurityEvent({
      userId: user._id,
      email: user.email,
      eventType: 'PASSWORD_CHANGE',
      req,
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. Other active sessions have been invalidated.',
    });
  } catch (error) {
    next(error);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail, status: 'Active' });

    let rawToken = null;

    if (user) {
      rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

      user.passwordResetToken = hashedToken;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry
      await user.save();

      await logSecurityEvent({
        userId: user._id,
        email: user.email,
        eventType: 'PASSWORD_RESET_REQUEST',
        req,
      });
    }

    // Always return generic message to avoid email enumeration
    res.status(200).json({
      success: true,
      message: 'If an account matches this email address, a password reset token has been generated.',
      ...(NODE_ENV !== 'production' && rawToken && { resetToken: rawToken }),
    });
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Reset token and new password are required.',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long.',
      });
    }

    const hashedToken = crypto.createHash('sha256').update(token.trim()).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Password reset token is invalid or has expired.',
      });
    }

    user.passwordHash = await User.hashPassword(newPassword);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate all prior sessions
    await user.save();

    await logSecurityEvent({
      userId: user._id,
      email: user.email,
      eventType: 'PASSWORD_RESET_SUCCESS',
      req,
    });

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. Please log in with your new credentials.',
    });
  } catch (error) {
    next(error);
  }
};
