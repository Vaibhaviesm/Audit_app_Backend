const mongoose = require('mongoose');

const auditReportSchema = new mongoose.Schema({
  auditId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuditAssignment',
    required: true,
    index: true,
  },
  reportReference: {
    type: String,
    required: true,
    unique: true,
  },
  version: {
    type: Number,
    default: 1,
  },
  isDraft: {
    type: Boolean,
    default: false,
  },
  filePath: {
    type: String,
    required: true,
  },
  fileSize: {
    type: Number,
  },
  metadata: {
    companyName: String,
    plantName: String,
    auditType: String,
    totalQuestions: Number,
    answeredQuestions: Number,
    compliantCount: Number,
    nonCompliantCount: Number,
    observationCount: Number,
    criticalFindings: Number,
    highFindings: Number,
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  generatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('AuditReport', auditReportSchema);
