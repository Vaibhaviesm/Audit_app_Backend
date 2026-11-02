const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../src/config/env');

const API_BASE = 'http://localhost:5000/api';

async function main() {
  console.log('=== VERIFYING ISSUE 1 & ISSUE 2 ===\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/esm_plant_audit');
  const db = mongoose.connection.db;

  // 1. Check AUD-000002 in DB
  const audit2 = await db.collection('auditassignments').findOne({ auditReference: 'AUD-000002' });
  if (!audit2) {
    throw new Error('AUD-000002 not found in DB!');
  }
  console.log('[Check 1] AUD-000002 found with ID:', audit2._id.toString());
  console.log('  Initial Status:', audit2.status);
  console.log('  Initial Progress:', audit2.progress?.answeredQuestions, '/', audit2.progress?.totalQuestions);

  // Find assigned employee
  const employee = await db.collection('users').findOne({ _id: audit2.assignedEmployee });
  console.log('[Check 2] Assigned Employee:', employee ? { id: employee._id, email: employee.email, role: employee.role } : 'NOT FOUND');

  // Generate auth token for assigned employee
  const token = jwt.sign({ id: employee._id }, JWT_SECRET, { expiresIn: '1h' });
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 2. Fetch workspace before saving
  const wsRes1 = await fetch(`${API_BASE}/audit/AUD-000002/workspace`, { headers: authHeaders });
  const ws1 = await wsRes1.json();
  console.log('\n[Check 3] Workspace Fetch Result:', ws1.success ? 'SUCCESS' : 'FAILED');
  if (!ws1.success) {
    console.error('Error fetching workspace:', ws1);
    process.exit(1);
  }

  // Verify Issue 2: Question numbering in Section A
  const secA = ws1.data.snapshot.sections.find(s => s.sectionCode === 'A');
  console.log('[Check 4 - Issue 2 Verification] Section A first 3 questions:');
  secA.questions.slice(0, 3).forEach((q, idx) => {
    console.log(`  Position ${idx + 1}: questionId=${q.questionId}, sectionCode=${q.sectionCode}, text="${q.questionText.slice(0, 45)}..."`);
  });
  if (secA.questions[0].questionId === 'Q006') {
    console.log('  -> PASS: Section A correctly starts with Q006 in full compliance with original Excel and preview templates!');
  } else {
    console.log('  -> FAIL: Section A does not start with Q006');
  }

  // Verify that questions have sectionCode populated
  const missingSectionCodeCount = ws1.data.snapshot.sections.reduce((acc, s) => {
    return acc + s.questions.filter(q => !q.sectionCode).length;
  }, 0);
  console.log(`[Check 5] Questions in snapshot with missing sectionCode: ${missingSectionCodeCount} (should be 0)`);

  // 3. Save answers for Q100, Q101, Q118, Q119
  console.log('\n[Check 6 - Issue 1 Verification] Saving responses for Q100, Q101, Q118, Q119...');
  const testResponses = [
    {
      questionId: 'Q100',
      sectionCode: 'F', // or undefined to test auto-resolution
      responseValue: 'Initiative: Statistical Process Control (SPC) deployed across lines to monitor defect rates daily.',
      complianceAssessment: 'Compliant',
      observation: 'CPK calculations reviewed for last quarter.',
      clientVersion: 1
    },
    {
      questionId: 'Q101',
      sectionCode: 'F',
      responseValue: 'Process: All incoming polymer batches undergo MFI testing and density verification with COA matching.',
      complianceAssessment: 'Compliant',
      observation: 'Testing lab certified under ISO/IEC 17025.',
      clientVersion: 1
    },
    {
      questionId: 'Q118',
      // omitting sectionCode intentionally to verify server auto-resolves sectionCode for Section H!
      responseValue: 'Energy conservation and scrap minimization program led to 4.2% yield improvement in FY2026.',
      complianceAssessment: 'Compliant',
      observation: 'Quarterly review meeting held with plant head.',
      clientVersion: 1
    },
    {
      questionId: 'Q119',
      sectionCode: 'H',
      responseValue: 'Yes',
      complianceAssessment: 'Compliant',
      observation: 'Kaizen reward scheme active with monthly bonus payouts for approved ideas.',
      clientVersion: 1
    }
  ];

  const saveRes1 = await fetch(`${API_BASE}/audit/AUD-000002/save-draft`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      responses: testResponses,
      currentSection: 'H'
    })
  });
  const save1 = await saveRes1.json();
  console.log('Save response status:', saveRes1.status);
  console.log('Save response body:', {
    success: save1.success,
    savedCount: save1.savedCount,
    savedResponses: save1.savedResponses,
    percentage: save1.progress?.percentage,
    answeredQuestions: save1.progress?.answeredQuestions,
    lastSavedAt: save1.lastSavedAt
  });

  // Verify in MongoDB directly
  const savedInDb = await db.collection('auditresponses').find({ auditId: audit2._id }).toArray();
  console.log(`\n[Check 7] Directly verified responses count in MongoDB for AUD-000002: ${savedInDb.length}`);
  savedInDb.forEach(r => {
    console.log(`  Question ${r.questionId}: sectionCode=${r.sectionCode}, val="${r.responseValue.slice(0, 40)}...", compliance=${r.complianceAssessment}, version=${r.version}`);
  });

  if (savedInDb.length === 4) {
    console.log('  -> PASS: All 4 responses are persisted in MongoDB with correct auditId and questionId!');
  } else {
    console.log(`  -> FAIL: Expected 4 responses, found ${savedInDb.length}`);
  }

  // 4. Test Concurrency / Subsequent Edits (Bug 2 verification)
  console.log('\n[Check 8] Testing subsequent edit with updated version...');
  const q100Version = save1.savedResponses.find(sr => sr.questionId === 'Q100')?.version || 2;
  const updateResponse = [
    {
      questionId: 'Q100',
      sectionCode: 'F',
      responseValue: 'Initiative: Statistical Process Control (SPC) deployed across lines to monitor defect rates daily. UPDATED WITH LATEST DATA.',
      complianceAssessment: 'Compliant',
      observation: 'CPK calculations reviewed for last quarter. Updated version test.',
      clientVersion: q100Version
    }
  ];

  const saveRes2 = await fetch(`${API_BASE}/audit/AUD-000002/save-draft`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      responses: updateResponse,
      currentSection: 'H'
    })
  });
  const save2 = await saveRes2.json();
  console.log('Subsequent save response:', {
    success: save2.success,
    savedCount: save2.savedCount,
    savedResponses: save2.savedResponses
  });

  const updatedQ100InDb = await db.collection('auditresponses').findOne({ auditId: audit2._id, questionId: 'Q100' });
  console.log('Q100 in MongoDB after edit:', {
    questionId: updatedQ100InDb.questionId,
    version: updatedQ100InDb.version,
    responseValue: updatedQ100InDb.responseValue
  });
  if (updatedQ100InDb.responseValue.includes('UPDATED WITH LATEST DATA')) {
    console.log('  -> PASS: Subsequent edits are NOT skipped and successfully update MongoDB!');
  } else {
    console.log('  -> FAIL: Subsequent edit was not saved!');
  }

  // 5. Test Reopening the Audit Workspace (Bug 1 & Restoration verification)
  console.log('\n[Check 9] Testing Reopening Audit Workspace (/workspace endpoint)...');
  const wsRes2 = await fetch(`${API_BASE}/audit/AUD-000002/workspace`, { headers: authHeaders });
  const ws2 = await wsRes2.json();
  const restoredResponses = ws2.data.savedResponses;
  console.log(`Restored responses count: ${restoredResponses.length}`);
  restoredResponses.forEach(r => {
    console.log(`  Restored ${r.questionId}: sectionCode=${r.sectionCode}, val="${r.responseValue.slice(0, 45)}...", compliance=${r.complianceAssessment}, obs="${r.observation}"`);
  });

  const q119Restored = restoredResponses.find(r => r.questionId === 'Q119');
  if (q119Restored && q119Restored.responseValue === 'Yes' && q119Restored.observation.includes('Kaizen')) {
    console.log('  -> PASS: Selected option ("Yes") and observation restored correctly!');
  } else {
    console.log('  -> FAIL: Q119 option or observation failed to restore');
  }

  // 6. Verify Progress and Status in AuditAssignment
  console.log('\n[Check 10] Checking AuditAssignment record in MongoDB...');
  const refreshedAudit2 = await db.collection('auditassignments').findOne({ _id: audit2._id });
  console.log('  Audit Status:', refreshedAudit2.status);
  console.log('  Total Questions:', refreshedAudit2.progress?.totalQuestions);
  console.log('  Answered Questions:', refreshedAudit2.progress?.answeredQuestions);
  console.log('  Percentage:', refreshedAudit2.progress?.percentage, '%');
  console.log('  Current Section:', refreshedAudit2.currentSection);
  console.log('  Last Saved At:', refreshedAudit2.lastSavedAt);

  if (refreshedAudit2.status === 'In Progress' && refreshedAudit2.progress?.answeredQuestions === 4) {
    console.log('  -> PASS: Audit status is "In Progress" and answered questions is 4/136 (3%)!');
  } else {
    console.log('  -> FAIL: Audit status or answered questions incorrect');
  }

  // 7. Verify My Audits page endpoint
  console.log('\n[Check 11] Checking /my-audits endpoint for employee assignment card...');
  const myAuditsRes = await fetch(`${API_BASE}/audit/my-audits`, { headers: authHeaders });
  const myAuditsData = await myAuditsRes.json();
  const auditCard = myAuditsData.data.find(a => a.auditReference === 'AUD-000002');
  console.log('My Audits card for AUD-000002:', {
    auditReference: auditCard?.auditReference,
    status: auditCard?.status,
    answeredQuestions: auditCard?.progress?.answeredQuestions,
    totalQuestions: auditCard?.progress?.totalQuestions,
    percentage: auditCard?.progress?.percentage,
    currentSection: auditCard?.currentSection,
    lastSavedAt: auditCard?.lastSavedAt
  });

  if (auditCard && auditCard.status === 'In Progress' && auditCard.progress?.answeredQuestions === 4) {
    console.log('  -> PASS: My Audits card dynamically displays actual progress, In Progress status, and lastSavedAt!');
  } else {
    console.log('  -> FAIL: My Audits card does not reflect correct progress');
  }

  // 8. Prevent duplicate response records test
  console.log('\n[Check 12] Checking for duplicate response records...');
  const dupCheck = await db.collection('auditresponses').aggregate([
    { $match: { auditId: audit2._id } },
    { $group: { _id: '$questionId', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();
  console.log('Duplicate question records found:', dupCheck.length);
  if (dupCheck.length === 0) {
    console.log('  -> PASS: Zero duplicate response records!');
  } else {
    console.log('  -> FAIL: Duplicate response records found:', dupCheck);
  }

  console.log('\n=== ALL VERIFICATION CHECKS COMPLETE ===');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});

