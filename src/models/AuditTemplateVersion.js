const mongoose = require('mongoose');

const auditTemplateVersionSchema = new mongoose.Schema({
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuditTemplate',
    required: true,
    index: true,
  },
  versionNumber: {
    type: Number,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  snapshotData: {
    sections: [{
      sectionCode: String,
      sectionName: String,
      fullName: String,
      order: Number,
      questions: [{
        questionId: String,
        questionMongoId: mongoose.Schema.Types.ObjectId,
        questionText: String,
        alternateText: String,
        indent: Number,
        source: String,
        isSuggested: Boolean,
        answerType: String,
        options: [String],
        unit: String,
        isRequired: Boolean,
        helpText: String,
        order: Number,
      }]
    }],
    totalQuestions: Number,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

auditTemplateVersionSchema.index({ templateId: 1, versionNumber: 1 }, { unique: true });

module.exports = mongoose.model('AuditTemplateVersion', auditTemplateVersionSchema);
