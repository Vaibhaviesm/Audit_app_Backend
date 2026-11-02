const mongoose = require('mongoose');

const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    required: true,
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  changedByName: String,
  changedAt: {
    type: Date,
    default: Date.now,
  },
  remarks: {
    type: String,
    default: '',
  },
}, { _id: false });

const sectionProgressSchema = new mongoose.Schema({
  sectionCode: {
    type: String,
    required: true,
  },
  sectionName: {
    type: String,
    required: true,
  },
  total: {
    type: Number,
    default: 0,
  },
  answered: {
    type: Number,
    default: 0,
  },
  requiredTotal: {
    type: Number,
    default: 0,
  },
  requiredAnswered: {
    type: Number,
    default: 0,
  },
  isComplete: {
    type: Boolean,
    default: false,
  },
}, { _id: false });

const auditAssignmentSchema = new mongoose.Schema({
  auditReference: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  plant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plant',
    required: true,
    index: true,
  },
  template: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuditTemplate',
    required: true,
  },
  templateVersion: {
    type: Number,
    default: 1,
  },
  templateSnapshot: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuditTemplateVersion',
  },
  assignedEmployee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  auditType: {
    type: String,
    enum: ['Comprehensive Plant Audit', 'Pre-Acquisition Due Diligence', 'Annual Quality Audit', 'Safety & Environmental Audit', 'Operational Excellence Review'],
    default: 'Comprehensive Plant Audit',
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  dueDate: {
    type: Date,
    required: true,
  },
  instructions: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: [
      'Not Started',
      'In Progress',
      'Submitted',
      'Under Review',
      'Changes Requested',
      'Approved',
      'Rejected / Requires Rework',
    ],
    default: 'Not Started',
    index: true,
  },
  statusHistory: [statusHistorySchema],
  currentSection: {
    type: String,
    default: 'A',
  },
  progress: {
    totalQuestions: { type: Number, default: 0 },
    answeredQuestions: { type: Number, default: 0 },
    requiredTotal: { type: Number, default: 0 },
    requiredAnswered: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    sectionProgress: [sectionProgressSchema],
  },
  lastSavedAt: {
    type: Date,
  },
  submittedAt: {
    type: Date,
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedAt: {
    type: Date,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  reviewComments: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('AuditAssignment', auditAssignmentSchema);
