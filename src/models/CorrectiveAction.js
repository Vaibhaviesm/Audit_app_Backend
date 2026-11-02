const mongoose = require('mongoose');

const correctiveActionSchema = new mongoose.Schema({
  auditId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuditAssignment',
    required: true,
    index: true,
  },
  questionId: {
    type: String,
    required: true,
    index: true,
  },
  findingDescription: {
    type: String,
    required: true,
    trim: true,
  },
  severity: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium',
    required: true,
  },
  correctiveAction: {
    type: String,
    required: true,
    trim: true,
  },
  responsiblePerson: {
    type: String,
    required: true,
    trim: true,
  },
  targetDate: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Completed', 'Verified', 'Reopened'],
    default: 'Open',
    index: true,
  },
  completionRemarks: {
    type: String,
    default: '',
  },
  evidenceFiles: [{
    type: String,
  }],
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  verifiedAt: {
    type: Date,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('CorrectiveAction', correctiveActionSchema);
