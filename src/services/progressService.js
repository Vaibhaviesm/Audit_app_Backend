const AuditAssignment = require('../models/AuditAssignment');
const AuditResponse = require('../models/AuditResponse');
const AuditTemplateVersion = require('../models/AuditTemplateVersion');

const isAnswerValid = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return !isNaN(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return false;
};

const calculateAuditProgress = async (auditId) => {
  const audit = await AuditAssignment.findById(auditId);
  if (!audit) throw new Error('Audit assignment not found');

  // Fetch template snapshot
  const snapshot = await AuditTemplateVersion.findById(audit.templateSnapshot);
  if (!snapshot || !snapshot.snapshotData || !snapshot.snapshotData.sections) {
    throw new Error('Audit template snapshot not found');
  }

  // Fetch all saved responses for this audit
  const savedResponses = await AuditResponse.find({ auditId: audit._id });
  const responseMap = {};
  savedResponses.forEach(r => {
    responseMap[r.questionId] = r;
  });

  const sections = snapshot.snapshotData.sections;
  let totalAuditQuestions = 0;
  let totalAuditAnswered = 0;
  let totalRequired = 0;
  let totalRequiredAnswered = 0;

  const sectionProgress = [];

  for (const sec of sections) {
    const qList = sec.questions || [];
    let secTotal = qList.length;
    let secAnswered = 0;
    let secReqTotal = 0;
    let secReqAnswered = 0;

    for (const q of qList) {
      totalAuditQuestions++;
      if (q.isRequired) {
        secReqTotal++;
        totalRequired++;
      }

      const resp = responseMap[q.questionId];
      if (resp && isAnswerValid(resp.responseValue)) {
        secAnswered++;
        totalAuditAnswered++;
        if (q.isRequired) {
          secReqAnswered++;
          totalRequiredAnswered++;
        }
      }
    }

    const isComplete = secTotal > 0 && (secReqTotal > 0 ? secReqAnswered === secReqTotal : secAnswered === secTotal);

    sectionProgress.push({
      sectionCode: sec.sectionCode,
      sectionName: sec.fullName || sec.sectionName,
      total: secTotal,
      answered: secAnswered,
      requiredTotal: secReqTotal,
      requiredAnswered: secReqAnswered,
      isComplete: isComplete,
    });
  }

  const percentage = totalAuditQuestions > 0 ? Math.round((totalAuditAnswered / totalAuditQuestions) * 100) : 0;

  audit.progress = {
    totalQuestions: totalAuditQuestions,
    answeredQuestions: totalAuditAnswered,
    requiredTotal: totalRequired,
    requiredAnswered: totalRequiredAnswered,
    percentage: percentage,
    sectionProgress: sectionProgress,
  };

  // If status is Not Started and user has answered or saved responses, change to In Progress
  if (audit.status === 'Not Started' && (totalAuditAnswered > 0 || savedResponses.length > 0)) {
    audit.status = 'In Progress';
    audit.statusHistory.push({
      status: 'In Progress',
      changedAt: new Date(),
      remarks: 'Responses recorded in audit form',
    });
  }

  audit.lastSavedAt = new Date();
  await audit.save();

  return audit.progress;
};

module.exports = {
  isAnswerValid,
  calculateAuditProgress,
};

