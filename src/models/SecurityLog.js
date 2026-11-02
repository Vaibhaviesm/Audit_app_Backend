const mongoose = require('mongoose');

const securityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  email: {
    type: String,
    trim: true,
    index: true,
  },
  eventType: {
    type: String,
    enum: [
      'LOGIN_SUCCESS',
      'LOGIN_FAILED',
      'LOGOUT',
      'TOKEN_REFRESH',
      'PASSWORD_CHANGE',
      'PASSWORD_RESET_REQUEST',
      'PASSWORD_RESET_SUCCESS',
      'ACCOUNT_CREATED',
      'ACCOUNT_STATUS_CHANGED',
      'ROLE_CHANGED',
      'ASSIGNMENTS_CHANGED',
      'SESSIONS_REVOKED',
      'UNAUTHORIZED_ACCESS_ATTEMPT',
    ],
    required: true,
    index: true,
  },
  ipAddress: {
    type: String,
    default: '',
  },
  userAgent: {
    type: String,
    default: '',
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('SecurityLog', securityLogSchema);

