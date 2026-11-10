const AuditType = require('../models/AuditType');
const Question = require('../models/Question');
const QuestionSection = require('../models/QuestionSection');
const AuditAssignment = require('../models/AuditAssignment');
const AuditTemplate = require('../models/AuditTemplate');
const { getDisplayQuestionId } = require('../utils/questionDisplay');

// Auto-seed default audit types if none exist
const ensureDefaultAuditTypes = async (userId) => {
  const count = await AuditType.countDocuments();
  if (count > 0) return;

  try {
    // 1. Fetch all questions and sections
    const sections = await QuestionSection.find().sort({ order: 1 });
    const questions = await Question.find({ isArchived: false }).sort({ order: 1, row: 1 });

    if (questions.length === 0) return;

    // Build full sections with questions
    const fullSections = sections.map((sec, secIdx) => {
      const secQuestions = questions.filter((q) => q.sectionCode === sec.code);
      return {
        sectionCode: sec.code,
        sectionName: sec.name || sec.fullName,
        order: secIdx + 1,
        questions: secQuestions.map((q, qIdx) => ({
          questionRef: q._id,
          questionId: q.questionId,
          order: qIdx + 1,
          isRequired: q.isRequired || false,
        })),
      };
    }).filter((s) => s.questions.length > 0);

    // Create 1. Comprehensive Plant Audit (all questions)
    await AuditType.create({
      name: 'Comprehensive Plant Audit',
      code: 'COMPREHENSIVE',
      description: 'Full-spectrum plant assessment covering all industrial checkpoints across Sections A through K.',
      status: 'Active',
      sections: fullSections,
      createdBy: userId,
    });

    // Create 2. Energy Efficiency Audit (Sections A, D, E sample)
    const energySecCodes = ['A', 'D', 'E'];
    const energySections = fullSections
      .filter((s) => energySecCodes.includes(s.sectionCode))
      .map((s, idx) => ({
        ...s,
        order: idx + 1,
        questions: s.questions.slice(0, 12), // sample subset
      }));

    if (energySections.length > 0) {
      await AuditType.create({
        name: 'Energy Efficiency Audit',
        code: 'ENERGY-EFF',
        description: 'Focused inspection evaluating plant power infrastructure, capacity utilization, and equipment maintenance.',
        status: 'Active',
        sections: energySections,
        createdBy: userId,
      });
    }

    // Create 3. Safety & Environmental Audit (Sections G, I)
    const safetySecCodes = ['G', 'I'];
    const safetySections = fullSections
      .filter((s) => safetySecCodes.includes(s.sectionCode))
      .map((s, idx) => ({
        ...s,
        order: idx + 1,
      }));

    if (safetySections.length > 0) {
      await AuditType.create({
        name: 'Safety & Environmental Audit',
        code: 'SAFETY-ENV',
        description: 'Mandatory environmental health, statutory compliance, fire prevention, and safety systems audit.',
        status: 'Active',
        sections: safetySections,
        createdBy: userId,
      });
    }

    // Create 4. Electrical Safety Audit (Section A electrical checkpoints)
    const elecSec = fullSections.find((s) => s.sectionCode === 'A');
    if (elecSec) {
      await AuditType.create({
        name: 'Electrical Safety Audit',
        code: 'ELEC-SAFETY',
        description: 'Targeted assessment of high-voltage switchyards, transformers, DG sets, and electrical earthing systems.',
        status: 'Active',
        sections: [{
          sectionCode: 'A',
          sectionName: 'Equipment & Electrical Facilities',
          order: 1,
          questions: elecSec.questions.slice(0, 15),
        }],
        createdBy: userId,
      });
    }
  } catch (err) {
    console.error('Failed to auto-seed default audit types:', err);
  }
};

