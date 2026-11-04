const AuditAssignment = require('../models/AuditAssignment');
const AuditResponse = require('../models/AuditResponse');
const AuditTemplateVersion = require('../models/AuditTemplateVersion');
const Question = require('../models/Question');
const CorrectiveAction = require('../models/CorrectiveAction');
const AuditActivityLog = require('../models/AuditActivityLog');
const { calculateAuditProgress } = require('../services/progressService');
const aiGrammarService = require('../services/aiGrammarService');

exports.getMyAudits = async (req, res, next) => {
  try {
    const audits = await AuditAssignment.find({ assignedEmployee: req.user._id })
      .populate('company', 'name code industry registeredAddress')
      .populate('plant', 'name code city state address')
      .populate('reviewer', 'fullName email')
      .populate('template', 'name code totalQuestions')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: audits.length,
      data: audits,
    });
  } catch (error) {
    next(error);
  }
};

exports.getAuditWorkspace = async (req, res, next) => {
  try {
    const audit = req.audit; // Verified by verifyAuditAccess middleware

    // Fetch template snapshot (using lean() for mutable plain object)
    const snapshot = await AuditTemplateVersion.findById(audit.templateSnapshot).lean();
    if (!snapshot) {
      return res.status(404).json({
        success: false,
        message: 'Audit template snapshot not found.',
      });
    }

    // Ensure sectionCode is populated on every question in the snapshot
    if (snapshot.snapshotData && snapshot.snapshotData.sections) {
      snapshot.snapshotData.sections.forEach(sec => {
        (sec.questions || []).forEach(q => {
          if (!q.sectionCode) q.sectionCode = sec.sectionCode;
        });
      });
    }

    // Fetch all saved responses for this audit
    const savedResponses = await AuditResponse.find({ auditId: audit._id })
      .populate('correctiveAction');

    // Fetch corrective actions
    const correctiveActions = await CorrectiveAction.find({ auditId: audit._id });

    // Recalculate progress if responses exist and status is still Not Started
    let currentProgress = audit.progress;
    if (savedResponses.length > 0 && audit.status === 'Not Started') {
      currentProgress = await calculateAuditProgress(audit._id);
    }

    res.status(200).json({
      success: true,
      data: {
        audit,
        snapshot: snapshot.snapshotData,
        savedResponses,
        correctiveActions,
        progress: currentProgress,
        currentSection: audit.currentSection || 'A',
        lastSavedAt: audit.lastSavedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.saveDraft = async (req, res, next) => {
  try {
    const audit = req.audit;
    const { responses = [], currentSection } = req.body;

    if (!Array.isArray(responses)) {
      return res.status(400).json({
        success: false,
        message: 'Responses must be provided as an array.',
      });
    }

    // Create a question lookup cache from snapshot to efficiently resolve sectionCode and questionRef
    const questionMap = {};
    if (audit.templateSnapshot) {
      const snap = await AuditTemplateVersion.findById(audit.templateSnapshot);
      if (snap?.snapshotData?.sections) {
        for (const sec of snap.snapshotData.sections) {
          for (const q of (sec.questions || [])) {
            questionMap[q.questionId] = {
              sectionCode: sec.sectionCode,
              questionRef: q.questionMongoId || q._id,
            };
          }
        }
      }
    }

    const savedItems = [];

    for (const item of responses) {
      let {
        questionId,
        sectionCode,
        responseValue,
        rawAuditorNotes,
        aiCorrectedText,
        aiApprovalStatus,
        complianceAssessment,
        observation,
        findingDescription,
        severity,
        correctiveActionText,
        responsiblePerson,
        targetDate,
        clientVersion,
      } = item;

      if (!questionId) continue;

      // Resolve sectionCode if missing
      if (!sectionCode && questionMap[questionId]) {
        sectionCode = questionMap[questionId].sectionCode;
      }
      if (!sectionCode) {
        const qDoc = await Question.findOne({ questionId });
        if (qDoc) sectionCode = qDoc.sectionCode;
      }
      if (!sectionCode) {
        sectionCode = currentSection || audit.currentSection || 'A';
      }

      // Resolve questionRef if missing
      let questionRef = item.questionRef || questionMap[questionId]?.questionRef;
      if (!questionRef) {
        const qDoc = await Question.findOne({ questionId });
        if (qDoc) questionRef = qDoc._id;
      }

      let existing = await AuditResponse.findOne({
        auditId: audit._id,
        questionId,
      });

      // Concurrency check: prevent stale responses from overwriting newer edits
      // Only skip if the client version is genuinely older AND modified by another user
      if (existing && clientVersion !== undefined && clientVersion < existing.version) {
        if (existing.lastModifiedBy && existing.lastModifiedBy.toString() !== req.user._id.toString()) {
          continue;
        }
      }

      let correctiveActionId = existing?.correctiveAction;

      // If Non-Compliant and corrective action fields provided, create or update CorrectiveAction
      if (complianceAssessment === 'Non-Compliant' && findingDescription && correctiveActionText) {
        if (correctiveActionId) {
          await CorrectiveAction.findByIdAndUpdate(correctiveActionId, {
            findingDescription,
            severity: severity || 'Medium',
            correctiveAction: correctiveActionText,
            responsiblePerson: responsiblePerson || 'Plant Manager',
            targetDate: targetDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          });
        } else {
          const ca = await CorrectiveAction.create({
            auditId: audit._id,
            questionId,
            findingDescription,
            severity: severity || 'Medium',
            correctiveAction: correctiveActionText,
            responsiblePerson: responsiblePerson || 'Plant Manager',
            targetDate: targetDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            createdBy: req.user._id,
          });
          correctiveActionId = ca._id;
        }
      }

      const isCompleted = responseValue !== undefined && responseValue !== null && String(responseValue).trim().length > 0;

      if (existing) {
        existing.responseValue = responseValue;
        if (rawAuditorNotes !== undefined) existing.rawAuditorNotes = rawAuditorNotes;
        if (aiCorrectedText !== undefined) existing.aiCorrectedText = aiCorrectedText;
        if (aiApprovalStatus !== undefined) {
          existing.aiApprovalStatus = aiApprovalStatus;
          if (aiApprovalStatus === 'approved') {
            existing.aiApprovedBy = req.user._id;
            existing.aiApprovedAt = new Date();
          }
        }
        if (sectionCode) existing.sectionCode = sectionCode;
        if (questionRef && !existing.questionRef) existing.questionRef = questionRef;
        if (complianceAssessment) existing.complianceAssessment = complianceAssessment;
        if (observation !== undefined) existing.observation = observation;
        if (correctiveActionId) existing.correctiveAction = correctiveActionId;
        existing.isCompleted = isCompleted;
        existing.version = (existing.version || 1) + 1;
        existing.lastModifiedBy = req.user._id;
        await existing.save();
        savedItems.push(existing);
      } else {
        const newResponse = await AuditResponse.create({
          auditId: audit._id,
          companyId: audit.company?._id || audit.company,
          plantId: audit.plant?._id || audit.plant,
          assignedEmployeeId: audit.assignedEmployee?._id || audit.assignedEmployee || req.user._id,
          questionId,
          questionRef,
          sectionCode,
          templateVersion: audit.templateVersion || 1,
          responseValue,
          rawAuditorNotes: rawAuditorNotes || '',
          aiCorrectedText: aiCorrectedText || '',
          aiApprovalStatus: aiApprovalStatus || 'none',
          aiApprovedAt: aiApprovalStatus === 'approved' ? new Date() : undefined,
          aiApprovedBy: aiApprovalStatus === 'approved' ? req.user._id : undefined,
          complianceAssessment: complianceAssessment || 'Pending',
          observation: observation || '',
          correctiveAction: correctiveActionId,
          isCompleted,
          version: 1,
          lastModifiedBy: req.user._id,
        });
        savedItems.push(newResponse);
      }
    }

    if (currentSection) {
      audit.currentSection = currentSection;
    }

    // Recalculate authoritative progress
    const updatedProgress = await calculateAuditProgress(audit._id);
    const refreshedAudit = await AuditAssignment.findById(audit._id);

    res.status(200).json({
      success: true,
      savedCount: savedItems.length,
      savedResponses: savedItems.map((item) => ({
        questionId: item.questionId,
        version: item.version,
        updatedAt: item.updatedAt,
      })),
      progress: updatedProgress,
      currentSection: refreshedAudit.currentSection,
      lastSavedAt: refreshedAudit.lastSavedAt,
    });
  } catch (error) {
    next(error);
  }
};

exports.submitSection = async (req, res, next) => {
  try {
    const audit = req.audit;
    const { sectionCode, nextSectionCode, responses = [] } = req.body;

    if (!sectionCode) {
      return res.status(400).json({
        success: false,
        message: 'Section code is required.',
      });
    }

    const savedItems = [];

    // Save any pending responses for the section first
    if (responses.length > 0) {
      for (const item of responses) {
        if (!item.questionId) continue;
        const sCode = item.sectionCode || sectionCode;
        const isCompleted = item.responseValue !== undefined && item.responseValue !== null && String(item.responseValue).trim().length > 0;

        let correctiveActionId = undefined;
        if (item.complianceAssessment === 'Non-Compliant' && item.findingDescription && item.correctiveActionText) {
          const ca = await CorrectiveAction.findOneAndUpdate(
            { auditId: audit._id, questionId: item.questionId },
            {
              findingDescription: item.findingDescription,
              severity: item.severity || 'Medium',
              correctiveAction: item.correctiveActionText,
              responsiblePerson: item.responsiblePerson || 'Plant Manager',
              targetDate: item.targetDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
              createdBy: req.user._id,
            },
            { upsert: true, new: true }
          );
          correctiveActionId = ca._id;
        }

        const updateSet = {
          companyId: audit.company?._id || audit.company,
          plantId: audit.plant?._id || audit.plant,
          assignedEmployeeId: audit.assignedEmployee?._id || audit.assignedEmployee || req.user._id,
          questionId: item.questionId,
          sectionCode: sCode,
          responseValue: item.responseValue,
          complianceAssessment: item.complianceAssessment || 'Pending',
          observation: item.observation || '',
          isCompleted,
          lastModifiedBy: req.user._id,
        };
        if (correctiveActionId) updateSet.correctiveAction = correctiveActionId;

        const updated = await AuditResponse.findOneAndUpdate(
          { auditId: audit._id, questionId: item.questionId },
          {
            $set: updateSet,
            $inc: { version: 1 },
          },
          { upsert: true, new: true }
        );
        savedItems.push(updated);
      }
    }

    // Update current section to next
    if (nextSectionCode) {
      audit.currentSection = nextSectionCode;
      await audit.save();
    }

    // Recalculate progress
    const updatedProgress = await calculateAuditProgress(audit._id);
    const refreshedAudit = await AuditAssignment.findById(audit._id);

    res.status(200).json({
      success: true,
      message: `Section ${sectionCode} submitted successfully.`,
      savedCount: savedItems.length,
      savedResponses: savedItems.map((item) => ({
        questionId: item.questionId,
        version: item.version,
        updatedAt: item.updatedAt,
      })),
      progress: updatedProgress,
      currentSection: refreshedAudit.currentSection,
      lastSavedAt: refreshedAudit.lastSavedAt,
    });
  } catch (error) {
    next(error);
  }
};

exports.submitFinalAudit = async (req, res, next) => {
  try {
    const audit = req.audit;

    if (audit.status === 'Submitted' || audit.status === 'Approved') {
      return res.status(400).json({
        success: false,
        message: `This audit has already been ${audit.status.toLowerCase()}.`,
      });
    }

    // Recalculate progress to ensure latest numbers
    const updatedProgress = await calculateAuditProgress(audit._id);

    audit.status = 'Submitted';
    audit.submittedAt = new Date();
    audit.submittedBy = req.user._id;
    audit.statusHistory.push({
      status: 'Submitted',
      changedBy: req.user._id,
      changedByName: req.user.fullName,
      changedAt: new Date(),
      remarks: 'Final audit submitted by auditor for review.',
    });

    await audit.save();

    await AuditActivityLog.create({
      auditId: audit._id,
      actorId: req.user._id,
      actorName: req.user.fullName,
      actorRole: req.user.role,
      action: 'AUDIT_SUBMITTED',
      details: {
        totalAnswered: updatedProgress.answeredQuestions,
        percentage: updatedProgress.percentage,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Audit submitted successfully for supervisory review.',
      data: audit,
    });
  } catch (error) {
    next(error);
  }
};

exports.uploadEvidenceFile = async (req, res, next) => {
  try {
    const audit = req.audit;
    const { questionId, sectionCode: clientSectionCode } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    if (!questionId) {
      return res.status(400).json({ success: false, message: 'Question ID is required.' });
    }

    const fileMeta = {
      fileName: req.file.filename,
      originalName: req.file.originalname,
      filePath: `/uploads/${req.file.filename}`,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedAt: new Date(),
    };

    let responseDoc = await AuditResponse.findOne({ auditId: audit._id, questionId });
    if (!responseDoc) {
      let resolvedSection = clientSectionCode;
      if (!resolvedSection) {
        const qDoc = await Question.findOne({ questionId });
        resolvedSection = qDoc?.sectionCode || audit.currentSection || 'A';
      }

      responseDoc = await AuditResponse.create({
        auditId: audit._id,
        companyId: audit.company?._id || audit.company,
        plantId: audit.plant?._id || audit.plant,
        assignedEmployeeId: audit.assignedEmployee?._id || audit.assignedEmployee || req.user._id,
        questionId,
        sectionCode: resolvedSection,
        responseValue: '',
        evidenceFiles: [fileMeta],
        lastModifiedBy: req.user._id,
      });
    } else {
      responseDoc.evidenceFiles.push(fileMeta);
      await responseDoc.save();
    }

    res.status(200).json({
      success: true,
      message: 'Evidence file uploaded successfully.',
      file: fileMeta,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * AI-powered grammar correction and professional statement generation
 * POST /api/audit/ai-correct
 */
exports.aiCorrectText = async (req, res, next) => {
  try {
    const { question, originalText, checkpointId } = req.body;

    if (!originalText || typeof originalText !== 'string' || !originalText.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Original observation text is required for AI correction.',
      });
    }

    const correctedText = await aiGrammarService.correctAuditorText({
      question: question || '',
      originalText: originalText.trim(),
      userId: req.user._id,
    });

    res.status(200).json({
      success: true,
      correctedText,
      checkpointId: checkpointId || undefined,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to generate AI correction.',
    });
  }
};

