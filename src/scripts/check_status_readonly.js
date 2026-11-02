const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Company = require('../models/Company');
const Plant = require('../models/Plant');
const Question = require('../models/Question');
const QuestionSection = require('../models/QuestionSection');
const AuditAssignment = require('../models/AuditAssignment');
const AuditResponse = require('../models/AuditResponse');
const AuditTemplate = require('../models/AuditTemplate');
const AuditTemplateVersion = require('../models/AuditTemplateVersion');

const inspect = async () => {
  try {
    await connectDB();

    console.log('=== CHECK 1: DATABASE RECORD AUDIT (LOOKING FOR TEST/DUMMY RECORDS) ===');
    const companies = await Company.find().select('_id name code status createdAt').lean();
    console.log(`\nCompanies Total (${companies.length}):`);
    companies.forEach(c => console.log(` - ID: ${c._id} | Code: ${c.code} | Name: ${c.name} | Status: ${c.status} | Created: ${c.createdAt}`));

    const plants = await Plant.find().select('_id name code company status createdAt').lean();
    console.log(`\nPlants Total (${plants.length}):`);
    plants.forEach(p => console.log(` - ID: ${p._id} | Code: ${p.code} | Name: ${p.name} | Company: ${p.company} | Created: ${p.createdAt}`));

    const users = await User.find().select('_id employeeId fullName email role status createdAt').lean();
    console.log(`\nUsers/Employees Total (${users.length}):`);
    users.forEach(u => console.log(` - ID: ${u._id} | EmpID: ${u.employeeId} | Name: ${u.fullName} | Email: ${u.email} | Role: ${u.role} | Status: ${u.status} | Created: ${u.createdAt}`));

    const audits = await AuditAssignment.find().select('_id auditReference company plant assignedEmployee status progress.totalQuestions progress.answeredQuestions createdAt').lean();
    console.log(`\nAudit Assignments Total (${audits.length}):`);
    audits.forEach(a => console.log(` - ID: ${a._id} | Ref: ${a.auditReference} | Comp: ${a.company} | Emp: ${a.assignedEmployee} | Status: ${a.status} | Qs: ${a.progress?.answeredQuestions}/${a.progress?.totalQuestions} | Created: ${a.createdAt}`));

    const customQuestions = await Question.find({ source: 'custom' }).select('_id questionId sectionCode questionText status isArchived createdAt').lean();
    console.log(`\nCustom Questions Total (${customQuestions.length}):`);
    customQuestions.forEach(q => console.log(` - ID: ${q._id} | QID: ${q.questionId} | Sec: ${q.sectionCode} | Status: ${q.status} | Archived: ${q.isArchived} | Text: ${q.questionText}`));

    console.log('\n=== CHECK 4: ORIGINAL 136 QUESTIONS & 88 NEPTUNE RESPONSES INTEGRITY ===');
    const templateQ = await Question.countDocuments({ source: 'template' });
    const neptuneQ = await Question.countDocuments({ source: 'neptune-addition' });
    const suggestedQ = await Question.countDocuments({ source: 'suggested' });
    const originalTotal = templateQ + neptuneQ + suggestedQ;
    const systemOriginals = await Question.countDocuments({ isSystemOriginal: true });

    console.log(`Template Source Questions: ${templateQ} (Expected: 115)`);
    console.log(`Neptune Addition: ${neptuneQ} (Expected: 1)`);
    console.log(`Suggested Questions: ${suggestedQ} (Expected: 20)`);
    console.log(`Total Original Questions: ${originalTotal} (Expected: 136)`);
    console.log(`System Original Flags: ${systemOriginals} (Expected: 136)`);

    const audit1 = await AuditAssignment.findOne({ auditReference: 'AUD-000001' });
    let neptuneResponsesCount = 0;
    if (audit1) {
      neptuneResponsesCount = await AuditResponse.countDocuments({ auditId: audit1._id });
    }
    console.log(`AUD-000001 Historical Neptune Responses: ${neptuneResponsesCount} (Expected: 88)`);

    console.log('\n=== CHECK 3: TEMPLATE VERSIONS & SNAPSHOT IMMUTABILITY ===');
    const templates = await AuditTemplate.find().lean();
    templates.forEach(t => console.log(`Template: ${t.code} | Name: ${t.name} | Total Qs: ${t.totalQuestions} | Version: ${t.version}`));

    const snapshots = await AuditTemplateVersion.find().select('_id templateId versionNumber name snapshotData.totalQuestions createdAt').lean();
    console.log(`Snapshots count: ${snapshots.length}`);
    snapshots.forEach(s => console.log(` - ID: ${s._id} | Version: ${s.versionNumber} | Total Qs: ${s.snapshotData?.totalQuestions} | Name: ${s.name}`));

    process.exit(0);
  } catch (err) {
    console.error('Error during check:', err);
    process.exit(1);
  }
};

inspect();

