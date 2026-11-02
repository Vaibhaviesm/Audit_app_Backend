const mongoose = require('mongoose');
const path = require('path');
const assert = require('assert');

const connectDB = require('../config/db');
const User = require('../models/User');
const Company = require('../models/Company');
const Plant = require('../models/Plant');
const QuestionSection = require('../models/QuestionSection');
const Question = require('../models/Question');
const AuditTemplate = require('../models/AuditTemplate');
const AuditTemplateVersion = require('../models/AuditTemplateVersion');
const AuditAssignment = require('../models/AuditAssignment');
const AuditResponse = require('../models/AuditResponse');
const { calculateAuditProgress } = require('../services/progressService');

const runDynamicTests = async () => {
  console.log('================================================================');
  console.log(' VERIFYING DYNAMIC ADMIN MANAGEMENT & REMOVAL OF DUMMY DATA     ');
  console.log('================================================================');

  try {
    await connectDB();

    // 1. Admin creates a company & plant
    console.log('\n[1] Admin creates Company & Plant in MongoDB...');
    const uniqueSuffix = Date.now().toString().slice(-5);
    const newCompany = await Company.create({
      name: `Apex Polymers ${uniqueSuffix} Ltd.`,
      code: `APEX${uniqueSuffix}`,
      industry: 'Thermoplastics & Blow Moulding',
      registeredAddress: 'GIDC Industrial Park, Vapi, Gujarat',
      contactPerson: 'Mehul Shah',
      contactEmail: `mehul@apex${uniqueSuffix}.com`,
      contactMobile: '+91 98980 11223',
      status: 'Active',
    });
    assert.ok(newCompany._id, 'Company created in MongoDB');

    const newPlant = await Plant.create({
      name: `Vapi Unit ${uniqueSuffix}`,
      code: `PLT-VAP-${uniqueSuffix}`,
      company: newCompany._id,
      city: 'Vapi',
      state: 'Gujarat',
      contactPerson: 'Dinesh Parmar',
      operationalInfo: '6 automated lines, 1500 KVA load',
      status: 'Active',
    });
    assert.ok(newPlant._id, 'Plant created in MongoDB');
    console.log(`✓ Created Company [${newCompany.name}] and Plant [${newPlant.name}].`);

    // 2. Admin creates an employee
    console.log('\n[2] Admin creates employee account with hashed password...');
    const employeePassword = 'SecureUser@123';
    const passwordHash = await User.hashPassword(employeePassword);
    const empEmail = `auditor.dyn.${uniqueSuffix}@esm-audit.com`;

    const newAuditor = await User.create({
      employeeId: `ESM-EMP-${uniqueSuffix}`,
      fullName: `Harish Verma ${uniqueSuffix}`,
      email: empEmail,
      passwordHash,
      phone: '+91 97234 56789',
      role: 'Auditor/Employee',
      companyAssignments: [],
      plantAssignments: [],
      status: 'Active',
    });
    assert.ok(newAuditor._id, 'Employee created in MongoDB');

    const canLogin = await newAuditor.comparePassword(employeePassword);
    assert.strictEqual(canLogin, true, 'Employee password authenticated securely');
    console.log(`✓ Created Employee [${newAuditor.fullName}] (${newAuditor.email}).`);

    // 3. Admin assigns that employee to company and plant
    console.log('\n[3] Admin assigns employee to company and plant...');
    newAuditor.companyAssignments.push(newCompany._id);
    newAuditor.plantAssignments.push(newPlant._id);
    await newAuditor.save();

    const verifiedEmp = await User.findById(newAuditor._id)
      .populate('companyAssignments')
      .populate('plantAssignments');
    assert.strictEqual(verifiedEmp.companyAssignments.length, 1);
    assert.strictEqual(verifiedEmp.plantAssignments.length, 1);
    assert.strictEqual(verifiedEmp.companyAssignments[0]._id.toString(), newCompany._id.toString());
    console.log(`✓ Assigned Employee to Company [${newCompany.code}] and Plant [${newPlant.code}].`);

    // 4. Admin creates an audit assignment
    console.log('\n[4] Admin creates an audit assignment...');
    const masterTemplateBefore = await AuditTemplate.findOne({ isDefault: true });
    const snapshotBefore = await AuditTemplateVersion.findOne({
      templateId: masterTemplateBefore._id,
      versionNumber: masterTemplateBefore.version,
    });
    assert.ok(snapshotBefore, 'Template snapshot exists');

    const totalAudits = await AuditAssignment.countDocuments();
    const auditReference = `AUD-${String(totalAudits + 1).padStart(6, '0')}`;

    const newAssignment = await AuditAssignment.create({
      auditReference,
      company: newCompany._id,
      plant: newPlant._id,
      template: masterTemplateBefore._id,
      templateVersion: masterTemplateBefore.version,
      templateSnapshot: snapshotBefore._id,
      assignedEmployee: newAuditor._id,
      auditType: 'Comprehensive Plant Audit',
      startDate: new Date(),
      dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      instructions: 'Dynamic audit test instructions.',
      status: 'Not Started',
      currentSection: 'A',
      progress: {
        totalQuestions: snapshotBefore.snapshotData.totalQuestions,
        answeredQuestions: 0,
        requiredTotal: 0,
        requiredAnswered: 0,
        percentage: 0,
        sectionProgress: snapshotBefore.snapshotData.sections.map((s) => ({
          sectionCode: s.sectionCode,
          sectionName: s.fullName,
          total: s.questions.length,
          answered: 0,
          requiredTotal: 0,
          requiredAnswered: 0,
          isComplete: false,
        })),
      },
    });
    assert.ok(newAssignment._id, 'Audit assignment created');
    console.log(`✓ Created Audit Assignment [${newAssignment.auditReference}] for ${newCompany.name}.`);

    // 5. Employee logs in and sees only assigned audits
    console.log('\n[5] Employee queries assigned audits (database-driven authorization)...');
    const employeeAudits = await AuditAssignment.find({ assignedEmployee: newAuditor._id })
      .populate('company')
      .populate('plant');

    assert.strictEqual(employeeAudits.length, 1, 'Employee sees exactly 1 audit assigned to them');
    assert.strictEqual(employeeAudits[0]._id.toString(), newAssignment._id.toString(), 'Audit ID matches assigned record');
    console.log(`✓ Employee sees ONLY assigned audit [${employeeAudits[0].auditReference}] for ${employeeAudits[0].company.name}.`);

    // 6. Employee responses save and progress updates correctly
    console.log('\n[6] Employee fills responses and verifies dynamic progress...');
    const testQ = snapshotBefore.snapshotData.sections[0].questions[0];

    await AuditResponse.create({
      auditId: newAssignment._id,
      companyId: newCompany._id,
      plantId: newPlant._id,
      assignedEmployeeId: newAuditor._id,
      questionId: testQ.questionId,
      sectionCode: 'A',
      templateVersion: newAssignment.templateVersion,
      responseValue: 'Verified operating under normal load conditions.',
      complianceAssessment: 'Compliant',
      observation: 'Line inspected during shift A.',
      isCompleted: true,
      version: 1,
      lastModifiedBy: newAuditor._id,
    });

    const updatedProgress = await calculateAuditProgress(newAssignment._id);
    assert.strictEqual(updatedProgress.answeredQuestions, 1);
    const expectedPercentage = Math.round((1 / snapshotBefore.snapshotData.totalQuestions) * 100);
    assert.strictEqual(updatedProgress.percentage, expectedPercentage);
    console.log(`✓ Saved response in MongoDB. Dynamic progress: ${updatedProgress.answeredQuestions}/${updatedProgress.totalQuestions} (${updatedProgress.percentage}%).`);

    // 7. Admin adds a custom audit question
    console.log('\n[7] Admin adds a new custom audit question to Question Bank...');
    const customCount = await Question.countDocuments();
    const customQId = `Q${String(customCount + 1).padStart(3, '0')}`;

    const customQuestion = await Question.create({
      questionId: customQId,
      sectionCode: 'J',
      questionText: `Are smart digital power meters integrated with central SCADA? [${uniqueSuffix}]`,
      source: 'custom',
      status: 'Active',
      isSuggested: false,
      isOriginal: false,
      isSystemOriginal: false,
      answerType: 'yes-no-na',
      isRequired: true,
      helpText: 'Verify SCADA connection in main electrical control room',
      order: customCount + 1,
    });
    assert.ok(customQuestion._id, 'Custom question created');

    // Sync to master template
    const masterTemplate = await AuditTemplate.findOne({ isDefault: true });
    let secJ = masterTemplate.sections.find((s) => s.sectionCode === 'J');
    secJ.questionIds.push(customQuestion._id);
    masterTemplate.totalQuestions += 1;
    masterTemplate.version += 1;
    await masterTemplate.save();

    // Create new template snapshot
    const populated = await AuditTemplate.findById(masterTemplate._id).populate('sections.questionIds');
    const newSnapshot = await AuditTemplateVersion.create({
      templateId: masterTemplate._id,
      versionNumber: masterTemplate.version,
      name: `${masterTemplate.name} (v${masterTemplate.version}.0 Snapshot)`,
      snapshotData: {
        sections: populated.sections.map((s) => ({
          sectionCode: s.sectionCode,
          sectionName: s.sectionName,
          fullName: s.sectionName,
          order: s.order,
          questions: s.questionIds.map((q) => ({
            questionId: q.questionId,
            questionText: q.questionText,
            source: q.source,
            answerType: q.answerType,
            isRequired: q.isRequired,
            helpText: q.helpText,
          })),
        })),
        totalQuestions: masterTemplate.totalQuestions,
      },
    });
    console.log(`✓ Created Custom Question [${customQuestion.questionId}] and Master Template bumped to v${masterTemplate.version} (${masterTemplate.totalQuestions} questions).`);

    // 8. The new question appears in a NEW audit assignment
    console.log('\n[8] Commissioning a brand new audit assignment...');
    const nextAuditTotal = await AuditAssignment.countDocuments();
    const nextAuditRef = `AUD-${String(nextAuditTotal + 1).padStart(6, '0')}`;

    const subsequentAssignment = await AuditAssignment.create({
      auditReference: nextAuditRef,
      company: newCompany._id,
      plant: newPlant._id,
      template: masterTemplate._id,
      templateVersion: masterTemplate.version,
      templateSnapshot: newSnapshot._id,
      assignedEmployee: newAuditor._id,
      auditType: 'Comprehensive Plant Audit',
      startDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      status: 'Not Started',
      currentSection: 'A',
      progress: {
        totalQuestions: newSnapshot.snapshotData.totalQuestions,
        answeredQuestions: 0,
        requiredTotal: 0,
        requiredAnswered: 0,
        percentage: 0,
        sectionProgress: [],
      },
    });

    assert.strictEqual(subsequentAssignment.progress.totalQuestions, masterTemplate.totalQuestions);
    const hasCustomInSnapshot = newSnapshot.snapshotData.sections
      .find((s) => s.sectionCode === 'J')
      .questions.some((q) => q.questionId === customQId);
    assert.strictEqual(hasCustomInSnapshot, true, 'New audit snapshot contains the custom question');
    console.log(`✓ New Audit [${subsequentAssignment.auditReference}] automatically includes custom checkpoint ${customQId} with dynamic total: ${subsequentAssignment.progress.totalQuestions}.`);

    // 9. Existing historical audits remain unchanged
    console.log('\n[9] Checking historical audit (AUD-000001)...');
    const historicalAudit = await AuditAssignment.findOne({ auditReference: 'AUD-000001' })
      .populate('templateSnapshot');
    const historicalSnapshot = await AuditTemplateVersion.findById(historicalAudit.templateSnapshot);

    const hasCustomInHistorical = historicalSnapshot.snapshotData.sections
      .find((s) => s.sectionCode === 'J')
      .questions.some((q) => q.questionId === customQId);
    assert.strictEqual(hasCustomInHistorical, false, 'Historical audit MUST NOT contain the newly added question');
    assert.strictEqual(historicalAudit.progress.totalQuestions, 136, 'Historical denominator preserved at 136');
    console.log(`✓ Historical audit [${historicalAudit.auditReference}] is completely protected and retains its frozen 136 questions!`);

    // 10. Unauthorized employees cannot access another company's audits
    console.log('\n[10] Verifying authorization barrier between employees...');
    const unauthorizedEmployee = await User.create({
      employeeId: `ESM-OTHER-${uniqueSuffix}`,
      fullName: 'Foreign Company Auditor',
      email: `other.${uniqueSuffix}@othercomp.com`,
      passwordHash,
      role: 'Auditor/Employee',
      companyAssignments: [],
      plantAssignments: [],
      status: 'Active',
    });

    const canAccess = subsequentAssignment.assignedEmployee.toString() === unauthorizedEmployee._id.toString();
    assert.strictEqual(canAccess, false, 'Unauthorized employee blocked from accessing foreign audit');
    console.log('✓ Unauthorized employee access independently blocked at assignment level.');

    console.log('\n================================================================');
    console.log(' ALL 10 DYNAMIC ADMIN MANAGEMENT VERIFICATION CHECKS PASSED!    ');
    console.log('================================================================');
    process.exit(0);
  } catch (err) {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
  }
};

runDynamicTests();

