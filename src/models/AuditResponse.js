const mongoose = require('mongoose');

const evidenceFileSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  originalName: { type: String, required: true },
  filePath: { type: String, required: true },
  mimeType: { type: String },
  fileSize: { type: Number },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: true });

const auditResponseSchema = new mongoose.Schema({
  auditId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuditAssignment',
    required: true,
    index: true,
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  plantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plant',
    required: true,
  },
  assignedEmployeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  questionId: {
    type: String,
    required: true,
    index: true,
  },
  questionRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
  },
  sectionCode: {
    type: String,
    required: true,
    index: true,
  },
  templateVersion: {
    type: Number,
    default: 1,
  },
  responseValue: {
    type: mongoose.Schema.Types.Mixed,
    default: '',
  },
  complianceAssessment: {
    type: String,
    enum: ['Compliant', 'Non-Compliant', 'Observation', 'Not Applicable', 'Pending'],
    default: 'Pending',
  },
  observation: {
    type: String,
    default: '',
  },
  evidenceFiles: [evidenceFileSchema],
  correctiveAction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CorrectiveAction',
  },
  isCompleted: {
    type: Boolean,
    default: false,
  },
  version: {
    type: Number,
    default: 1,
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

auditResponseSchema.index({ auditId: 1, questionId: 1 }, { unique: true });

module.exports = mongoose.model('AuditResponse', auditResponseSchema);
