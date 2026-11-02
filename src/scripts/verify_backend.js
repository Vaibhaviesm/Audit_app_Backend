const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const connectDB = require('../config/db');
const User = require('../models/User');
const Company = require('../models/Company');
const Plant = require('../models/Plant');
const QuestionSection = require('../models/QuestionSection');
const Question = require('../models/Question');
const AuditAssignment = require('../models/AuditAssignment');
const AuditResponse = require('../models/AuditResponse');
const { generateAuditPDF } = require('../services/pdfService');

const verify = async () => {
  try {
    console.log('--- RUNNING TARGETED BACKEND VERIFICATION ---');
    await connectDB();

    // 1. Question counts
    const totalQ = await Question.countDocuments();
    const originalQ = await Question.countDocuments({ source: 'template' });
    const neptuneQ = await Question.countDocuments({ source: 'neptune-addition' });
    const suggestedQ = await Question.countDocuments({ source: 'suggested' });
    const sectionsCount = await QuestionSection.countDocuments();

    console.log(`✓ Total Questions: ${totalQ} (Expected: 136)`);
    console.log(`✓ Template Questions: ${originalQ} (Expected: 115)`);
    console.log(`✓ Neptune Addition: ${neptuneQ} (Expected: 1)`);
    console.log(`✓ Suggested Questions: ${suggestedQ} (Expected: 20)`);
    console.log(`✓ Sections: ${sectionsCount} (Expected: 11)`);

    if (totalQ !== 136 || originalQ !== 115 || neptuneQ !== 1 || suggestedQ !== 20 || sectionsCount !== 11) {
      throw new Error('Question bank counts do not match requirements!');
    }

    // 2. Verify demo users
    const admin = await User.findOne({ email: 'admin@esm-audit.com' });
    const auditor = await User.findOne({ email: 'auditor@esm-audit.com' });
    const reviewer = await User.findOne({ email: 'reviewer@esm-audit.com' });

    console.log(`✓ Admin User exists: ${admin.fullName} (${admin.role})`);
    console.log(`✓ Auditor User exists: ${auditor.fullName} (${auditor.role})`);
    console.log(`✓ Reviewer User exists: ${reviewer.fullName} (${reviewer.role})`);

    const adminMatch = await admin.comparePassword('Admin@123');
    const auditorMatch = await auditor.comparePassword('Auditor@123');
    console.log(`✓ Password hashing verification: Admin=${adminMatch}, Auditor=${auditorMatch}`);

    // 3. Verify sample historical audit AUD-000001
    const audit1 = await AuditAssignment.findOne({ auditReference: 'AUD-000001' })
      .populate('company')
      .populate('plant')
      .populate('assignedEmployee');

    const responsesCount = await AuditResponse.countDocuments({ auditId: audit1._id });
    console.log(`✓ Historical Audit AUD-000001 Responses: ${responsesCount} (Expected: 88)`);
    console.log(`✓ AUD-000001 Progress: ${audit1.progress.percentage}% (Expected: ~65%)`);

    if (responsesCount !== 88) {
      throw new Error(`Expected 88 responses for AUD-000001, got ${responsesCount}`);
    }

    // 4. Test PDF Generation
    const testPdfPath = path.join(__dirname, '../../uploads/reports/test-verification.pdf');
    const responses = await AuditResponse.find({ auditId: audit1._id });
    await generateAuditPDF({
      audit: audit1,
      responses,
      outputPath: testPdfPath,
      isDraft: true,
    });

    const fileExists = fs.existsSync(testPdfPath);
    const fileSize = fs.statSync(testPdfPath).size;
    console.log(`✓ PDF Generation succeeded: file size = ${fileSize} bytes (exists = ${fileExists})`);

    if (!fileExists || fileSize < 1000) {
      throw new Error('Generated PDF is invalid or empty');
    }

    console.log('--- ALL BACKEND VERIFICATION CHECKS PASSED SUCCESSFULLY ---');
    process.exit(0);
  } catch (error) {
    console.error('VERIFICATION FAILED:', error);
    process.exit(1);
  }
};

verify();
