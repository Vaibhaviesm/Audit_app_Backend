const AuditAssignment = require('../models/AuditAssignment');
const AuditTemplate = require('../models/AuditTemplate');
const AuditTemplateVersion = require('../models/AuditTemplateVersion');
const AuditType = require('../models/AuditType');
const AuditActivityLog = require('../models/AuditActivityLog');
const User = require('../models/User');
const Plant = require('../models/Plant');
const { logSecurityEvent } = require('../services/securityLogger');

exports.getAssignments = async (req, res, next) => {
  try {
    const { status, companyId, plantId, employeeId, search } = req.query;
    const query = {};

    // If requester is a Reviewer (not Admin), restrict to audits assigned to them for review
    if (req.user.role === 'Reviewer') {
      query.reviewer = req.user._id;
    }

    if (status && status !== 'ALL') {
      query.status = status;
    }

    if (companyId) {
      query.company = companyId;
    }

    if (plantId) {
      query.plant = plantId;
    }

    if (employeeId && (req.user.role === 'Super Admin' || req.user.role === 'Admin')) {
      query.assignedEmployee = employeeId;
    }

    if (search) {
      query.$or = [
        { auditReference: { $regex: search, $options: 'i' } },
        { auditType: { $regex: search, $options: 'i' } },
      ];
    }

    const assignments = await AuditAssignment.find(query)
      .populate('company', 'name code industry')
      .populate('plant', 'name code city state')
      .populate('assignedEmployee', 'employeeId fullName email phone role')
      .populate('reviewer', 'employeeId fullName email')
      .populate('template', 'name code version')
      .populate('auditTypeId', 'name code totalQuestions')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: assignments.length,
      data: assignments,
    });
  } catch (error) {
    next(error);
  }
};

exports.getAssignmentById = async (req, res, next) => {
  try {
    const assignment = await AuditAssignment.findById(req.params.id)
      .populate('company')
      .populate('plant')
      .populate('assignedEmployee', 'employeeId fullName email phone role')
      .populate('reviewer', 'employeeId fullName email role')
      .populate('template')
      .populate('templateSnapshot');

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Audit assignment not found' });
    }

    // Reviewer can only view if assigned as reviewer
    if (req.user.role === 'Reviewer') {
      if (!assignment.reviewer || assignment.reviewer._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You are not assigned to review this audit.',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: assignment,
    });
  } catch (error) {
    next(error);
  }
};

