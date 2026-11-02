const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { getDisplayQuestionId } = require('../utils/questionDisplay');

const generateAuditPDF = async ({
  audit,
  responses,
  correctiveActions = [],
  outputPath,
  isDraft = true,
}) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true,
      });

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      // Colors
      const primaryTeal = '#0c746d';
      const darkNavy = '#112e3f';
      const textInk = '#182b3c';
      const mutedGrey = '#708294';
      const lightBorder = '#e2eaf0';
      const bgLight = '#f4f7f9';
      const alertRed = '#b83d46';
      const alertAmber = '#e89b3c';
      const successGreen = '#16a34a';

      // Header Banner
      doc.rect(40, 40, 515, 60).fill(darkNavy);
      
      // Brand Mark Box
      doc.rect(52, 50, 40, 40).fill(primaryTeal);
      doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text('ESM', 56, 62);

      // Header Title
      doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text('PLANT AUDIT REPORT', 105, 52);
      doc.fontSize(10).font('Helvetica').fillColor('#94a3b8').text(`REF: ${audit.auditReference} | ${audit.auditType.toUpperCase()}`, 105, 74);

      if (isDraft) {
        doc.rect(440, 55, 95, 26).fillAndStroke('#fef3c7', '#d97706');
        doc.fillColor('#92400e').fontSize(10).font('Helvetica-Bold').text('DRAFT REPORT', 450, 63);
      } else {
        doc.rect(440, 55, 95, 26).fillAndStroke('#dcfce7', '#16a34a');
        doc.fillColor('#14532d').fontSize(10).font('Helvetica-Bold').text('FINAL APPROVED', 445, 63);
      }

      let yPos = 120;

      // Overview Box (Metadata Grid)
      doc.rect(40, yPos, 515, 100).fillAndStroke(bgLight, lightBorder);

      doc.fillColor(darkNavy).font('Helvetica-Bold').fontSize(9).text('COMPANY DETAILS', 52, yPos + 10);
      doc.fillColor(textInk).font('Helvetica').fontSize(9)
        .text(`Name: ${audit.company?.name || 'N/A'}`, 52, yPos + 26)
        .text(`Code: ${audit.company?.code || 'N/A'}`, 52, yPos + 40)
        .text(`Industry: ${audit.company?.industry || 'N/A'}`, 52, yPos + 54)
        .text(`Address: ${audit.company?.registeredAddress || 'N/A'}`, 52, yPos + 68, { width: 170, height: 26 });

      doc.fillColor(darkNavy).font('Helvetica-Bold').fontSize(9).text('PLANT / FACILITY', 230, yPos + 10);
      doc.fillColor(textInk).font('Helvetica').fontSize(9)
        .text(`Name: ${audit.plant?.name || 'N/A'}`, 230, yPos + 26)
        .text(`Location: ${audit.plant?.city || ''}, ${audit.plant?.state || ''}`, 230, yPos + 40)
        .text(`Plant Code: ${audit.plant?.code || 'N/A'}`, 230, yPos + 54)
        .text(`Contact: ${audit.plant?.contactPerson || 'N/A'}`, 230, yPos + 68, { width: 150 });

      doc.fillColor(darkNavy).font('Helvetica-Bold').fontSize(9).text('AUDIT METRICS', 400, yPos + 10);
      doc.fillColor(textInk).font('Helvetica').fontSize(9)
        .text(`Auditor: ${audit.assignedEmployee?.fullName || 'N/A'}`, 400, yPos + 26)
        .text(`Status: ${audit.status}`, 400, yPos + 40)
        .text(`Completion: ${audit.progress?.percentage || 0}%`, 400, yPos + 54)
        .text(`Audit Date: ${new Date(audit.startDate).toLocaleDateString()}`, 400, yPos + 68);

      yPos += 115;

      // Executive Summary & Section Scorecard
      doc.fillColor(darkNavy).font('Helvetica-Bold').fontSize(12).text('1. Executive Summary & Section Summary', 40, yPos);
      yPos += 20;

      const sectionProgress = audit.progress?.sectionProgress || [];
      
      // Table Header
      doc.rect(40, yPos, 515, 20).fill(primaryTeal);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5)
        .text('SEC', 48, yPos + 5)
        .text('AUDIT SECTION', 80, yPos + 5)
        .text('TOTAL', 330, yPos + 5)
        .text('RECORDED', 380, yPos + 5)
        .text('STATUS', 460, yPos + 5);

      yPos += 20;

      sectionProgress.forEach((sp, idx) => {
        const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        doc.rect(40, yPos, 515, 18).fillAndStroke(rowBg, lightBorder);
        
        doc.fillColor(darkNavy).font('Helvetica-Bold').fontSize(8)
          .text(sp.sectionCode, 48, yPos + 5);

        doc.fillColor(textInk).font('Helvetica').fontSize(8)
          .text(sp.sectionName, 80, yPos + 5, { width: 240, height: 14, ellipsis: true })
          .text(`${sp.total}`, 340, yPos + 5)
          .text(`${sp.answered}`, 395, yPos + 5);

        const statusText = sp.isComplete ? 'Complete' : (sp.answered > 0 ? 'In Progress' : 'Pending');
        const statusColor = sp.isComplete ? successGreen : (sp.answered > 0 ? alertAmber : mutedGrey);
        doc.fillColor(statusColor).font('Helvetica-Bold').fontSize(8)
          .text(statusText, 460, yPos + 5);

        yPos += 18;
      });

      yPos += 15;

      // Corrective Actions Register (if any)
      if (correctiveActions.length > 0) {
        if (yPos > 650) {
          doc.addPage();
          yPos = 40;
        }

        doc.fillColor(darkNavy).font('Helvetica-Bold').fontSize(12).text('2. Corrective Actions & Findings Register', 40, yPos);
        yPos += 20;

        doc.rect(40, yPos, 515, 20).fill('#dc2626');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5)
          .text('SEV', 48, yPos + 5)
          .text('CHECKPOINT', 90, yPos + 5)
          .text('FINDING & ACTION', 160, yPos + 5)
          .text('RESPONSIBLE', 370, yPos + 5)
          .text('TARGET DATE', 460, yPos + 5);

        yPos += 20;

        correctiveActions.forEach((ca, idx) => {
          if (yPos > 720) {
            doc.addPage();
            yPos = 40;
          }

          const rowBg = idx % 2 === 0 ? '#ffffff' : '#fef2f2';
          doc.rect(40, yPos, 515, 24).fillAndStroke(rowBg, lightBorder);

          doc.fillColor(alertRed).font('Helvetica-Bold').fontSize(7.5).text(ca.severity.toUpperCase(), 48, yPos + 7);
          doc.fillColor(darkNavy).font('Helvetica-Bold').fontSize(7.5).text(getDisplayQuestionId(ca.questionId), 90, yPos + 7);
          doc.fillColor(textInk).font('Helvetica').fontSize(7.5)
            .text(`${ca.findingDescription} | Action: ${ca.correctiveAction}`, 160, yPos + 4, { width: 200, height: 18, ellipsis: true })
            .text(ca.responsiblePerson, 370, yPos + 7, { width: 85, ellipsis: true })
            .text(new Date(ca.targetDate).toLocaleDateString(), 460, yPos + 7);

          yPos += 24;
        });

        yPos += 15;
      }

      // Checkpoints & Detailed Findings
      if (yPos > 650) {
        doc.addPage();
        yPos = 40;
      }

      doc.fillColor(darkNavy).font('Helvetica-Bold').fontSize(12).text('3. Detailed Checkpoint Findings & Recorded Notes', 40, yPos);
      yPos += 20;

      // Group responses by section
      const responseMap = {};
      responses.forEach(r => { responseMap[r.questionId] = r; });

      // Draw each response record
      for (let i = 0; i < responses.length; i++) {
        const resp = responses[i];

        if (yPos > 680) {
          doc.addPage();
          yPos = 40;
        }

        doc.rect(40, yPos, 515, 18).fill(bgLight);
        doc.fillColor(darkNavy).font('Helvetica-Bold').fontSize(8.5)
          .text(`[${getDisplayQuestionId(resp.questionId)}] Section ${resp.sectionCode} - Assessment: ${resp.complianceAssessment || 'Observation'}`, 48, yPos + 4);

        yPos += 22;

        const answerText = typeof resp.responseValue === 'object' ? JSON.stringify(resp.responseValue) : String(resp.responseValue || 'No response recorded.');
        
        doc.fillColor(textInk).font('Helvetica').fontSize(8.5)
          .text(`Notes / Findings: ${answerText}`, 52, yPos, { width: 500 });
        
        const textHeight = doc.heightOfString(`Notes / Findings: ${answerText}`, { width: 500 });
        yPos += Math.max(textHeight + 10, 20);

        if (resp.observation && resp.observation.trim().length > 0) {
          doc.fillColor(mutedGrey).font('Helvetica-Oblique').fontSize(8)
            .text(`Auditor Remarks: ${resp.observation}`, 52, yPos, { width: 500 });
          const obsHeight = doc.heightOfString(`Auditor Remarks: ${resp.observation}`, { width: 500 });
          yPos += obsHeight + 8;
        }

        doc.moveTo(40, yPos).lineTo(555, yPos).strokeColor(lightBorder).stroke();
        yPos += 8;
      }

      // Sign-off & Reviewer Endorsement
      if (yPos > 650) {
        doc.addPage();
        yPos = 40;
      }

      yPos += 15;
      doc.rect(40, yPos, 515, 80).fillAndStroke(bgLight, lightBorder);
      doc.fillColor(darkNavy).font('Helvetica-Bold').fontSize(10).text('4. Reviewer Endorsement & Sign-Off', 52, yPos + 10);

      doc.fillColor(textInk).font('Helvetica').fontSize(8.5)
        .text(`Auditor: ${audit.assignedEmployee?.fullName || 'N/A'} (Emp ID: ${audit.assignedEmployee?.employeeId || 'N/A'})`, 52, yPos + 30)
        .text(`Date of Audit: ${new Date(audit.startDate).toLocaleDateString()}`, 52, yPos + 45)
        .text(`Submission Status: ${audit.status}`, 52, yPos + 60);

      doc.fillColor(textInk).font('Helvetica').fontSize(8.5)
        .text(`Reviewer: ${audit.reviewer?.fullName || 'Arun Kulkarni'} (Reviewer ID: ${audit.reviewer?.employeeId || 'ESM-REV-001'})`, 300, yPos + 30)
        .text(`Review Date: ${audit.approvedAt ? new Date(audit.approvedAt).toLocaleDateString() : 'Pending Sign-Off'}`, 300, yPos + 45)
        .text(`Decision: ${audit.status === 'Approved' ? 'Formally Approved & Accepted' : 'In Review / Draft'}`, 300, yPos + 60);

      // Footer with page numbers
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fillColor(mutedGrey).fontSize(7.5).font('Helvetica')
          .text(`ESM Plant Audit System &bull; Confidential &bull; Generated: ${new Date().toISOString().split('T')[0]}`, 40, 800, { align: 'left' })
          .text(`Page ${i + 1} of ${range.count}`, 450, 800, { align: 'right' });
      }

      doc.end();

      writeStream.on('finish', () => {
        resolve(outputPath);
      });

      writeStream.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  generateAuditPDF,
};

