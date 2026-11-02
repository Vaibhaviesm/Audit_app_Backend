const crypto = require('crypto');
const AuditAssignment = require('../models/AuditAssignment');
const AuditInvitation = require('../models/AuditInvitation');
const { sendAuditInvitationEmail } = require('../services/emailService');
const { APP_BASE_URL } = require('../config/env');

exports.shareAudit = async (req, res, next) => {
  try {
    const { auditId, shareType, recipientEmail, recipientPhone, instructions } = req.body;

    if (!auditId || !shareType) {
      return res.status(400).json({
        success: false,
        message: 'Audit ID and share type (Email, WhatsApp, Direct Link) are required.',
      });
    }

    const audit = await AuditAssignment.findById(auditId)
      .populate('company', 'name code')
      .populate('plant', 'name code')
      .populate('assignedEmployee', 'fullName email phone');

    if (!audit) {
      return res.status(404).json({ success: false, message: 'Audit assignment not found' });
    }

    // Generate secure opaque token
    const token = crypto.randomBytes(24).toString('hex');
    const auditUrl = `${APP_BASE_URL}/audit/${audit.auditReference}?token=${token}`;

    const invitation = await AuditInvitation.create({
      auditId: audit._id,
      auditReference: audit.auditReference,
      token,
      shareType,
      recipientEmail: recipientEmail || audit.assignedEmployee?.email,
      recipientPhone: recipientPhone || audit.assignedEmployee?.phone,
      sentBy: req.user._id,
      sentAt: new Date(),
      status: 'Sent',
    });

    let result = {
      auditReference: audit.auditReference,
      shareType,
      auditUrl,
      token,
    };

    if (shareType === 'Email') {
      const targetEmail = recipientEmail || audit.assignedEmployee?.email;
      const emailResult = await sendAuditInvitationEmail({
        recipientEmail: targetEmail,
        employeeName: audit.assignedEmployee?.fullName || 'Auditor',
        companyName: audit.company?.name || 'Assigned Company',
        plantName: audit.plant?.name || 'Plant Facility',
        auditReference: audit.auditReference,
        auditType: audit.auditType,
        dueDate: audit.dueDate,
        instructions: instructions || audit.instructions,
        auditUrl,
      });

      result.emailStatus = emailResult;
    } else if (shareType === 'WhatsApp') {
      const message = `*ESM Plant Audit Assignment*\n\n` +
        `Hello ${audit.assignedEmployee?.fullName},\n` +
        `You have been assigned to conduct an on-site audit for:\n` +
        `*Company:* ${audit.company?.name}\n` +
        `*Plant:* ${audit.plant?.name}\n` +
        `*Audit Ref:* ${audit.auditReference}\n` +
        `*Due Date:* ${new Date(audit.dueDate).toLocaleDateString()}\n\n` +
        `*Secure Audit Link:* ${auditUrl}\n\n` +
        `Please log in with your ESM credentials to begin.`;

      const phoneClean = (recipientPhone || audit.assignedEmployee?.phone || '').replace(/[^0-9]/g, '');
      const waUrl = phoneClean
        ? `https://wa.me/${phoneClean}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;

      result.whatsappShareUrl = waUrl;
      result.previewMessage = message;
    }

    res.status(200).json({
      success: true,
      message: `Audit shared successfully via ${shareType}.`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyInvitationToken = async (req, res, next) => {
  try {
    const { token } = req.params;
    const invitation = await AuditInvitation.findOne({ token })
      .populate('auditId', 'auditReference assignedEmployee status');

    if (!invitation) {
      return res.status(404).json({ success: false, message: 'Invalid or expired invitation token.' });
    }

    invitation.status = 'Opened';
    invitation.openedAt = new Date();
    await invitation.save();

    res.status(200).json({
      success: true,
      data: invitation,
    });
  } catch (error) {
    next(error);
  }
};

