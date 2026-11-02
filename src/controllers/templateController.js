const AuditTemplate = require('../models/AuditTemplate');
const AuditTemplateVersion = require('../models/AuditTemplateVersion');
const Question = require('../models/Question');
const QuestionSection = require('../models/QuestionSection');

exports.getTemplates = async (req, res, next) => {
  try {
    const templates = await AuditTemplate.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: templates.length,
      data: templates,
    });
  } catch (error) {
    next(error);
  }
};

exports.getTemplateById = async (req, res, next) => {
  try {
    const template = await AuditTemplate.findById(req.params.id)
      .populate('sections.questionIds');

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    res.status(200).json({
      success: true,
      data: template,
    });
  } catch (error) {
    next(error);
  }
};

exports.createTemplate = async (req, res, next) => {
  try {
    const { name, code, description, category, industry, sections } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Template name and code are required.',
      });
    }

    const existing = await AuditTemplate.findOne({ code: code.toUpperCase().trim() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Template code '${code.toUpperCase()}' already exists.`,
      });
    }

    let totalQuestions = 0;
    if (sections && Array.isArray(sections)) {
      sections.forEach(s => {
        totalQuestions += (s.questionIds || []).length;
      });
    }

    const template = await AuditTemplate.create({
      name,
      code: code.toUpperCase().trim(),
      description,
      category,
      industry,
      sections: sections || [],
      totalQuestions,
      version: 1,
      isPublished: true,
      createdBy: req.user._id,
    });

    // Create snapshot
    const populatedTemplate = await AuditTemplate.findById(template._id).populate('sections.questionIds');
    const snapshotSections = populatedTemplate.sections.map(s => ({
      sectionCode: s.sectionCode,
      sectionName: s.sectionName,
      fullName: s.sectionName,
      order: s.order,
      questions: (s.questionIds || []).map(q => ({
        questionId: q.questionId,
        questionMongoId: q._id,
        questionText: q.questionText,
        alternateText: q.alternateText,
        indent: q.indent,
        source: q.source,
        isSuggested: q.isSuggested,
        answerType: q.answerType,
        options: q.options,
        unit: q.unit,
        isRequired: q.isRequired,
        helpText: q.helpText,
        order: q.order,
      })),
    }));

    await AuditTemplateVersion.create({
      templateId: template._id,
      versionNumber: 1,
      name: `${template.name} (v1.0 Frozen Snapshot)`,
      snapshotData: {
        sections: snapshotSections,
        totalQuestions,
      },
      createdBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error) {
    next(error);
  }
};

