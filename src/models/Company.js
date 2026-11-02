const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
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
    index: true,
  },
  industry: {
    type: String,
    required: true,
    trim: true,
  },
  registeredAddress: {
    type: String,
    default: '',
    trim: true,
  },
  contactPerson: {
    type: String,
    default: '',
    trim: true,
  },
  contactEmail: {
    type: String,
    lowercase: true,
    trim: true,
    default: '',
  },
  contactMobile: {
    type: String,
    trim: true,
    default: '',
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
  },
  notes: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Company', companySchema);
