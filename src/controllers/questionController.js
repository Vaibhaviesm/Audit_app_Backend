const Question = require('../models/Question');
const QuestionSection = require('../models/QuestionSection');
const AuditTemplate = require('../models/AuditTemplate');
const AuditTemplateVersion = require('../models/AuditTemplateVersion');
const AuditType = require('../models/AuditType');
const { getOriginalQuestionId } = require('../utils/questionDisplay');

exports.getSections = async (req, res, next) => {
  try {
    const sections = await QuestionSection.find().sort({ order: 1 });
    
    // Count questions per section (exclude archived)
    const counts = await Question.aggregate([
      { $match: { isArchived: false } },
      { $group: { _id: '$sectionCode', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    counts.forEach(c => { countMap[c._id] = c.count; });

    const result = sections.map(s => ({
      ...s.toObject(),
      questionCount: countMap[s.code] || 0,
    }));

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

exports.createSection = async (req, res, next) => {
  try {
    const { code, name, description } = req.body;

    if (!code || !name) {
      return res.status(400).json({
        success: false,
        message: 'Section code and name are required.',
      });
    }

    const cleanCode = code.toUpperCase().trim();
    const existing = await QuestionSection.findOne({ code: cleanCode });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Section with code '${cleanCode}' already exists.`,
      });
    }

    const count = await QuestionSection.countDocuments();
    const section = await QuestionSection.create({
      code: cleanCode,
      name: name.trim(),
      fullName: `${cleanCode}. ${name.trim()} (Custom Topic)`,
      order: count + 1,
      source: 'suggested',
      isSuggested: true,
      description: description || '',
    });

    res.status(201).json({
      success: true,
      message: 'New audit section created successfully.',
      data: section,
    });
  } catch (error) {
    next(error);
  }
};

exports.getQuestions = async (req, res, next) => {
  try {
    const { section, search, source, isSuggested, answerType, includeArchived, status, auditTypeId } = req.query;
    const query = {};

    if (!includeArchived || includeArchived === 'false') {
      query.isArchived = false;
    }

    if (status && status !== 'ALL') {
      query.status = status;
    }

    if (section && section !== 'ALL') {
      query.sectionCode = section.toUpperCase();
    }

    if (source && source !== 'ALL') {
      query.source = source;
    }

    if (isSuggested !== undefined && isSuggested !== 'ALL') {
      query.isSuggested = isSuggested === 'true';
    }

    if (answerType && answerType !== 'ALL') {
      query.answerType = answerType;
    }

    if (auditTypeId && auditTypeId !== 'ALL') {
      const targetAuditType = await AuditType.findById(auditTypeId);
      if (targetAuditType && targetAuditType.sections) {
        const questionRefs = [];
        const questionIds = [];
        targetAuditType.sections.forEach((sec) => {
          (sec.questions || []).forEach((q) => {
            if (q.questionRef) questionRefs.push(q.questionRef);
            if (q.questionId) questionIds.push(q.questionId);
          });
        });
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { _id: { $in: questionRefs } },
            { questionId: { $in: questionIds } },
          ],
        });
      }
    }

    if (search) {
      const cleanSearch = search.trim();
      const mappedOriginalId = getOriginalQuestionId(cleanSearch);
      const searchConditions = [
        { questionText: { $regex: search, $options: 'i' } },
        { alternateText: { $regex: search, $options: 'i' } },
        { questionId: { $regex: search, $options: 'i' } },
        { helpText: { $regex: search, $options: 'i' } },
      ];
      if (mappedOriginalId && mappedOriginalId.toUpperCase() !== cleanSearch.toUpperCase()) {
        searchConditions.push({ questionId: mappedOriginalId });
      }
      if (query.$and) {
        query.$and.push({ $or: searchConditions });
      } else {
        query.$or = searchConditions;
      }
    }

    const questions = await Question.find(query)
      .populate('sectionRef', 'name fullName code order')
      .sort({ order: 1, row: 1 });

    res.status(200).json({
      success: true,
      count: questions.length,
      data: questions,
    });
  } catch (error) {
    next(error);
  }
};

exports.getQuestionById = async (req, res, next) => {
  try {
    const question = await Question.findById(req.params.id).populate('sectionRef');
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }
    res.status(200).json({ success: true, data: question });
  } catch (error) {
    next(error);
  }
};

// Helper: sync new question to Master Template and increment version snapshot
const syncMasterTemplate = async (newQuestion, action = 'add') => {
  try {
    const masterTemplate = await AuditTemplate.findOne({ isDefault: true }).populate('sections.questionIds');
    if (!masterTemplate) return;

    let section = masterTemplate.sections.find(s => s.sectionCode === newQuestion.sectionCode);

    if (action === 'add') {
      if (!section) {
        masterTemplate.sections.push({
          sectionCode: newQuestion.sectionCode,
          sectionName: `Section ${newQuestion.sectionCode}`,
          order: masterTemplate.sections.length + 1,
          questionIds: [newQuestion._id],
        });
      } else {
        if (!section.questionIds.some(qId => qId._id?.toString() === newQuestion._id.toString() || qId.toString() === newQuestion._id.toString())) {
          section.questionIds.push(newQuestion._id);
        }
      }
    } else if (action === 'remove') {
      if (section) {
        section.questionIds = section.questionIds.filter(qId => {
          const idStr = qId._id ? qId._id.toString() : qId.toString();
          return idStr !== newQuestion._id.toString();
        });
      }
    }

    // Recalculate total questions
    let totalQuestions = 0;
    masterTemplate.sections.forEach(s => {
      totalQuestions += (s.questionIds || []).length;
    });
    masterTemplate.totalQuestions = totalQuestions;

    // Increment version number
    masterTemplate.version = (masterTemplate.version || 1) + 1;
    await masterTemplate.save();

    // Create a new template version snapshot for all future audits
    const populated = await AuditTemplate.findById(masterTemplate._id).populate('sections.questionIds');
    const snapshotSections = populated.sections.map(s => ({
      sectionCode: s.sectionCode,
      sectionName: s.sectionName,
      fullName: s.sectionName,
      order: s.order,
      questions: (s.questionIds || []).map(q => ({
        questionId: q.questionId,
        questionMongoId: q._id,
        questionText: q.questionText,
        alternateText: q.alternateText || '',
        indent: q.indent || 0,
        source: q.source,
        isSuggested: q.isSuggested,
        answerType: q.answerType,
        options: q.options || [],
        unit: q.unit || '',
        isRequired: q.isRequired || false,
        helpText: q.helpText || '',
        order: q.order || 0,
      })),
    }));

    await AuditTemplateVersion.create({
      templateId: masterTemplate._id,
      versionNumber: masterTemplate.version,
      name: `${masterTemplate.name} (v${masterTemplate.version}.0 Snapshot)`,
      snapshotData: {
        sections: snapshotSections,
        totalQuestions,
      },
    });

    console.log(`[MasterTemplate] Updated to v${masterTemplate.version}.0 with ${totalQuestions} questions.`);
  } catch (err) {
    console.error('Error syncing master template:', err);
  }
};

exports.createQuestion = async (req, res, next) => {
  try {
    const { sectionCode, questionText, alternateText, answerType, options, unit, isRequired, helpText, indent } = req.body;

    if (!sectionCode || !questionText) {
      return res.status(400).json({
        success: false,
        message: 'Section code and question text are required.',
      });
    }

    const section = await QuestionSection.findOne({ code: sectionCode.toUpperCase() });
    if (!section) {
      return res.status(404).json({ success: false, message: 'Invalid section code.' });
    }

    // Auto-generate questionId
    const totalCount = await Question.countDocuments();
    const questionId = `Q${String(totalCount + 1).padStart(3, '0')}`;

    const question = await Question.create({
      questionId,
      sectionCode: section.code,
      sectionRef: section._id,
      questionText: questionText.trim(),
      alternateText: alternateText || '',
      indent: indent || 0,
      source: 'custom',
      status: 'Active',
      isSuggested: false,
      isOriginal: false,
      isSystemOriginal: false,
      answerType: answerType || 'long-text',
      options: options || [],
      unit: unit || '',
      isRequired: !!isRequired,
      helpText: helpText || '',
      order: totalCount + 1,
    });

    // Sync to Master Template for future audits
    await syncMasterTemplate(question, 'add');

    res.status(201).json({
      success: true,
      message: 'Custom checkpoint added to Question Bank and future audit templates.',
      data: question,
    });
  } catch (error) {
    next(error);
  }
};

exports.updateQuestion = async (req, res, next) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    const { questionText, alternateText, answerType, options, unit, isRequired, helpText, order, status } = req.body;

    if (questionText) question.questionText = questionText.trim();
    if (alternateText !== undefined) question.alternateText = alternateText;
    if (answerType) question.answerType = answerType;
    if (options) question.options = options;
    if (unit !== undefined) question.unit = unit;
    if (isRequired !== undefined) question.isRequired = isRequired;
    if (helpText !== undefined) question.helpText = helpText;
    if (order !== undefined) question.order = order;
    if (status) question.status = status;

    await question.save();

    res.status(200).json({
      success: true,
      data: question,
    });
  } catch (error) {
    next(error);
  }
};

exports.toggleQuestionStatus = async (req, res, next) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    question.status = question.status === 'Active' ? 'Inactive' : 'Active';
    await question.save();

    res.status(200).json({
      success: true,
      message: `Checkpoint ${question.questionId} marked as ${question.status}.`,
      status: question.status,
      data: question,
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteCustomQuestion = async (req, res, next) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    // Protection rule: NEVER delete system originals
    if (question.isSystemOriginal) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: The original 136 audit checkpoints are permanently protected and cannot be deleted.',
      });
    }

    // Remove from future template versions
    await syncMasterTemplate(question, 'remove');

    // Soft delete / archive to ensure historical audit responses retain relational reference
    question.isArchived = true;
    question.status = 'Inactive';
    await question.save();

    res.status(200).json({
      success: true,
      message: `Custom checkpoint ${question.questionId} removed from future audits while preserving historical integrity.`,
    });
  } catch (error) {
    next(error);
  }
};

exports.archiveQuestion = exports.deleteCustomQuestion;
