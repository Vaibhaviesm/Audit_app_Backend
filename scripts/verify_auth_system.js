const mongoose = require('mongoose');
const http = require('http');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Point environment to isolated test database
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/esm_plant_audit_test';
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_key_2026_xyz';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_key_2026_xyz';

const app = require('../src/app');
const User = require('../src/models/User');
const Company = require('../src/models/Company');
const Plant = require('../src/models/Plant');
const AuditTemplate = require('../src/models/AuditTemplate');
const AuditTemplateVersion = require('../src/models/AuditTemplateVersion');
const AuditAssignment = require('../src/models/AuditAssignment');
const AuditReport = require('../src/models/AuditReport');
const SecurityLog = require('../src/models/SecurityLog');

const TEST_PORT = 5098;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// Helper to parse cookies from Set-Cookie header array
function extractCookies(response) {
  const setCookieHeaders = response.headers.getSetCookie 
    ? response.headers.getSetCookie() 
    : [response.headers.get('set-cookie')].filter(Boolean);

  const cookies = {};
  setCookieHeaders.forEach(header => {
    const parts = header.split(';')[0].split('=');
    if (parts.length >= 2) {
      cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });
  return cookies;
}

function formatCookieHeader(cookies) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function runVerification() {
  console.log('===============================================================');
  console.log('ESM PLANT AUDIT — AUTHENTICATION & AUTHORIZATION VERIFICATION');
  console.log('Isolated Test Database: mongodb://127.0.0.1:27017/esm_plant_audit_test');
  console.log('===============================================================\n');

  let server;
  const results = [];

  try {
    // 1. Connect to isolated MongoDB test database
    await mongoose.connect(process.env.MONGODB_URI);
    await mongoose.connection.dropDatabase();
    console.log('✓ Connected to test database and cleared old data.');

    // 2. Start test server
    server = http.createServer(app);
    await new Promise(resolve => server.listen(TEST_PORT, resolve));
    console.log(`✓ Test API server listening on ${BASE_URL}\n`);

    // 3. Seed test users
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Password123!', salt);

    const superAdmin = await User.create({
      fullName: 'Super Admin User',
      email: 'superadmin@esm.com',
      passwordHash: hashedPassword,
      role: 'Super Admin',
      status: 'Active',
      employeeId: 'EMP-001',
      tokenVersion: 0,
    });

    const admin = await User.create({
      fullName: 'Regular Admin User',
      email: 'admin@esm.com',
      passwordHash: hashedPassword,
      role: 'Admin',
      status: 'Active',
      employeeId: 'EMP-002',
      tokenVersion: 0,
    });

    const reviewer = await User.create({
      fullName: 'Lead Reviewer',
      email: 'reviewer@esm.com',
      passwordHash: hashedPassword,
      role: 'Reviewer',
      status: 'Active',
      employeeId: 'EMP-003',
      tokenVersion: 0,
    });

    const employeeA = await User.create({
      fullName: 'Auditor Alice',
      email: 'alice@esm.com',
      passwordHash: hashedPassword,
      role: 'Auditor/Employee',
      status: 'Active',
      employeeId: 'EMP-004',
      tokenVersion: 0,
    });

    const employeeB = await User.create({
      fullName: 'Auditor Bob',
      email: 'bob@esm.com',
      passwordHash: hashedPassword,
      role: 'Auditor/Employee',
      status: 'Active',
      employeeId: 'EMP-005',
      tokenVersion: 0,
    });

    // Seed companies and plants
    const company1 = await Company.create({
      name: 'Alpha Industries',
      code: 'ALPHA',
      industry: 'Chemicals',
      status: 'Active',
    });

    const plant1A = await Plant.create({
      name: 'Alpha Plant 1',
      code: 'AP-1',
      company: company1._id,
      city: 'Mumbai',
      state: 'Maharashtra',
      status: 'Active',
    });

    const company2 = await Company.create({
      name: 'Beta Manufacturing',
      code: 'BETA',
      industry: 'Automotive',
      status: 'Active',
    });

    const plant2A = await Plant.create({
      name: 'Beta Plant 1',
      code: 'BP-1',
      company: company2._id,
      city: 'Pune',
      state: 'Maharashtra',
      status: 'Active',
    });

    // Seed template
    const template = await AuditTemplate.create({
      name: 'Standard Plant Safety Audit',
      code: 'SPSA-V1',
      version: 1,
      status: 'Active',
      sections: [{ sectionCode: 'SEC-1', sectionName: 'General Safety', order: 1, questionIds: [] }],
    });

    const templateVersion = await AuditTemplateVersion.create({
      templateId: template._id,
      versionNumber: 1,
      name: 'Standard Plant Safety Audit v1',
      snapshotData: {
        sections: [{ sectionCode: 'SEC-1', sectionName: 'General Safety', fullName: 'General Safety', order: 1, questions: [] }],
        totalQuestions: 136,
      },
    });

    // Seed Audit 1 (assigned to Alice / Employee A, reviewer is Reviewer)
    const audit1 = await AuditAssignment.create({
      auditReference: 'AUD-000001',
      company: company1._id,
      plant: plant1A._id,
      template: template._id,
      templateSnapshot: templateVersion._id,
      assignedEmployee: employeeA._id,
      reviewer: reviewer._id,
      auditType: 'Comprehensive Plant Audit',
      status: 'In Progress',
      dueDate: new Date(Date.now() + 7 * 86400000),
      progress: { totalQuestions: 136, answeredQuestions: 10, percentage: 7 },
    });

    // Seed Audit 2 (assigned to Bob / Employee B)
    const audit2 = await AuditAssignment.create({
      auditReference: 'AUD-000002',
      company: company2._id,
      plant: plant2A._id,
      template: template._id,
      templateSnapshot: templateVersion._id,
      assignedEmployee: employeeB._id,
      auditType: 'Comprehensive Plant Audit',
      status: 'Not Started',
      dueDate: new Date(Date.now() + 14 * 86400000),
      progress: { totalQuestions: 136, answeredQuestions: 0, percentage: 0 },
    });

    // Seed a report for Audit 1
    const testPdfPath = path.join(__dirname, '../uploads/reports/test-report.pdf');
    fs.mkdirSync(path.dirname(testPdfPath), { recursive: true });
    fs.writeFileSync(testPdfPath, '%PDF-1.4 test dummy pdf content');

    const report1 = await AuditReport.create({
      auditId: audit1._id,
      reportReference: 'REP-AUD-000001-V1',
      version: 1,
      isDraft: false,
      filePath: '/uploads/reports/test-report.pdf',
      fileSize: 32,
      generatedBy: superAdmin._id,
    });

    console.log('✓ Seeded test data: 5 users, 2 companies, 2 plants, 2 audits, 1 report.\n');

    // -------------------------------------------------------------
    // TEST 1: Valid login succeeds (sets HTTP-only cookies, returns user profile)
    // -------------------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'superadmin@esm.com', password: 'Password123!' }),
      });
      const data = await res.json();
      const cookies = extractCookies(res);

      const pass = res.status === 200 &&
                   data.success === true &&
                   data.user?.role === 'Super Admin' &&
                   Boolean(cookies.accessToken) &&
                   Boolean(cookies.refreshToken);

      results.push({
        num: 1,
        title: 'Valid login succeeds (sets HTTP-only cookies, returns profile)',
        pass,
        details: pass ? `Status 200, role: ${data.user.role}, accessToken and refreshToken present in cookies` : `Status ${res.status}, data: ${JSON.stringify(data)}`,
      });
    } catch (err) {
      results.push({ num: 1, title: 'Valid login succeeds', pass: false, details: err.message });
    }

    // -------------------------------------------------------------
    // TEST 2: Invalid credentials fail (returns 401)
    // -------------------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'superadmin@esm.com', password: 'WrongPassword!' }),
      });
      const data = await res.json();
      const pass = res.status === 401 && data.success === false;

      results.push({
        num: 2,
        title: 'Invalid credentials fail (returns 401)',
        pass,
        details: pass ? `Status 401 as expected: "${data.message}"` : `Status ${res.status}`,
      });
    } catch (err) {
      results.push({ num: 2, title: 'Invalid credentials fail', pass: false, details: err.message });
    }

    // -------------------------------------------------------------
    // TEST 3: Inactive users cannot authenticate or continue existing sessions (returns 403)
    // -------------------------------------------------------------
    try {
      // 3a: Deactivated user cannot login
      await User.findByIdAndUpdate(employeeB._id, { status: 'Inactive' });
      const resLogin = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bob@esm.com', password: 'Password123!' }),
      });
      const dataLogin = await resLogin.json();

      // 3b: Active user gets session, then gets deactivated, ongoing session is rejected with 403
      const loginAlice = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@esm.com', password: 'Password123!' }),
      });
      const aliceCookies = extractCookies(loginAlice);

      // Deactivate Alice in DB
      await User.findByIdAndUpdate(employeeA._id, { status: 'Inactive' });
      const resSession = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { Cookie: formatCookieHeader(aliceCookies) },
      });
      const dataSession = await resSession.json();

      // Re-activate Alice and Bob for remaining tests
      await User.findByIdAndUpdate(employeeA._id, { status: 'Active' });
      await User.findByIdAndUpdate(employeeB._id, { status: 'Active' });

      const pass = resLogin.status === 403 && resSession.status === 403;
      results.push({
        num: 3,
        title: 'Inactive users cannot authenticate or continue sessions (returns 403)',
        pass,
        details: pass ? `Login rejected: 403 ("${dataLogin.message}"), Active session blocked: 403 ("${dataSession.message}")` : `resLogin=${resLogin.status}, resSession=${resSession.status}`,
      });
    } catch (err) {
      results.push({ num: 3, title: 'Inactive users cannot authenticate', pass: false, details: err.message });
    }

    // -------------------------------------------------------------
    // TEST 4: Employee cannot open another employee's audit (returns 403)
    // -------------------------------------------------------------
    try {
      // Bob logs in
      const resBob = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bob@esm.com', password: 'Password123!' }),
      });
      const bobCookies = extractCookies(resBob);

      // Bob tries to open Alice's audit (AUD-000001)
      const resAudit = await fetch(`${BASE_URL}/api/audit/${audit1._id}/workspace`, {
        headers: { Cookie: formatCookieHeader(bobCookies) },
      });
      const dataAudit = await resAudit.json();

      const pass = resAudit.status === 403 && dataAudit.success === false;
      results.push({
        num: 4,
        title: "Employee cannot open another employee's audit (returns 403)",
        pass,
        details: pass ? `Status 403: "${dataAudit.message}"` : `Status ${resAudit.status}, data: ${JSON.stringify(dataAudit)}`,
      });
    } catch (err) {
      results.push({ num: 4, title: 'Employee cannot open unassigned audit', pass: false, details: err.message });
    }

    // -------------------------------------------------------------
    // TEST 5: Employee cannot access admin APIs (/api/employees, /api/companies) (returns 403)
    // -------------------------------------------------------------
    try {
      const resAlice = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@esm.com', password: 'Password123!' }),
      });
      const aliceCookies = extractCookies(resAlice);

      const resEmp = await fetch(`${BASE_URL}/api/employees`, {
        headers: { Cookie: formatCookieHeader(aliceCookies) },
      });
      const resComp = await fetch(`${BASE_URL}/api/companies`, {
        headers: { Cookie: formatCookieHeader(aliceCookies) },
      });

      const pass = resEmp.status === 403 && resComp.status === 403;
      results.push({
        num: 5,
        title: 'Employee cannot access admin APIs (returns 403)',
        pass,
        details: pass ? `Employees API: 403, Companies API: 403` : `resEmp=${resEmp.status}, resComp=${resComp.status}`,
      });
    } catch (err) {
      results.push({ num: 5, title: 'Employee cannot access admin APIs', pass: false, details: err.message });
    }

    // -------------------------------------------------------------
    // TEST 6: Admin cannot create Super Admin accounts (returns 403)
    // -------------------------------------------------------------
    try {
      const resAdmin = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@esm.com', password: 'Password123!' }),
      });
      const adminCookies = extractCookies(resAdmin);

      const resCreate = await fetch(`${BASE_URL}/api/employees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: formatCookieHeader(adminCookies),
        },
        body: JSON.stringify({
          fullName: 'Unauthorized Super Admin',
          email: 'unauth.super@esm.com',
          password: 'Password123!',
          role: 'Super Admin',
          employeeId: 'EMP-999',
        }),
      });
      const dataCreate = await resCreate.json();

      const pass = resCreate.status === 403 && dataCreate.success === false;
      results.push({
        num: 6,
        title: 'Admin cannot create Super Admin accounts (returns 403)',
        pass,
        details: pass ? `Status 403: "${dataCreate.message}"` : `Status ${resCreate.status}, data: ${JSON.stringify(dataCreate)}`,
      });
    } catch (err) {
      results.push({ num: 6, title: 'Admin cannot create Super Admin accounts', pass: false, details: err.message });
    }

    // -------------------------------------------------------------
    // TEST 7: Reviewer cannot modify audit questions (returns 403)
    // -------------------------------------------------------------
    try {
      const resRev = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'reviewer@esm.com', password: 'Password123!' }),
      });
      const revCookies = extractCookies(resRev);

      const resMod = await fetch(`${BASE_URL}/api/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: formatCookieHeader(revCookies),
        },
        body: JSON.stringify({
          questionText: 'Unauthorized modification checkpoint',
          sectionCode: 'SEC-1',
          checkpointId: 'CHK-999',
        }),
      });
      const dataMod = await resMod.json();

      const pass = resMod.status === 403 && dataMod.success === false;
      results.push({
        num: 7,
        title: 'Reviewer cannot modify audit questions (returns 403)',
        pass,
        details: pass ? `Status 403: "${dataMod.message}"` : `Status ${resMod.status}, data: ${JSON.stringify(dataMod)}`,
      });
    } catch (err) {
      results.push({ num: 7, title: 'Reviewer cannot modify audit questions', pass: false, details: err.message });
    }

    // -------------------------------------------------------------
    // TEST 8: Refreshing browser preserves login (session restoration via /api/auth/me)
    // -------------------------------------------------------------
    try {
      const resAlice = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@esm.com', password: 'Password123!' }),
      });
      const aliceCookies = extractCookies(resAlice);

      // Simulate refresh by loading /api/auth/me with cookies
      const resMe = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { Cookie: formatCookieHeader(aliceCookies) },
      });
      const dataMe = await resMe.json();

      const pass = resMe.status === 200 &&
                   dataMe.success === true &&
                   dataMe.user?.email === 'alice@esm.com' &&
                   dataMe.user?.role === 'Auditor/Employee';

      results.push({
        num: 8,
        title: 'Refreshing browser preserves login (session restoration via /api/auth/me)',
        pass,
        details: pass ? `Status 200, user: ${dataMe.user?.fullName} (${dataMe.user?.role})` : `Status ${resMe.status}, data: ${JSON.stringify(dataMe)}`,
      });
    } catch (err) {
      results.push({ num: 8, title: 'Session restoration via /api/auth/me', pass: false, details: err.message });
    }

    // -------------------------------------------------------------
    // TEST 9: Logout invalidates session (clears cookies, protected routes return 401)
    // -------------------------------------------------------------
    try {
      const resLogin = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bob@esm.com', password: 'Password123!' }),
      });
      const bobCookies = extractCookies(resLogin);

      // Call logout
      const resLogout = await fetch(`${BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { Cookie: formatCookieHeader(bobCookies) },
      });
      const dataLogout = await resLogout.json();
      const logoutCookies = extractCookies(resLogout);

      // Call protected route with the cleared cookies or empty
      const resAfter = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { Cookie: formatCookieHeader(logoutCookies) },
      });

      const pass = resLogout.status === 200 &&
                   dataLogout.success === true &&
                   resAfter.status === 401;

      results.push({
        num: 9,
        title: 'Logout invalidates session (clears cookies, protected routes return 401)',
        pass,
        details: pass ? `Logout status 200, subsequent protected call status: ${resAfter.status}` : `Logout ${resLogout.status}, After ${resAfter.status}`,
      });
    } catch (err) {
      results.push({ num: 9, title: 'Logout invalidates session', pass: false, details: err.message });
    }

    // -------------------------------------------------------------
    // TEST 10: Password reset invalidates previous sessions (bumps tokenVersion)
    // -------------------------------------------------------------
    try {
      // 1. Admin logs in, gets session
      const resAdmin = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@esm.com', password: 'Password123!' }),
      });
      const oldAdminCookies = extractCookies(resAdmin);

      // 2. Request forgot password
      const resForgot = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@esm.com' }),
      });
      const dataForgot = await resForgot.json();

      // Read reset token directly from DB or payload
      const rawToken = dataForgot.resetToken || dataForgot.data?.resetToken;

      let resetPass = false;
      if (rawToken) {
        // 3. Reset password
        const resReset = await fetch(`${BASE_URL}/api/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: rawToken,
            newPassword: 'NewAdminPassword456!',
          }),
        });
        const dataReset = await resReset.json();

        // 4. Old session token calls /api/auth/me -> MUST return 401 because tokenVersion was incremented
        const resOldSession = await fetch(`${BASE_URL}/api/auth/me`, {
          headers: { Cookie: formatCookieHeader(oldAdminCookies) },
        });

        // 5. Login with new password works
        const resNewLogin = await fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'admin@esm.com', password: 'NewAdminPassword456!' }),
        });

        resetPass = resReset.status === 200 &&
                    resOldSession.status === 401 &&
                    resNewLogin.status === 200;
      }

      results.push({
        num: 10,
        title: 'Password reset invalidates previous sessions (bumps tokenVersion)',
        pass: resetPass,
        details: resetPass ? 'Old session token returned 401 (session invalidated), new password login returned 200' : 'Password reset token invalidation failed',
      });
    } catch (err) {
      results.push({ num: 10, title: 'Password reset session invalidation', pass: false, details: err.message });
    }

    // -------------------------------------------------------------
    // TEST 11: Authorization works for uploads and PDF downloads (/api/reports/:id/download)
    // -------------------------------------------------------------
    try {
      // 1. Unauthenticated static /uploads access
      const resUnauthUpload = await fetch(`${BASE_URL}/uploads/reports/test-report.pdf`);

      // 2. Bob (Auditor/Employee not assigned to Audit 1) tries to download Audit 1's report
      const resBob = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bob@esm.com', password: 'Password123!' }),
      });
      const bobCookies = extractCookies(resBob);

      const resBobDownload = await fetch(`${BASE_URL}/api/reports/${report1._id}/download`, {
        headers: { Cookie: formatCookieHeader(bobCookies) },
      });
      const dataBobDownload = await resBobDownload.json();

      // 3. Alice (assigned auditor) downloads report
      const resAlice = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@esm.com', password: 'Password123!' }),
      });
      const aliceCookies = extractCookies(resAlice);

      const resAliceDownload = await fetch(`${BASE_URL}/api/reports/${report1._id}/download`, {
        headers: { Cookie: formatCookieHeader(aliceCookies) },
      });

      const pass = resUnauthUpload.status === 401 &&
                   resBobDownload.status === 403 &&
                   resAliceDownload.status === 200;

      results.push({
        num: 11,
        title: 'Authorization works for uploads and PDF downloads',
        pass,
        details: pass ? `Unauthenticated upload: 401, Unassigned employee download: 403 ("${dataBobDownload.message}"), Assigned employee download: 200` : `Upload: ${resUnauthUpload.status}, Bob: ${resBobDownload.status}, Alice: ${resAliceDownload.status}`,
      });
    } catch (err) {
      results.push({ num: 11, title: 'Authorization for uploads and reports', pass: false, details: err.message });
    }

    // -------------------------------------------------------------
    // TEST 12: Unauthorized company/plant IDs cannot be assigned through manipulated API requests
    // -------------------------------------------------------------
    try {
      const resSuper = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'superadmin@esm.com', password: 'Password123!' }),
      });
      const superCookies = extractCookies(resSuper);

      // Intentionally mismatched: Company 1 + Plant 2A (which belongs to Company 2)
      const resManipulated = await fetch(`${BASE_URL}/api/assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: formatCookieHeader(superCookies),
        },
        body: JSON.stringify({
          company: company1._id,
          plant: plant2A._id, // MISMATCH
          templateId: template._id,
          assignedEmployee: employeeA._id,
          auditType: 'Comprehensive Plant Audit',
          dueDate: new Date(Date.now() + 86400000 * 5),
        }),
      });
      const dataManipulated = await resManipulated.json();

      const pass = resManipulated.status === 400 &&
                   dataManipulated.success === false &&
                   dataManipulated.message.includes('does not belong to the selected company');

      results.push({
        num: 12,
        title: 'Unauthorized cross-company/plant assignments blocked (returns 400 validation error)',
        pass,
        details: pass ? `Status 400: "${dataManipulated.message}"` : `Status ${resManipulated.status}, data: ${JSON.stringify(dataManipulated)}`,
      });
    } catch (err) {
      results.push({ num: 12, title: 'Cross-company plant validation', pass: false, details: err.message });
    }

  } catch (err) {
    console.error('Fatal test error:', err);
  } finally {
    // Teardown
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }

    // Clean up test dummy pdf if created
    const testPdfPath = path.join(__dirname, '../uploads/reports/test-report.pdf');
    if (fs.existsSync(testPdfPath)) {
      try { fs.unlinkSync(testPdfPath); } catch (e) {}
    }
  }

  // Print Summary Table
  console.log('\n===============================================================');
  console.log('                 VERIFICATION TEST RESULTS                     ');
  console.log('===============================================================');
  let passCount = 0;
  for (const r of results) {
    const symbol = r.pass ? '✓ PASS' : '✗ FAIL';
    console.log(`[${symbol}] Test ${r.num}: ${r.title}`);
    console.log(`       Details: ${r.details}\n`);
    if (r.pass) passCount++;
  }

  console.log('---------------------------------------------------------------');
  console.log(`TOTAL: ${passCount} / ${results.length} PASSED`);
  console.log('===============================================================\n');

  if (passCount !== results.length) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error(err);
  process.exit(1);
});
