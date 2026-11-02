const AuditAssignment = require('../models/AuditAssignment');
const AuditReview = require('../models/AuditReview');
const AuditActivityLog = require('../models/AuditActivityLog');

exports.submitReview = async (req, res, next) => {
  try {
    const { auditId, decision, comments, sectionFeedback } = req.body;

    if (!auditId || !decision || !comments) {
      return res.status(400).json({
        success: false,
        message: 'Audit ID, decision, and comments are required.',
      });
    }

    if (!['Approved', 'Changes Requested', 'Rejected'].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: 'Decision must be Approved, Changes Requested, or Rejected.',
      });
    }

    const audit = await AuditAssignment.findById(auditId);
    if (!audit) {
      return res.status(404).json({ success: false, message: 'Audit assignment not found' });
    }

    // Protection: auditor cannot approve their own audit
    if (audit.assignedEmployee.toString() === req.user._id.toString() && req.user.role !== 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Auditors cannot approve their own audits.',
      });
    }

    const review = await AuditReview.create({
      auditId: audit._id,
      reviewer: req.user._id,
      decision,
      comments,
      sectionFeedback: sectionFeedback || [],
      reviewedAt: new Date(),
    });

    // Update audit status based on decision
    if (decision === 'Approved') {
      audit.status = 'Approved';
      audit.approvedAt = new Date();
      audit.approvedBy = req.user._id;
    } else if (decision === 'Changes Requested') {
      audit.status = 'Changes Requested';
    } else if (decision === 'Rejected') {
      audit.status = 'Rejected / Requires Rework';
    }

    audit.reviewComments = comments;
    audit.statusHistory.push({
      status: audit.status,
      changedBy: req.user._id,
      changedByName: req.user.fullName,
      changedAt: new Date(),
      remarks: `Review completed: ${decision}. Feedback: ${comments}`,
    });

    await audit.save();

    await AuditActivityLog.create({
      auditId: audit._id,
      actorId: req.user._id,
      actorName: req.user.fullName,
      actorRole: req.user.role,
      action: `AUDIT_REVIEW_${decision.toUpperCase()}`,
      details: { decision, comments },
    });

    res.status(200).json({
      success: true,
      message: `Audit review recorded: ${decision}.`,
      data: {
        audit,
        review,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getAuditReviews = async (req, res, next) => {
  try {
    const { auditId } = req.params;
    const reviews = await AuditReview.find({ auditId })
      .populate('reviewer', 'fullName email employeeId role')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    next(error);
  }
};

