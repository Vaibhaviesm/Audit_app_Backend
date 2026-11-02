const path = require('path');
const fs = require('fs');
const AuditAssignment = require('../models/AuditAssignment');
const AuditResponse = require('../models/AuditResponse');
const CorrectiveAction = require('../models/CorrectiveAction');
const AuditReport = require('../models/AuditReport');
const { generateAuditPDF } = require('../services/pdfService');

const reportsDir = process.env.VERCEL
  ? path.join('/tmp', 'uploads/reports')
  : path.join(__dirname, '../../uploads/reports');

if (!fs.existsSync(reportsDir)) {
  try {
    fs.mkdirSync(reportsDir, { recursive: true });
  } catch (e) {}
}

exports.generateReport = async (req, res, next) => {
  try {
    const { auditId, isDraft } = req.body;

    const audit = await AuditAssignment.findById(auditId)
      .populate('company')
      .populate('plant')
      .populate('assignedEmployee', 'fullName email employeeId')
      .populate('reviewer', 'fullName email employeeId');

    if (!audit) {
      return res.status(404).json({ success: false, message: 'Audit assignment not found' });
    }

    // Record-level authorization check:
    const user = req.user;
    if (user.role === 'Auditor/Employee') {
      if (!audit.assignedEmployee || audit.assignedEmployee._id.toString() !== user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied: You are not assigned to this audit.' });
      }
    } else if (user.role === 'Reviewer') {
      if (!audit.reviewer || audit.reviewer._id.toString() !== user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied: You are not assigned to review this audit.' });
      }
    }

    const responses = await AuditResponse.find({ auditId: audit._id }).sort({ sectionCode: 1, questionId: 1 });
    const correctiveActions = await CorrectiveAction.find({ auditId: audit._id });

    // Count existing reports for version
    const reportCount = await AuditReport.countDocuments({ auditId: audit._id });
    const version = reportCount + 1;
    const reportReference = `REP-${audit.auditReference}-V${version}`;
    const filename = `${reportReference}-${Date.now()}.pdf`;
    const outputPath = path.join(reportsDir, filename);

    const isDraftFlag = isDraft !== undefined ? isDraft : audit.status !== 'Approved';

    await generateAuditPDF({
      audit,
      responses,
      correctiveActions,
      outputPath,
      isDraft: isDraftFlag,
    });

    const stats = fs.statSync(outputPath);

    const reportDoc = await AuditReport.create({
      auditId: audit._id,
      reportReference,
      version,
      isDraft: isDraftFlag,
      filePath: `/uploads/reports/${filename}`,
      fileSize: stats.size,
      metadata: {
        companyName: audit.company?.name,
        plantName: audit.plant?.name,
        auditType: audit.auditType,
        totalQuestions: audit.progress?.totalQuestions || 136,
        answeredQuestions: audit.progress?.answeredQuestions || 0,
        criticalFindings: correctiveActions.filter(ca => ca.severity === 'Critical').length,
        highFindings: correctiveActions.filter(ca => ca.severity === 'High').length,
      },
      generatedBy: req.user._id,
      generatedAt: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'PDF report generated successfully.',
      data: reportDoc,
    });
  } catch (error) {
    next(error);
  }
};

exports.downloadReport = async (req, res, next) => {
  try {
    const report = await AuditReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const audit = await AuditAssignment.findById(report.auditId);
    if (!audit) {
      return res.status(404).json({ success: false, message: 'Associated audit assignment not found' });
    }

    // Record-level authorization check for PDF download:
    const user = req.user;
    if (user.role === 'Auditor/Employee') {
      if (!audit.assignedEmployee || audit.assignedEmployee.toString() !== user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied: You are not authorized to download this audit report.' });
      }
    } else if (user.role === 'Reviewer') {
      if (!audit.reviewer || audit.reviewer.toString() !== user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied: You are not authorized to download this audit report.' });
      }
    }

    const basePath = process.env.VERCEL ? '/tmp' : path.join(__dirname, '../..');
    const absolutePath = path.join(basePath, report.filePath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, message: 'Report PDF file not found on server.' });
    }

    res.download(absolutePath, `${report.reportReference}.pdf`);
  } catch (error) {
    next(error);
  }
};

exports.getReports = async (req, res, next) => {
  try {
    const { auditId } = req.query;
    const query = auditId ? { auditId } : {};

    const user = req.user;
    if (user.role === 'Auditor/Employee') {
      const myAudits = await AuditAssignment.find({ assignedEmployee: user._id }).select('_id');
      const myAuditIds = myAudits.map((a) => a._id);
      query.auditId = auditId ? { $in: [auditId].filter((id) => myAuditIds.some((ma) => ma.toString() === id.toString())) } : { $in: myAuditIds };
    } else if (user.role === 'Reviewer') {
      const myReviews = await AuditAssignment.find({ reviewer: user._id }).select('_id');
      const myAuditIds = myReviews.map((a) => a._id);
      query.auditId = auditId ? { $in: [auditId].filter((id) => myAuditIds.some((ma) => ma.toString() === id.toString())) } : { $in: myAuditIds };
    }

    const reports = await AuditReport.find(query)
      .populate('auditId', 'auditReference auditType status')
      .populate('generatedBy', 'fullName email')
      .sort({ generatedAt: -1 });

    res.status(200).json({
      success: true,
      count: reports.length,
      data: reports,
    });
  } catch (error) {
    next(error);
  }
};

