const Company = require('../models/Company');
const Plant = require('../models/Plant');
const User = require('../models/User');
const AuditAssignment = require('../models/AuditAssignment');
const CorrectiveAction = require('../models/CorrectiveAction');

exports.getDashboardStats = async (req, res, next) => {
  try {
    const { companyId } = req.query;
    const auditQuery = companyId ? { company: companyId } : {};

    const [
      totalCompanies,
      totalPlants,
      totalEmployees,
      totalAudits,
      notStartedAudits,
      inProgressAudits,
      submittedAudits,
      approvedAudits,
      criticalFindings,
      overdueAudits,
      auditsWithProgress,
    ] = await Promise.all([
      Company.countDocuments(companyId ? { _id: companyId } : {}),
      Plant.countDocuments(companyId ? { company: companyId } : {}),
    User.countDocuments({ role: { $in: ['Super Admin', 'Admin', 'Auditor/Employee', 'Reviewer'] } }),
      AuditAssignment.countDocuments(auditQuery),
      AuditAssignment.countDocuments({ ...auditQuery, status: 'Not Started' }),
      AuditAssignment.countDocuments({ ...auditQuery, status: 'In Progress' }),
      AuditAssignment.countDocuments({ ...auditQuery, status: { $in: ['Submitted', 'Under Review'] } }),
      AuditAssignment.countDocuments({ ...auditQuery, status: 'Approved' }),
      CorrectiveAction.countDocuments({ severity: 'Critical', status: { $ne: 'Verified' } }),
      AuditAssignment.countDocuments({
        ...auditQuery,
        dueDate: { $lt: new Date() },
        status: { $nin: ['Approved', 'Submitted'] },
      }),
      AuditAssignment.find(auditQuery).select('progress.percentage'),
    ]);

    // Calculate real average completion percentage
    let avgCompletion = 0;
    if (auditsWithProgress.length > 0) {
      const sum = auditsWithProgress.reduce((acc, curr) => acc + (curr.progress?.percentage || 0), 0);
      avgCompletion = Math.round(sum / auditsWithProgress.length);
    }

    // Status breakdown chart data
    const statusCounts = [
      { name: 'Not Started', value: notStartedAudits, color: '#94a3b8' },
      { name: 'In Progress', value: inProgressAudits, color: '#e89b3c' },
      { name: 'Submitted / Review', value: submittedAudits, color: '#3b82f6' },
      { name: 'Approved', value: approvedAudits, color: '#16a34a' },
    ];

    // Overdue audits list
    const overdueAuditsList = await AuditAssignment.find({
      ...auditQuery,
      dueDate: { $lt: new Date() },
      status: { $nin: ['Approved', 'Submitted'] },
    })
      .select('auditReference dueDate status company plant assignedEmployee')
      .populate('company', 'name code')
      .populate('plant', 'name city')
      .sort({ dueDate: 1 })
      .limit(5);

    // Recent audits
    const recentAudits = await AuditAssignment.find(auditQuery)
      .populate('company', 'name code')
      .populate('plant', 'name city')
      .populate('assignedEmployee', 'fullName email')
      .sort({ updatedAt: -1 })
      .limit(6);

    res.status(200).json({
      success: true,
      data: {
        totalCompanies,
        totalPlants,
        totalEmployees,
        totalAudits,
        assignedAudits: totalAudits,
        notStartedAudits,
        inProgressAudits,
        submittedAudits,
        approvedAudits,
        overdueAudits,
        overdueAuditsList,
        criticalFindings,
        avgCompletion,
        statusCounts,
        recentAudits,
      },
    });
  } catch (error) {
    next(error);
  }
};

