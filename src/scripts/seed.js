const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
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

const seedDataPath = path.join(__dirname, '../../../reference_files/plant_audit_seed.json');

const determineAnswerType = (text, source) => {
  const lower = (text || '').toLowerCase();
  if (lower.startsWith('is ') || lower.startsWith('are ') || lower.startsWith('do ') || lower.startsWith('does ') || lower.includes('yes/no') || lower.includes('any past fire')) {
    return 'yes-no-na';
  }
  if (lower.includes('percentage') || lower.includes('%') || lower.includes('ratio')) {
    return 'decimal';
  }
  if (lower.includes('number of') || lower.includes('how many') || lower.includes('count of') || lower.includes('kva') || lower.includes('sq.ft') || lower.includes('tons')) {
    return 'number';
  }
  if (lower.includes('date of') || lower.includes('expiry date')) {
    return 'date';
  }
  return 'long-text';
};

const runSeed = async () => {
  try {
    console.log('[Seed] Connecting to MongoDB...');
    await connectDB();

    if (!fs.existsSync(seedDataPath)) {
      throw new Error(`Seed data file not found at ${seedDataPath}`);
    }

    const rawData = fs.readFileSync(seedDataPath, 'utf8');
    const seedJson = JSON.parse(rawData);

    console.log(`[Seed] Loaded seed JSON with ${seedJson.sections.length} sections and ${seedJson.questions.length} questions.`);

    // 1. Clear existing collections for a clean idempotent seed
    console.log('[Seed] Clearing existing collections...');
    await Promise.all([
      QuestionSection.deleteMany({}),
      Question.deleteMany({}),
      AuditTemplate.deleteMany({}),
      AuditTemplateVersion.deleteMany({}),
      AuditAssignment.deleteMany({}),
      AuditResponse.deleteMany({}),
      Company.deleteMany({}),
      Plant.deleteMany({}),
      User.deleteMany({}),
    ]);

    // 2. Insert Sections (A through K)
    console.log('[Seed] Ingesting Question Sections...');
    const sectionDocs = [];
    for (let i = 0; i < seedJson.sections.length; i++) {
      const s = seedJson.sections[i];
      const doc = await QuestionSection.create({
        code: s.key,
        name: s.name.replace(/^[A-K]\.\s*/, '').replace(/\s*\(Suggested Additions\)/, '').trim(),
        fullName: s.name,
        order: i + 1,
        source: s.source || 'original',
        isSuggested: s.source === 'suggested',
      });
      sectionDocs.push(doc);
    }
    const sectionMap = {};
    sectionDocs.forEach(s => { sectionMap[s.code] = s; });

    // 3. Ingest Questions (all 136 checkpoints)
    console.log('[Seed] Ingesting 136 Questions...');
    const questionDocs = [];
    for (let i = 0; i < seedJson.questions.length; i++) {
      const q = seedJson.questions[i];
      const answerType = determineAnswerType(q.question, q.source);
      const isSuggested = q.source === 'suggested';

      const questionDoc = await Question.create({
        questionId: q.id,
        row: q.row,
        sectionCode: q.section,
        sectionRef: sectionMap[q.section]?._id,
        questionText: q.question,
        alternateText: q.alternate || '',
        indent: q.indent || 0,
        source: q.source,
        isSuggested: isSuggested,
        isOriginal: !isSuggested,
        isSystemOriginal: true,
        answerType: answerType,
        isRequired: false, // customizable by template
        helpText: q.alternate ? `Alternate wording: ${q.alternate}` : '',
        sampleResponse: q.sample || '',
        order: i + 1,
        isArchived: false,
      });
      questionDocs.push(questionDoc);
    }
    console.log(`[Seed] Ingested ${questionDocs.length} questions successfully.`);

    // 4. Create Comprehensive Audit Template
    console.log('[Seed] Creating Comprehensive Audit Template...');
    const templateSections = [];
    const snapshotSections = [];

    for (const sec of sectionDocs) {
      const secQuestions = questionDocs.filter(q => q.sectionCode === sec.code);
      templateSections.push({
        sectionCode: sec.code,
        sectionName: sec.fullName,
        order: sec.order,
        questionIds: secQuestions.map(q => q._id),
      });

      snapshotSections.push({
        sectionCode: sec.code,
        sectionName: sec.name,
        fullName: sec.fullName,
        order: sec.order,
        questions: secQuestions.map(q => ({
          questionId: q.questionId,
          questionMongoId: q._id,
          questionText: q.questionText,
          alternateText: q.alternateText,
          indent: q.indent,
          source: q.source,
          isSuggested: q.isSuggested,
          answerType: q.answerType,
          options: q.options || [],
          unit: q.unit || '',
          isRequired: q.isRequired,
          helpText: q.helpText,
          order: q.order,
        })),
      });
    }

    const defaultTemplate = await AuditTemplate.create({
      name: 'ESM Comprehensive Plant Audit Master Template',
      code: 'TMPL-ESM-COMP-01',
      description: 'Standard 136-checkpoint comprehensive manufacturing & operational audit template covering Sections A through K.',
      category: 'General Industrial Plant Audit',
      industry: 'Manufacturing & Process Industry',
      version: 1,
      isPublished: true,
      isDefault: true,
      sections: templateSections,
      totalQuestions: questionDocs.length,
    });

    const templateSnapshot = await AuditTemplateVersion.create({
      templateId: defaultTemplate._id,
      versionNumber: 1,
      name: `${defaultTemplate.name} (v1.0 Frozen Snapshot)`,
      snapshotData: {
        sections: snapshotSections,
        totalQuestions: questionDocs.length,
      },
    });

    // 5. Create Demo Users
    console.log('[Seed] Creating demo users...');
    const adminPasswordHash = await User.hashPassword('Admin@123');
    const auditorPasswordHash = await User.hashPassword('Auditor@123');
    const reviewerPasswordHash = await User.hashPassword('Reviewer@123');

    const adminUser = await User.create({
      employeeId: 'ESM-ADM-001',
      fullName: 'Vikramaditya Sharma',
      email: 'admin@esm-audit.com',
      passwordHash: adminPasswordHash,
      phone: '+91 98200 11223',
      role: 'Super Admin',
      status: 'Active',
    });

    const auditorUser = await User.create({
      employeeId: 'ESM-EMP-001',
      fullName: 'Priya Narayanan',
      email: 'auditor@esm-audit.com',
      passwordHash: auditorPasswordHash,
      phone: '+91 98330 44556',
      role: 'Auditor/Employee',
      status: 'Active',
    });

    const reviewerUser = await User.create({
      employeeId: 'ESM-REV-001',
      fullName: 'Arun Kulkarni',
      email: 'reviewer@esm-audit.com',
      passwordHash: reviewerPasswordHash,
      phone: '+91 98440 77889',
      role: 'Reviewer',
      status: 'Active',
    });

    // 6. Create Demo Company & Plant
    console.log('[Seed] Creating demo company and plant...');
    const demoCompany = await Company.create({
      name: 'Neptune Plast Machinery Ltd.',
      code: 'NEPTUNE',
      industry: 'Plastics & Industrial Machinery',
      registeredAddress: 'Plot 45-48, GIDC Industrial Estate, Makarpura, Vadodara, Gujarat 390010',
      contactPerson: 'Rajesh Patel',
      contactEmail: 'rajesh.patel@neptuneplast.com',
      contactMobile: '+91 98250 12345',
      status: 'Active',
      notes: 'Leading manufacturer of drip irrigation lateral pipes, emitting pipes and industrial extruders.',
    });

    const demoPlant = await Plant.create({
      name: 'Makarpura Vadodara Manufacturing Unit',
      code: 'PLANT-VAD-01',
      company: demoCompany._id,
      address: 'Plot 45-48, GIDC Makarpura Industrial Area',
      city: 'Vadodara',
      state: 'Gujarat',
      country: 'India',
      contactPerson: 'Sunil Mehta (Plant Head)',
      contactNumber: '+91 98251 67890',
      operationalInfo: '16 operating extrusion lines, 862M meter annual capacity, 2000 KVA sanctioned load.',
      status: 'Active',
    });

    // Associate auditor to company & plant
    auditorUser.companyAssignments.push(demoCompany._id);
    auditorUser.plantAssignments.push(demoPlant._id);
    await auditorUser.save();

    // 7. Seed Sample Historical Audit with 88 Neptune Responses
    console.log('[Seed] Creating historical Neptune Audit (AUD-000001) with 88 responses...');
    const sectionProgressList = [];
    let totalAnsweredCount = 0;

    for (const sec of snapshotSections) {
      const qList = sec.questions;
      let answeredInSec = 0;
      for (const q of qList) {
        const originalQ = seedJson.questions.find(sq => sq.id === q.questionId);
        if (originalQ && originalQ.sample && originalQ.sample.trim().length > 0) {
          answeredInSec++;
          totalAnsweredCount++;
        }
      }
      sectionProgressList.push({
        sectionCode: sec.sectionCode,
        sectionName: sec.fullName,
        total: qList.length,
        answered: answeredInSec,
        requiredTotal: 0,
        requiredAnswered: 0,
        isComplete: answeredInSec === qList.length,
      });
    }

    const audit1 = await AuditAssignment.create({
      auditReference: 'AUD-000001',
      company: demoCompany._id,
      plant: demoPlant._id,
      template: defaultTemplate._id,
      templateVersion: 1,
      templateSnapshot: templateSnapshot._id,
      assignedEmployee: auditorUser._id,
      reviewer: reviewerUser._id,
      auditType: 'Comprehensive Plant Audit',
      startDate: new Date('2017-07-13'),
      dueDate: new Date('2017-07-20'),
      instructions: 'Historical factory visit audit conducted at Vadodara plant. 88 checkpoints recorded.',
      status: 'In Progress',
      currentSection: 'A',
      statusHistory: [
        {
          status: 'Not Started',
          changedBy: adminUser._id,
          changedByName: adminUser.fullName,
          changedAt: new Date('2017-07-13T09:00:00Z'),
          remarks: 'Audit assigned to Priya Narayanan',
        },
        {
          status: 'In Progress',
          changedBy: auditorUser._id,
          changedByName: auditorUser.fullName,
          changedAt: new Date('2017-07-13T10:15:00Z'),
          remarks: 'Plant visit commenced',
        }
      ],
      progress: {
        totalQuestions: questionDocs.length,
        answeredQuestions: totalAnsweredCount,
        requiredTotal: 0,
        requiredAnswered: 0,
        percentage: Math.round((totalAnsweredCount / questionDocs.length) * 100),
        sectionProgress: sectionProgressList,
      },
      lastSavedAt: new Date('2017-07-13T17:30:00Z'),
    });

    // Ingest the 88 historical responses for AUD-000001
    const responseDocs = [];
    for (const q of questionDocs) {
      if (q.sampleResponse && q.sampleResponse.trim().length > 0) {
        responseDocs.push({
          auditId: audit1._id,
          companyId: demoCompany._id,
          plantId: demoPlant._id,
          assignedEmployeeId: auditorUser._id,
          questionId: q.questionId,
          questionRef: q._id,
          sectionCode: q.sectionCode,
          templateVersion: 1,
          responseValue: q.sampleResponse,
          complianceAssessment: 'Compliant',
          observation: 'Historical notes captured during site inspection on 13th July 2017.',
          isCompleted: true,
          version: 1,
          lastModifiedBy: auditorUser._id,
        });
      }
    }
    await AuditResponse.insertMany(responseDocs);
    console.log(`[Seed] Ingested ${responseDocs.length} responses for AUD-000001.`);

    // 8. Create a fresh unstarted audit (AUD-000002) for immediate testing
    const emptySectionProgress = snapshotSections.map(sec => ({
      sectionCode: sec.sectionCode,
      sectionName: sec.fullName,
      total: sec.questions.length,
      answered: 0,
      requiredTotal: 0,
      requiredAnswered: 0,
      isComplete: false,
    }));

    await AuditAssignment.create({
      auditReference: 'AUD-000002',
      company: demoCompany._id,
      plant: demoPlant._id,
      template: defaultTemplate._id,
      templateVersion: 1,
      templateSnapshot: templateSnapshot._id,
      assignedEmployee: auditorUser._id,
      reviewer: reviewerUser._id,
      auditType: 'Comprehensive Plant Audit',
      startDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days later
      instructions: 'Active 2026 Comprehensive Plant Audit for Neptune Plast Vadodara facility.',
      status: 'Not Started',
      currentSection: 'A',
      statusHistory: [
        {
          status: 'Not Started',
          changedBy: adminUser._id,
          changedByName: adminUser.fullName,
          changedAt: new Date(),
          remarks: 'New audit created and assigned',
        }
      ],
      progress: {
        totalQuestions: questionDocs.length,
        answeredQuestions: 0,
        requiredTotal: 0,
        requiredAnswered: 0,
        percentage: 0,
        sectionProgress: emptySectionProgress,
      },
    });

    console.log('[Seed] Database successfully seeded with:');
    console.log(`- ${sectionDocs.length} Sections`);
    console.log(`- ${questionDocs.length} Questions (115 original, 1 Neptune, 20 suggested)`);
    console.log(`- 1 Master Template & Frozen Snapshot Version`);
    console.log(`- 3 Demo Users: admin@esm-audit.com, auditor@esm-audit.com, reviewer@esm-audit.com (password: Admin@123 / Auditor@123 / Reviewer@123)`);
    console.log(`- 1 Company (${demoCompany.name}) & 1 Plant (${demoPlant.name})`);
    console.log(`- AUD-000001 (Historical Neptune audit with ${responseDocs.length} sample responses)`);
    console.log(`- AUD-000002 (Fresh active audit ready for employee execution)`);

    process.exit(0);
  } catch (error) {
    console.error('[Seed] Error during seeding:', error);
    process.exit(1);
  }
};

runSeed();

