const mongoose = require('mongoose');

const auditTypeQuestionSchema = new mongoose.Schema({
  questionRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true,
  },
  questionId: {
    type: String,
    required: true,
  },
  order: {
    type: Number,
    default: 1,
  },
  isRequired: {
    type: Boolean,
    default: false,
  },
}, { _id: true });

const auditTypeSectionSchema = new mongoose.Schema({
  sectionCode: {
    type: String,
    required: true,
    trim: true,
  },
  sectionName: {
    type: String,
    required: true,
    trim: true,
  },
  order: {
    type: Number,
    default: 1,
  },
  questions: [auditTypeQuestionSchema],
}, { _id: true });

const auditTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Audit type name is required'],
    trim: true,
    unique: true,
  },
  code: {
    type: String,
    required: [true, 'Audit type code is required'],
    trim: true,
    uppercase: true,
    unique: true,
    index: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
    index: true,
  },
  sections: [auditTypeSectionSchema],
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

// Calculate total questions before saving
auditTypeSchema.pre('save', function (next) {
  if (this.sections && Array.isArray(this.sections)) {
    this.totalQuestions = this.sections.reduce((acc, sec) => acc + (sec.questions?.length || 0), 0);
  } else {
    this.totalQuestions = 0;
  }
  next();
});

module.exports = mongoose.model('AuditType', auditTypeSchema);

