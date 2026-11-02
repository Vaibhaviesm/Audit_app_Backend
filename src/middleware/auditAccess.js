const AuditAssignment = require('../models/AuditAssignment');
const { logSecurityEvent } = require('../services/securityLogger');

const verifyAuditAccess = async (req, res, next) => {
  try {
    const auditId = req.params.auditId || req.params.id || req.body.auditId;

    if (!auditId) {
      return res.status(400).json({
        success: false,
        message: 'Audit ID or reference is required.',
      });
    }

    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
      });
    }

    // Query either by MongoDB _id or by auditReference (e.g. AUD-000001)
    const isObjectId = auditId.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: auditId } : { auditReference: auditId };

    const audit = await AuditAssignment.findOne(query)
      .populate('company', 'name code industry')
      .populate('plant', 'name code city state')
      .populate('assignedEmployee', 'employeeId fullName email role status')
      .populate('reviewer', 'employeeId fullName email role status');

    if (!audit) {
      return res.status(404).json({
        success: false,
        message: 'Audit assignment not found.',
      });
    }

    // Cross-company & cross-plant validation if specified in request
    const requestedCompanyId = req.body?.companyId || req.query?.companyId;
    if (requestedCompanyId && audit.company?._id && requestedCompanyId.toString() !== audit.company._id.toString()) {
      await logSecurityEvent({
        userId: user._id,
        email: user.email,
        eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        req,
        details: { reason: 'Cross-company audit mismatch', requestedCompanyId, auditCompanyId: audit.company._id },
      });
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Audit does not belong to the specified company.',
      });
    }

    const requestedPlantId = req.body?.plantId || req.query?.plantId;
    if (requestedPlantId && audit.plant?._id && requestedPlantId.toString() !== audit.plant._id.toString()) {
      await logSecurityEvent({
        userId: user._id,
        email: user.email,
        eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        req,
        details: { reason: 'Cross-plant audit mismatch', requestedPlantId, auditPlantId: audit.plant._id },
      });
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Audit does not belong to the specified plant facility.',
      });
    }

    // 1. Super Admin and Admin have global audit access
    if (user.role === 'Super Admin' || user.role === 'Admin') {
      req.audit = audit;
      return next();
    }

    // 2. Reviewer access: must be explicitly assigned as reviewer
    if (user.role === 'Reviewer') {
      if (audit.reviewer && audit.reviewer._id.toString() === user._id.toString()) {
        req.audit = audit;
        return next();
      }
      await logSecurityEvent({
        userId: user._id,
        email: user.email,
        eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        req,
        details: { reason: 'Reviewer attempted access to unassigned audit', auditReference: audit.auditReference },
      });
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not assigned as the reviewer for this plant audit.',
      });
    }

    // 3. Auditor/Employee access: must be explicitly assigned
    if (user.role === 'Auditor/Employee') {
      if (audit.assignedEmployee && audit.assignedEmployee._id.toString() === user._id.toString()) {
        // Lifecycle status check: cannot edit if already submitted or approved
        const path = req.path || req.originalUrl || '';
        const isMutatingResponses = path.includes('/save-draft') || path.includes('/submit-section') || path.includes('/upload-evidence');
        if (isMutatingResponses && ['Submitted', 'Under Review', 'Approved'].includes(audit.status)) {
          return res.status(403).json({
            success: false,
            message: `Editing locked: Audit is currently '${audit.status}' and cannot be modified.`,
          });
        }

        req.audit = audit;
        return next();
      }

      await logSecurityEvent({
        userId: user._id,
        email: user.email,
        eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        req,
        details: { reason: 'Employee attempted access to unassigned audit', auditReference: audit.auditReference },
      });
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not assigned to this plant audit.',
      });
    }

    return res.status(403).json({
      success: false,
      message: 'Access denied: Unauthorized role.',
    });
  } catch (error) {
    console.error('[VerifyAuditAccess Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal error verifying audit authorization.',
    });
  }
};

module.exports = { verifyAuditAccess };
