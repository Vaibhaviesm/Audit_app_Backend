const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  questionId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  row: {
    type: Number,
    index: true,
  },
  sectionCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  sectionRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuestionSection',
  },
  questionText: {
    type: String,
    required: true,
    trim: true,
  },
  alternateText: {
    type: String,
    default: '',
    trim: true,
  },
  indent: {
    type: Number,
    default: 0,
  },
  source: {
    type: String,
    enum: ['template', 'neptune-addition', 'suggested', 'custom'],
    default: 'template',
    index: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
    index: true,
  },
  isSuggested: {
    type: Boolean,
    default: false,
    index: true,
  },
  isOriginal: {
    type: Boolean,
    default: true,
  },
  isSystemOriginal: {
    type: Boolean,
    default: false, // will be true for initial 136 questions
  },
  answerType: {
    type: String,
    enum: [
      'short-text',
      'long-text',
      'number',
      'decimal',
      'yes-no',
      'yes-no-na',
      'single-select',
      'multi-select',
      'date',
      'file-upload',
      'measurement'
    ],
    default: 'long-text',
  },
  options: [{
    type: String,
  }],
  unit: {
    type: String,
    default: '',
  },
  isRequired: {
    type: Boolean,
    default: false,
  },
  helpText: {
    type: String,
    default: '',
  },
  sampleResponse: {
    type: String,
    default: '',
  },
  order: {
    type: Number,
    default: 0,
    index: true,
  },
  isArchived: {
    type: Boolean,
    default: false,
    index: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Question', questionSchema);
