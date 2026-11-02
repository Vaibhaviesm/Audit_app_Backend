const mongoose = require('mongoose');

const questionSectionSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  order: {
    type: Number,
    required: true,
    default: 0,
  },
  description: {
    type: String,
    default: '',
  },
  source: {
    type: String,
    enum: ['original', 'suggested'],
    default: 'original',
  },
  isSuggested: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('QuestionSection', questionSectionSchema);