exports.createAssignment = async (req, res, next) => {
  try {
    const { company, plant, templateId, assignedEmployee, reviewer, auditType, auditTypeId, startDate, dueDate, instructions } = req.body;

    if (!company || !plant || !assignedEmployee || !dueDate) {
      return res.status(400).json({
        success: false,
        message: 'Company, Plant, Assigned Employee, and Due Date are required.',
      });
    }

    if (!templateId && !auditTypeId) {
      return res.status(400).json({
        success: false,
        message: 'Either an Audit Type or an Audit Template must be specified.',
      });
    }

    // Verify plant belongs to the specified company (cross-company assignment defense)
    const plantDoc = await Plant.findById(plant);
    if (!plantDoc) {
      return res.status(404).json({ success: false, message: 'Specified plant facility not found.' });
    }
    if (plantDoc.company.toString() !== company.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Validation Error: The specified plant does not belong to the selected company.',
      });
    }

    // Verify assigned employee exists and is active (can be Field Auditor, Admin, or Super Admin)
    const employeeDoc = await User.findById(assignedEmployee);
    if (!employeeDoc || employeeDoc.status !== 'Active') {
      return res.status(400).json({
        success: false,
        message: 'The assigned employee account does not exist or is deactivated.',
      });
    }

    // Generate unique audit reference: AUD-00000X
    const totalAssignments = await AuditAssignment.countDocuments();
    const auditReference = `AUD-${String(totalAssignments + 1).padStart(6, '0')}`;

    // Resolve base template (for schema compliance & framework reference)
    let template = null;
    if (templateId) {
      template = await AuditTemplate.findById(templateId);
    }
    if (!template && auditTypeId) {
      template = (await AuditTemplate.findOne({ status: 'Active' })) || (await AuditTemplate.findOne());
    }
    if (!template) {
      return res.status(404).json({ success: false, message: 'Audit template not found.' });
    }

    let snapshot = null;
    let resolvedAuditTypeName = auditType || 'Comprehensive Plant Audit';
    let resolvedAuditTypeId = auditTypeId || null;

    // REQUIREMENT 2: If an AuditType is selected, it is AUTHORITATIVE for determining the questionnaire
    if (auditTypeId) {
      const auditTypeDoc = await AuditType.findById(auditTypeId).populate({
        path: 'sections.questions.questionRef',
        select: 'questionId questionText alternateText indent source isSuggested answerType options unit isRequired helpText',
      });

      if (!auditTypeDoc) {
        return res.status(404).json({
          success: false,
          message: 'Specified Audit Type not found.',
        });
      }

      if (auditTypeDoc.status === 'Inactive') {
        return res.status(400).json({
          success: false,
          message: 'The selected Audit Type is inactive and cannot be assigned.',
        });
      }

      const totalQ = (auditTypeDoc.sections || []).reduce((sum, s) => sum + (s.questions?.length || 0), 0);

      // REQUIREMENT 1: Empty Audit Type Defense
      // If an Audit Type contains zero questions, prevent commissioning the audit.
      // Must NOT fall back to master questionnaire.
      if (totalQ === 0) {
        return res.status(400).json({
          success: false,
          message: 'This Audit Type has no questions. Please add questions before assigning the audit.',
        });
      }

      resolvedAuditTypeName = auditTypeDoc.name;
      resolvedAuditTypeId = auditTypeDoc._id;

      // Build immutable snapshot sections SOLELY from auditTypeDoc questions (template cannot introduce conflicting questions)
      const snapshotSections = (auditTypeDoc.sections || []).map((sec, secIdx) => ({
        sectionCode: sec.sectionCode,
        sectionName: sec.sectionName,
        fullName: `${sec.sectionCode}. ${sec.sectionName}`,
        order: sec.order || secIdx + 1,
        questions: (sec.questions || []).map((q, qIdx) => {
          const qDoc = q.questionRef || {};
          return {
            questionId: q.questionId || qDoc.questionId,
            questionMongoId: qDoc._id || q.questionRef,
            questionText: qDoc.questionText || '',
            alternateText: qDoc.alternateText || '',
            indent: qDoc.indent || 0,
            source: qDoc.source || 'custom',
            isSuggested: qDoc.isSuggested || false,
            answerType: qDoc.answerType || 'long-text',
            options: qDoc.options || [],
            unit: qDoc.unit || '',
            isRequired: q.isRequired || qDoc.isRequired || false,
            helpText: qDoc.helpText || '',
            order: q.order || qIdx + 1,
          };
        }),
      }));

      snapshot = await AuditTemplateVersion.create({
        templateId: template._id,
        versionNumber: Date.now(), // Unique version timestamp
        name: `${resolvedAuditTypeName} Snapshot (${auditReference})`,
        snapshotData: {
          sections: snapshotSections,
          totalQuestions: totalQ,
        },
        createdBy: req.user._id,
      });
    } else {
      // REQUIREMENT 1: Legacy Fallback ONLY where required for legacy audits without an auditTypeId
      snapshot = await AuditTemplateVersion.findOne({
        templateId: template._id,
        versionNumber: template.version || 1,
      });

      if (!snapshot) {
        snapshot = await AuditTemplateVersion.findOne({ templateId: template._id });
      }

      if (!snapshot) {
        return res.status(404).json({
          success: false,
          message: 'Audit template snapshot not found.',
        });
      }
    }

    const firstSectionCode = snapshot?.snapshotData?.sections?.[0]?.sectionCode || 'A';

    // Build initial section progress
    const sectionProgress = (snapshot?.snapshotData?.sections || []).map(sec => ({
      sectionCode: sec.sectionCode,
      sectionName: sec.fullName || sec.sectionName,
      total: sec.questions.length,
      answered: 0,
      requiredTotal: sec.questions.filter(q => q.isRequired).length,
      requiredAnswered: 0,
      isComplete: false,
    }));

    const assignment = await AuditAssignment.create({
      auditReference,
      company,
      plant,
      template: template._id,
      templateVersion: template.version || 1,
      templateSnapshot: snapshot?._id,
      assignedEmployee,
      reviewer: reviewer || undefined,
      auditType: resolvedAuditTypeName,
      auditTypeId: resolvedAuditTypeId,
      startDate: startDate || new Date(),
      dueDate,
      instructions: instructions || '',
      status: 'Not Started',
      currentSection: firstSectionCode,
      statusHistory: [
        {
          status: 'Not Started',
          changedBy: req.user._id,
          changedByName: req.user.fullName,
          changedAt: new Date(),
          remarks: `Assigned to employee by ${req.user.fullName}`,
        }
      ],
      progress: {
        totalQuestions: snapshot?.snapshotData?.totalQuestions || template.totalQuestions,
        answeredQuestions: 0,
        requiredTotal: (snapshot?.snapshotData?.sections || []).reduce(
          (acc, s) => acc + s.questions.filter(q => q.isRequired).length,
          0
        ),
        requiredAnswered: 0,
        percentage: 0,
        sectionProgress,
      },
    });

    // Also ensure employee's company and plant assignments include this
    await User.findByIdAndUpdate(assignedEmployee, {
      $addToSet: {
        companyAssignments: company,
        plantAssignments: plant,
      }
    });

    // Structured audit logging
    await AuditActivityLog.create({
      auditId: assignment._id,
      actorId: req.user._id,
      actorName: req.user.fullName,
      actorRole: req.user.role,
      action: 'AUDIT_ASSIGNED',
      details: {
        auditReference,
        assignedEmployee,
        dueDate,
      },
    });

    const populated = await AuditAssignment.findById(assignment._id)
      .populate('company', 'name code')
      .populate('plant', 'name code')
      .populate('assignedEmployee', 'fullName email')
      .populate('reviewer', 'fullName email');

    res.status(201).json({
      success: true,
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

exports.reassignAudit = async (req, res, next) => {
  try {
    const { newEmployeeId, remarks } = req.body;
    const assignment = await AuditAssignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Audit assignment not found' });
    }

    const previousEmployeeId = assignment.assignedEmployee;
    const newEmployee = await User.findById(newEmployeeId);
    if (!newEmployee) {
      return res.status(404).json({ success: false, message: 'New assigned employee not found' });
    }

    assignment.assignedEmployee = newEmployeeId;
    assignment.statusHistory.push({
      status: assignment.status,
      changedBy: req.user._id,
      changedByName: req.user.fullName,
      changedAt: new Date(),
      remarks: remarks || `Reassigned from previous auditor to ${newEmployee.fullName}`,
    });

    await assignment.save();

    await AuditActivityLog.create({
      auditId: assignment._id,
      actorId: req.user._id,
      actorName: req.user.fullName,
      actorRole: req.user.role,
      action: 'AUDIT_REASSIGNED',
      details: {
        previousEmployeeId,
        newEmployeeId,
        remarks,
      },
    });

    res.status(200).json({
      success: true,
      data: assignment,
      message: `Audit reassigned successfully to ${newEmployee.fullName}.`,
    });
  } catch (error) {
    next(error);
  }
};

