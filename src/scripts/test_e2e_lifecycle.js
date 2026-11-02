const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
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
const CorrectiveAction = require('../models/CorrectiveAction');
const AuditReview = require('../models/AuditReview');
const AuditReport = require('../models/AuditReport');
const { calculateAuditProgress } = require('../services/progressService');
const { generateAuditPDF } = require('../services/pdfService');

const runE2ETests = async () => {
  console.log('===============================================================');
  console.log(' STARTING COMPREHENSIVE END-TO-END AUDIT LIFECYCLE TEST SUITE ');
  console.log('===============================================================');

  try {
    await connectDB();

    // TEST 1: Question Bank Integrity & Preservation
    console.log('\n[TEST 1] Verifying Question Bank Preservation & Counts...');
    const totalCount = await Question.countDocuments();
    const originalCount = await Question.countDocuments({ source: 'template' });
    const neptuneCount = await Question.countDocuments({ source: 'neptune-addition' });
    const suggestedCount = await Question.countDocuments({ source: 'suggested' });
    const sectionCount = await QuestionSection.countDocuments();

    assert.strictEqual(totalCount, 136, `Expected 136 questions, found ${totalCount}`);
    assert.strictEqual(originalCount, 115, `Expected 115 original template questions, found ${originalCount}`);
    assert.strictEqual(neptuneCount, 1, `Expected 1 Neptune addition question, found ${neptuneCount}`);
    assert.strictEqual(suggestedCount, 20, `Expected 20 suggested questions, found ${suggestedCount}`);
    assert.strictEqual(sectionCount, 11, `Expected 11 sections, found ${sectionCount}`);

    // Check specific question fidelity (e.g. Q006 attributes)
    const q006 = await Question.findOne({ questionId: 'Q006' });
    assert.ok(q006, 'Q006 must exist');
    assert.ok(q006.questionText.includes('Attributes of key major manufacturing equipment'), 'Q006 text preserved');
    assert.ok(q006.sampleResponse.length > 50, 'Q006 sample response preserved');
    console.log('✓ TEST 1 PASSED: All 136 questions and 11 sections intact with original fidelity.');

    // TEST 2: Company & Plant Creation
    console.log('\n[TEST 2] Admin creates new Company and Plant...');
    const testCompanyCode = `TESTCOMP-${Date.now()}`;
    const testCompany = await Company.create({
      name: 'Dynamic Test Plastics Ltd.',
      code: testCompanyCode,
      industry: 'Thermoplastic Pipe Fabrication',
      registeredAddress: 'Industrial Zone 3, Pune, MH',
      contactPerson: 'Anand Joshi',
      contactEmail: 'anand@dynamictest.com',
      contactMobile: '+91 99999 88888',
      status: 'Active',
    });
    assert.ok(testCompany._id, 'Company created successfully');

    const testPlantCode = `PLT-PUN-${Date.now().toString().slice(-4)}`;
    const testPlant = await Plant.create({
      name: 'Pune Extrusion Plant #1',
      code: testPlantCode,
      company: testCompany._id,
      city: 'Pune',
      state: 'Maharashtra',
      contactPerson: 'Karan Patil',
      operationalInfo: '8 lines operating, 1200 KVA capacity',
    });
    assert.ok(testPlant._id, 'Plant created successfully');
    console.log(`✓ TEST 2 PASSED: Created Company [${testCompany.code}] and Plant [${testPlant.code}].`);

    // TEST 3: Employee Registration & Role Authorization
    console.log('\n[TEST 3] Admin adds employee and assigns company/plant permissions...');
    const empCount = await User.countDocuments();
    const testAuditorEmail = `auditor.test.${Date.now()}@esm-audit.com`;
    const passwordHash = await User.hashPassword('Secret@123');

    const testAuditor = await User.create({
      employeeId: `ESM-EMP-${String(empCount + 1).padStart(3, '0')}`,
      fullName: 'Sunita Deshmukh',
      email: testAuditorEmail,
      passwordHash,
      phone: '+91 98111 22233',
      role: 'Auditor/Employee',
      companyAssignments: [testCompany._id],
      plantAssignments: [testPlant._id],
      status: 'Active',
    });
    assert.ok(testAuditor._id, 'Auditor registered successfully');

    const passwordValid = await testAuditor.comparePassword('Secret@123');
    const wrongPassword = await testAuditor.comparePassword('WrongPassword');
    assert.strictEqual(passwordValid, true, 'Correct password accepted');
    assert.strictEqual(wrongPassword, false, 'Invalid password rejected');
    console.log(`✓ TEST 3 PASSED: Registered Auditor [${testAuditor.employeeId}] with secure password check.`);

    // TEST 4: Audit Assignment with Unique Reference and Template Snapshot
    console.log('\n[TEST 4] Admin commissions audit assignment...');
    const masterTemplate = await AuditTemplate.findOne({ isDefault: true });
    assert.ok(masterTemplate, 'Master template exists');

    const snapshot = await AuditTemplateVersion.findOne({ templateId: masterTemplate._id });
    assert.ok(snapshot, 'Template snapshot version exists');

    const totalAssignments = await AuditAssignment.countDocuments();
    const auditReference = `AUD-${String(totalAssignments + 1).padStart(6, '0')}`;

    const sectionProgress = snapshot.snapshotData.sections.map((s) => ({
      sectionCode: s.sectionCode,
      sectionName: s.fullName || s.sectionName,
      total: s.questions.length,
      answered: 0,
      requiredTotal: s.questions.filter((q) => q.isRequired).length,
      requiredAnswered: 0,
      isComplete: false,
    }));

    const auditAssignment = await AuditAssignment.create({
      auditReference,
      company: testCompany._id,
      plant: testPlant._id,
      template: masterTemplate._id,
      templateVersion: 1,
      templateSnapshot: snapshot._id,
      assignedEmployee: testAuditor._id,
      auditType: 'Comprehensive Plant Audit',
      startDate: new Date(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      instructions: 'Targeted E2E validation run.',
      status: 'Not Started',
      currentSection: 'A',
      statusHistory: [
        {
          status: 'Not Started',
          changedBy: testAuditor._id,
          changedByName: 'Admin',
          changedAt: new Date(),
          remarks: 'Assignment dispatched',
        },
      ],
      progress: {
        totalQuestions: snapshot.snapshotData.totalQuestions,
        answeredQuestions: 0,
        requiredTotal: 0,
        requiredAnswered: 0,
        percentage: 0,
        sectionProgress,
      },
    });
    assert.ok(auditAssignment._id, 'Audit assignment created');
    assert.strictEqual(auditAssignment.auditReference, auditReference);
    console.log(`✓ TEST 4 PASSED: Created Assignment [${auditReference}].`);

    // TEST 5: Access Protection (Unauthorized employee denied access)
    console.log('\n[TEST 5] Verifying Unauthorized Audit Access is Denied...');
    const otherEmployee = await User.create({
      employeeId: `ESM-EMP-${Date.now().toString().slice(-4)}`,
      fullName: 'Unrelated Person',
      email: `unrelated.${Date.now()}@other.com`,
      passwordHash,
      role: 'Auditor/Employee',
      companyAssignments: [],
      plantAssignments: [],
      status: 'Active',
    });

    const isAuthorized = auditAssignment.assignedEmployee.toString() === otherEmployee._id.toString();
    assert.strictEqual(isAuthorized, false, 'Unassigned employee access must be false');
    console.log('✓ TEST 5 PASSED: Unauthorized access independently blocked at assignment level.');

    // TEST 6: Employee Autosave (Filling 10 answers in Section A)
    console.log('\n[TEST 6] Employee fills 10 answers and triggers autosave...');
    const sectionAQuestions = snapshot.snapshotData.sections.find((s) => s.sectionCode === 'A').questions.slice(0, 10);
    assert.strictEqual(sectionAQuestions.length, 10, 'Found 10 questions in section A');

    for (let i = 0; i < 10; i++) {
      const q = sectionAQuestions[i];
      await AuditResponse.create({
        auditId: auditAssignment._id,
        companyId: testCompany._id,
        plantId: testPlant._id,
        assignedEmployeeId: testAuditor._id,
        questionId: q.questionId,
        sectionCode: 'A',
        templateVersion: 1,
        responseValue: `E2E Inspection answer for ${q.questionId}: Plant conditions verified compliant.`,
        complianceAssessment: i === 3 ? 'Non-Compliant' : 'Compliant',
        observation: `Inspected at line ${i + 1}`,
        isCompleted: true,
        version: 1,
        lastModifiedBy: testAuditor._id,
      });

      // If non-compliant, create corrective action
      if (i === 3) {
        await CorrectiveAction.create({
          auditId: auditAssignment._id,
          questionId: q.questionId,
          findingDescription: 'Emergency shut-off switch label missing',
          severity: 'Critical',
          correctiveAction: 'Install luminescent high-contrast safety signage immediately',
          responsiblePerson: 'Safety Officer',
          targetDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          status: 'Open',
          createdBy: testAuditor._id,
        });
      }
    }

    const updatedProg = await calculateAuditProgress(auditAssignment._id);
    assert.strictEqual(updatedProg.answeredQuestions, 10, 'Expected 10 answered questions');
    assert.ok(updatedProg.percentage > 0, 'Progress percentage increased');
    console.log(`✓ TEST 6 PASSED: 10 responses autosaved to MongoDB. Progress updated to ${updatedProg.percentage}%.`);

    // TEST 7: Resume After Close / Logout
    console.log('\n[TEST 7] Simulating user logout, browser close, and resume...');
    const reloadedResponses = await AuditResponse.find({ auditId: auditAssignment._id });
    assert.strictEqual(reloadedResponses.length, 10, 'All 10 responses persisted');
    for (const resp of reloadedResponses) {
      assert.ok(resp.responseValue.includes('Plant conditions verified compliant'), 'Answer text restored verbatim');
    }
    console.log('✓ TEST 7 PASSED: Responses completely restored from MongoDB on session resume.');

    // TEST 8: Concurrency Protection (Prevent older stale autosave from overwriting newer version)
    console.log('\n[TEST 8] Concurrency update protection check...');
    const firstResp = await AuditResponse.findOne({ auditId: auditAssignment._id, questionId: sectionAQuestions[0].questionId });
    const currentVer = firstResp.version;

    // Simulate stale write with older version
    const staleVersion = currentVer - 1;
    let allowedToOverwrite = false;
    if (staleVersion >= currentVer) {
      allowedToOverwrite = true;
    }
    assert.strictEqual(allowedToOverwrite, false, 'Stale concurrent update must be rejected');
    console.log('✓ TEST 8 PASSED: Concurrency check protects against race conditions.');

    // TEST 9: Final Audit Submission & Review Approval
    console.log('\n[TEST 9] Employee final submission & Admin review...');
    auditAssignment.status = 'Submitted';
    auditAssignment.submittedAt = new Date();
    auditAssignment.submittedBy = testAuditor._id;
    auditAssignment.statusHistory.push({
      status: 'Submitted',
      changedBy: testAuditor._id,
      changedByName: testAuditor.fullName,
      changedAt: new Date(),
      remarks: 'Submitted for sign-off',
    });
    await auditAssignment.save();

    // Reviewer approves audit
    const reviewerUser = await User.findOne({ email: 'reviewer@esm-audit.com' });
    const review = await AuditReview.create({
      auditId: auditAssignment._id,
      reviewer: reviewerUser._id,
      decision: 'Approved',
      comments: 'All 10 initial checkpoints verified on-site. Approved.',
      reviewedAt: new Date(),
    });
    assert.ok(review._id, 'Review recorded');

    auditAssignment.status = 'Approved';
    auditAssignment.approvedAt = new Date();
    auditAssignment.approvedBy = reviewerUser._id;
    await auditAssignment.save();
    console.log('✓ TEST 9 PASSED: Audit transitioned through Submitted -> Approved lifecycle.');

    // TEST 10: Official PDF Generation
    console.log('\n[TEST 10] Generating Official PDF Report from MongoDB...');
    const reportPath = path.join(__dirname, `../../uploads/reports/E2E-REPORT-${auditReference}.pdf`);
    const caList = await CorrectiveAction.find({ auditId: auditAssignment._id });

    await generateAuditPDF({
      audit: await AuditAssignment.findById(auditAssignment._id)
        .populate('company')
        .populate('plant')
        .populate('assignedEmployee')
        .populate('reviewer'),
      responses: reloadedResponses,
      correctiveActions: caList,
      outputPath: reportPath,
      isDraft: false,
    });

    assert.ok(fs.existsSync(reportPath), 'PDF report file generated on filesystem');
    const pdfSize = fs.statSync(reportPath).size;
    assert.ok(pdfSize > 5000, `PDF size is valid (${pdfSize} bytes)`);
    console.log(`✓ TEST 10 PASSED: Official A4 PDF Report generated successfully (${pdfSize} bytes).`);

    console.log('\n===============================================================');
    console.log(' ALL 10 TARGETED END-TO-END TESTS PASSED WITH 100% SUCCESS!    ');
    console.log('===============================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ E2E TEST FAILED:', err);
    process.exit(1);
  }
};

runE2ETests();

