const mongoose = require('mongoose');

const auditReviewSchema = new mongoose.Schema({
  auditId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuditAssignment',
    required: true,
    index: true,
  },
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  decision: {
    type: String,
    enum: ['Approved', 'Changes Requested', 'Rejected'],
    required: true,
  },
  comments: {
    type: String,
    required: true,
    trim: true,
  },
  sectionFeedback: [{
    sectionCode: String,
    feedback: String,
  }],
  reviewedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('AuditReview', auditReviewSchema);
