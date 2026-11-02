const mongoose = require('mongoose');

const templateSectionSchema = new mongoose.Schema({
  sectionCode: {
    type: String,
    required: true,
  },
  sectionName: {
    type: String,
    required: true,
  },
  order: {
    type: Number,
    default: 0,
  },
  questionIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
  }],
}, { _id: false });

const auditTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  category: {
    type: String,
    default: 'General Industrial Plant Audit',
  },
  industry: {
    type: String,
    default: 'Manufacturing / Process',
  },
  version: {
    type: Number,
    default: 1,
  },
  isPublished: {
    type: Boolean,
    default: true,
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
  sections: [templateSectionSchema],
  totalQuestions: {
    type: Number,
    default: 0,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('AuditTemplate', auditTemplateSchema);
