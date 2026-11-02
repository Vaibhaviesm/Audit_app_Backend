const AuditAssignment = require('../models/AuditAssignment');
const AuditTemplate = require('../models/AuditTemplate');
const AuditTemplateVersion = require('../models/AuditTemplateVersion');
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
      .populate('assignedEmployee', 'employeeId fullName email phone')
      .populate('reviewer', 'employeeId fullName email')
      .populate('template', 'name code version')
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
    const { company, plant, templateId, assignedEmployee, reviewer, auditType, startDate, dueDate, instructions } = req.body;

    if (!company || !plant || !templateId || !assignedEmployee || !dueDate) {
      return res.status(400).json({
        success: false,
        message: 'Company, Plant, Template, Assigned Employee, and Due Date are required.',
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

    // Verify assigned employee exists and is active
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

    const template = await AuditTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Audit template not found' });
    }

    // Get latest template version snapshot
    let snapshot = await AuditTemplateVersion.findOne({
      templateId: template._id,
      versionNumber: template.version || 1,
    });

    if (!snapshot) {
      // Fallback to any snapshot for this template
      snapshot = await AuditTemplateVersion.findOne({ templateId: template._id });
    }

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
      auditType: auditType || 'Comprehensive Plant Audit',
      startDate: startDate || new Date(),
      dueDate,
      instructions: instructions || '',
      status: 'Not Started',
      currentSection: 'A',
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
        requiredTotal: 0,
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

