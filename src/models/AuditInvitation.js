const mongoose = require('mongoose');

const auditInvitationSchema = new mongoose.Schema({
  auditId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuditAssignment',
    required: true,
    index: true,
  },
  auditReference: {
    type: String,
    required: true,
  },
  token: {
    type: String,
    required: true,
    unique: true,
  },
  shareType: {
    type: String,
    enum: ['Email', 'WhatsApp', 'Direct Link'],
    required: true,
  },
  recipientEmail: {
    type: String,
    trim: true,
  },
  recipientPhone: {
    type: String,
    trim: true,
  },
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['Sent', 'Delivered', 'Opened', 'Completed'],
    default: 'Sent',
  },
  openedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('AuditInvitation', auditInvitationSchema);