// GET /api/audit-types
exports.getAuditTypes = async (req, res, next) => {
  try {
    await ensureDefaultAuditTypes(req.user?._id);

    const { status, search } = req.query;
    const query = {};

    if (status && status !== 'ALL') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const auditTypes = await AuditType.find(query)
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 });

    const data = auditTypes.map((at) => {
      const obj = at.toObject();
      obj.totalSections = obj.sections?.length || 0;
      obj.totalQuestions = obj.sections?.reduce((sum, s) => sum + (s.questions?.length || 0), 0) || 0;
      return obj;
    });

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/audit-types/:id
exports.getAuditTypeById = async (req, res, next) => {
  try {
    const auditType = await AuditType.findById(req.params.id)
      .populate({
        path: 'sections.questions.questionRef',
        select: 'questionId questionText alternateText answerType options unit isRequired helpText sectionCode status',
      })
      .populate('createdBy', 'fullName email');

    if (!auditType) {
      return res.status(404).json({ success: false, message: 'Audit type not found' });
    }

    const formatted = auditType.toObject();
    // Add display IDs
    formatted.sections.forEach((sec) => {
      sec.questions.forEach((q) => {
        const qDoc = q.questionRef || {};
        q.displayId = getDisplayQuestionId(q.questionId || qDoc.questionId);
      });
    });

    res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/audit-types
exports.createAuditType = async (req, res, next) => {
  try {
    const { name, code, description, status, cloneFromId } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Name and code are required for creating an Audit Type.',
      });
    }

    const cleanCode = code.toUpperCase().trim();
    const existing = await AuditType.findOne({
      $or: [{ code: cleanCode }, { name: name.trim() }],
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An Audit Type with this name or code already exists.',
      });
    }

    let initialSections = [];

    // Optional: Clone questionnaire structure from another type
    if (cloneFromId) {
      const source = await AuditType.findById(cloneFromId);
      if (source && Array.isArray(source.sections)) {
        initialSections = source.sections.map((sec) => ({
          sectionCode: sec.sectionCode,
          sectionName: sec.sectionName,
          order: sec.order,
          questions: sec.questions.map((q) => ({
            questionRef: q.questionRef,
            questionId: q.questionId,
            order: q.order,
            isRequired: q.isRequired,
          })),
        }));
      }
    }

    const newAuditType = await AuditType.create({
      name: name.trim(),
      code: cleanCode,
      description: description || '',
      status: status || 'Active',
      sections: initialSections,
      createdBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: 'Audit Type created successfully.',
      data: newAuditType,
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/audit-types/:id
exports.updateAuditType = async (req, res, next) => {
  try {
    const { name, description, status, code } = req.body;

    const auditType = await AuditType.findById(req.params.id);
    if (!auditType) {
      return res.status(404).json({ success: false, message: 'Audit type not found' });
    }

    if (name) auditType.name = name.trim();
    if (code) auditType.code = code.toUpperCase().trim();
    if (description !== undefined) auditType.description = description;
    if (status) auditType.status = status;

    await auditType.save();

    res.status(200).json({
      success: true,
      message: 'Audit type updated successfully.',
      data: auditType,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/audit-types/:id/toggle-status
exports.toggleAuditTypeStatus = async (req, res, next) => {
  try {
    const auditType = await AuditType.findById(req.params.id);
    if (!auditType) {
      return res.status(404).json({ success: false, message: 'Audit type not found' });
    }

    auditType.status = auditType.status === 'Active' ? 'Inactive' : 'Active';
    await auditType.save();

    res.status(200).json({
      success: true,
      message: `Audit type '${auditType.name}' marked as ${auditType.status}.`,
      data: auditType,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/audit-types/:id/sections
exports.addSection = async (req, res, next) => {
  try {
    const { sectionCode, sectionName } = req.body;
    if (!sectionCode || !sectionName) {
      return res.status(400).json({ success: false, message: 'Section code and name are required.' });
    }

    const auditType = await AuditType.findById(req.params.id);
    if (!auditType) {
      return res.status(404).json({ success: false, message: 'Audit type not found' });
    }

    const sCode = sectionCode.toUpperCase().trim();
    const existing = auditType.sections.find((s) => s.sectionCode === sCode);
    if (existing) {
      return res.status(409).json({ success: false, message: `Section '${sCode}' already exists in this audit type.` });
    }

    const nextOrder = auditType.sections.length + 1;
    auditType.sections.push({
      sectionCode: sCode,
      sectionName: sectionName.trim(),
      order: nextOrder,
      questions: [],
    });

    await auditType.save();

    res.status(200).json({
      success: true,
      message: `Section ${sCode} added to ${auditType.name}.`,
      data: auditType,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/audit-types/:id/questions/add-from-bank
exports.addQuestionsFromBank = async (req, res, next) => {
  try {
    const { sectionCode, questionIds } = req.body;

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'A list of question IDs is required.',
      });
    }

    const auditType = await AuditType.findById(req.params.id);
    if (!auditType) {
      return res.status(404).json({ success: false, message: 'Audit type not found' });
    }

    // Fetch questions from Question collection
    const idStrings = questionIds.map((id) => (typeof id === 'string' ? id : String(id)));
    const validMongoIds = idStrings.filter((id) => /^[0-9a-fA-F]{24}$/.test(id));

    const questionsToAdd = await Question.find({
      $or: [
        { _id: { $in: validMongoIds } },
        { questionId: { $in: idStrings } },
      ],
    });

    if (questionsToAdd.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No matching questions found in the Question Bank.',
      });
    }

    let addedCount = 0;

    for (const q of questionsToAdd) {
      // If sectionCode is specified, use it. Otherwise place question in its own native section.
      const targetSecCode = (sectionCode && sectionCode.trim())
        ? sectionCode.toUpperCase().trim()
        : (q.sectionCode ? q.sectionCode.toUpperCase().trim() : 'A');

      let section = auditType.sections.find((s) => s.sectionCode === targetSecCode);
      if (!section) {
        // Find section name from QuestionSection if possible
        const secDoc = await QuestionSection.findOne({ code: targetSecCode });
        const newSec = {
          sectionCode: targetSecCode,
          sectionName: secDoc ? (secDoc.name || secDoc.fullName) : `Section ${targetSecCode}`,
          order: auditType.sections.length + 1,
          questions: [],
        };
        auditType.sections.push(newSec);
        section = auditType.sections[auditType.sections.length - 1];
      }

      const alreadyExists = section.questions.some(
        (existing) => existing.questionId === q.questionId || String(existing.questionRef) === String(q._id)
      );

      if (!alreadyExists) {
        section.questions.push({
          questionRef: q._id,
          questionId: q.questionId,
          order: section.questions.length + 1,
          isRequired: q.isRequired || false,
        });
        addedCount++;
      }
    }

    await auditType.save();

    res.status(200).json({
      success: true,
      message: `Added ${addedCount} question(s) to ${auditType.name}.`,
      data: auditType,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/audit-types/:id/questions/create
exports.createQuestionInType = async (req, res, next) => {
  try {
    const {
      sectionCode,
      questionText,
      alternateText,
      answerType = 'long-text',
      isRequired = false,
      helpText = '',
      unit = '',
      options = [],
    } = req.body;

    if (!sectionCode || !questionText) {
      return res.status(400).json({
        success: false,
        message: 'Section code and question text are required.',
      });
    }

    const auditType = await AuditType.findById(req.params.id);
    if (!auditType) {
      return res.status(404).json({ success: false, message: 'Audit type not found' });
    }

    const sCode = sectionCode.toUpperCase().trim();
    let section = auditType.sections.find((s) => s.sectionCode === sCode);
    if (!section) {
      const secDoc = await QuestionSection.findOne({ code: sCode });
      auditType.sections.push({
        sectionCode: sCode,
        sectionName: secDoc ? (secDoc.name || secDoc.fullName) : `Section ${sCode}`,
        order: auditType.sections.length + 1,
        questions: [],
      });
      section = auditType.sections[auditType.sections.length - 1];
    }

    // Generate unique question ID
    const countTotal = await Question.countDocuments();
    const generatedId = `CUST-${String(countTotal + 1).padStart(3, '0')}`;

    // Create question in Question bank
    const newQuestion = await Question.create({
      questionId: generatedId,
      sectionCode: sCode,
      questionText: questionText.trim(),
      alternateText: alternateText || '',
      answerType,
      isRequired: Boolean(isRequired),
      helpText: helpText || '',
      unit: unit || '',
      options: Array.isArray(options) ? options : [],
      source: 'custom',
      isSuggested: true,
      createdBy: req.user._id,
    });

    // Add to Audit Type
    section.questions.push({
      questionRef: newQuestion._id,
      questionId: newQuestion.questionId,
      order: section.questions.length + 1,
      isRequired: Boolean(isRequired),
    });

    await auditType.save();

    res.status(201).json({
      success: true,
      message: 'New question created and attached to Audit Type successfully.',
      data: {
        question: newQuestion,
        auditType,
      },
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/audit-types/:id/questions/reorder
// Accepts complete sections hierarchy with updated orders for Drag and Drop
exports.reorderQuestions = async (req, res, next) => {
  try {
    const { sections } = req.body;

    if (!Array.isArray(sections)) {
      return res.status(400).json({
        success: false,
        message: 'Sections array is required for reordering.',
      });
    }

    const auditType = await AuditType.findById(req.params.id);
    if (!auditType) {
      return res.status(404).json({ success: false, message: 'Audit type not found' });
    }

    // Update sections and their question order
    auditType.sections = sections.map((sec, secIdx) => ({
      sectionCode: sec.sectionCode,
      sectionName: sec.sectionName,
      order: secIdx + 1,
      questions: (sec.questions || []).map((q, qIdx) => ({
        questionRef: q.questionRef?._id || q.questionRef,
        questionId: q.questionId,
        order: qIdx + 1,
        isRequired: q.isRequired || false,
      })),
    }));

    await auditType.save();

    res.status(200).json({
      success: true,
      message: 'Question order saved successfully.',
      data: auditType,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/audit-types/copy-questions
exports.copyQuestions = async (req, res, next) => {
  try {
    const { sourceTypeId, targetTypeId, targetSectionCode, questionIds } = req.body;

    if (!sourceTypeId || !targetTypeId || !targetSectionCode || !Array.isArray(questionIds)) {
      return res.status(400).json({
        success: false,
        message: 'Source type, target type, target section, and question IDs are required.',
      });
    }

    const [sourceType, targetType] = await Promise.all([
      AuditType.findById(sourceTypeId),
      AuditType.findById(targetTypeId),
    ]);

    if (!sourceType || !targetType) {
      return res.status(404).json({ success: false, message: 'Source or Target Audit Type not found.' });
    }

    // Find questions to copy
    const questionsToCopy = [];
    sourceType.sections.forEach((sec) => {
      sec.questions.forEach((q) => {
        if (questionIds.includes(q.questionId) || questionIds.includes(String(q.questionRef))) {
          questionsToCopy.push(q);
        }
      });
    });

    if (questionsToCopy.length === 0) {
      return res.status(400).json({ success: false, message: 'No matching questions found to copy.' });
    }

    // Find or create target section
    const tCode = targetSectionCode.toUpperCase().trim();
    let targetSection = targetType.sections.find((s) => s.sectionCode === tCode);
    if (!targetSection) {
      const secDoc = await QuestionSection.findOne({ code: tCode });
      targetType.sections.push({
        sectionCode: tCode,
        sectionName: secDoc ? (secDoc.name || secDoc.fullName) : `Section ${tCode}`,
        order: targetType.sections.length + 1,
        questions: [],
      });
      targetSection = targetType.sections[targetType.sections.length - 1];
    }

    let copiedCount = 0;
    questionsToCopy.forEach((q) => {
      const exists = targetSection.questions.some(
        (eq) => eq.questionId === q.questionId || String(eq.questionRef) === String(q.questionRef)
      );
      if (!exists) {
        targetSection.questions.push({
          questionRef: q.questionRef,
          questionId: q.questionId,
          order: targetSection.questions.length + 1,
          isRequired: q.isRequired || false,
        });
        copiedCount++;
      }
    });

    await targetType.save();

    res.status(200).json({
      success: true,
      message: `Copied ${copiedCount} question(s) to ${targetType.name} (Section ${tCode}).`,
      data: targetType,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/audit-types/move-questions
exports.moveQuestions = async (req, res, next) => {
  try {
    const { sourceTypeId, targetTypeId, targetSectionCode, questionIds } = req.body;

    if (!sourceTypeId || !targetTypeId || !targetSectionCode || !Array.isArray(questionIds)) {
      return res.status(400).json({
        success: false,
        message: 'Source type, target type, target section, and question IDs are required.',
      });
    }

    const [sourceType, targetType] = await Promise.all([
      AuditType.findById(sourceTypeId),
      AuditType.findById(targetTypeId),
    ]);

    if (!sourceType || !targetType) {
      return res.status(404).json({ success: false, message: 'Source or Target Audit Type not found.' });
    }

    // Find questions to move
    const questionsToMove = [];
    sourceType.sections.forEach((sec) => {
      sec.questions = sec.questions.filter((q) => {
        const matches = questionIds.includes(q.questionId) || questionIds.includes(String(q.questionRef));
        if (matches) {
          questionsToMove.push(q);
          return false; // remove from source
        }
        return true;
      });
    });

    if (questionsToMove.length === 0) {
      return res.status(400).json({ success: false, message: 'No matching questions found to move.' });
    }

    // Append to target section
    const tCode = targetSectionCode.toUpperCase().trim();
    let targetSection = targetType.sections.find((s) => s.sectionCode === tCode);
    if (!targetSection) {
      const secDoc = await QuestionSection.findOne({ code: tCode });
      targetType.sections.push({
        sectionCode: tCode,
        sectionName: secDoc ? (secDoc.name || secDoc.fullName) : `Section ${tCode}`,
        order: targetType.sections.length + 1,
        questions: [],
      });
      targetSection = targetType.sections[targetType.sections.length - 1];
    }

    let movedCount = 0;
    questionsToMove.forEach((q) => {
      const exists = targetSection.questions.some(
        (eq) => eq.questionId === q.questionId || String(eq.questionRef) === String(q.questionRef)
      );
      if (!exists) {
        targetSection.questions.push({
          questionRef: q.questionRef,
          questionId: q.questionId,
          order: targetSection.questions.length + 1,
          isRequired: q.isRequired || false,
        });
        movedCount++;
      }
    });

    await Promise.all([sourceType.save(), targetType.save()]);

    res.status(200).json({
      success: true,
      message: `Moved ${movedCount} question(s) from ${sourceType.name} to ${targetType.name}.`,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/audit-types/:id/questions/:questionId
exports.removeQuestionFromType = async (req, res, next) => {
  try {
    const { id, questionId } = req.params;
    const { sectionCode } = req.query;

    const auditType = await AuditType.findById(id);
    if (!auditType) {
      return res.status(404).json({ success: false, message: 'Audit type not found' });
    }

    let removed = false;
    auditType.sections.forEach((sec) => {
      if (!sectionCode || sec.sectionCode === sectionCode.toUpperCase().trim()) {
        const initialLen = sec.questions.length;
        sec.questions = sec.questions.filter(
          (q) => q.questionId !== questionId && String(q.questionRef) !== questionId && String(q._id) !== questionId
        );
        if (sec.questions.length < initialLen) {
          removed = true;
          // Re-index remaining questions
          sec.questions.forEach((q, idx) => {
            q.order = idx + 1;
          });
        }
      }
    });

    if (!removed) {
      return res.status(404).json({ success: false, message: 'Question not found in this audit type.' });
    }

    await auditType.save();

    res.status(200).json({
      success: true,
      message: 'Question removed from Audit Type checklist (preserved in master Question Bank).',
      data: auditType,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/audit-types/:id
exports.deleteAuditType = async (req, res, next) => {
  try {
    const auditType = await AuditType.findById(req.params.id);
    if (!auditType) {
      return res.status(404).json({ success: false, message: 'Audit type not found' });
    }

    // Check if any existing audit assignments reference this audit type
    const activeAssignments = await AuditAssignment.countDocuments({
      $or: [{ auditTypeId: auditType._id }, { auditType: auditType.name }],
    });

    if (activeAssignments > 0) {
      // Soft deactivate instead of hard delete to protect historical data integrity
      auditType.status = 'Inactive';
      await auditType.save();
      return res.status(200).json({
        success: true,
        message: `Audit Type has ${activeAssignments} historical audit assignment(s) and cannot be deleted. It has been deactivated instead.`,
        data: auditType,
      });
    }

    await AuditType.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Audit Type deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

