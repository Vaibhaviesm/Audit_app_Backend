const nodemailer = require('nodemailer');
const { SMTP, APP_BASE_URL } = require('../config/env');

let transporter = null;

if (SMTP.USER && SMTP.PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP.HOST,
    port: SMTP.PORT,
    secure: SMTP.PORT === 465,
    auth: {
      user: SMTP.USER,
      pass: SMTP.PASS,
    },
  });
}

const sendAuditInvitationEmail = async ({
  recipientEmail,
  employeeName,
  companyName,
  plantName,
  auditReference,
  auditType,
  dueDate,
  instructions,
  auditUrl,
}) => {
  const subject = `Plant Audit Assignment: ${auditReference} - ${companyName} (${plantName})`;
  const formattedDueDate = new Date(dueDate).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #182b3c; border: 1px solid #e2eaf0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #0c746d; color: #ffffff; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 22px;">ESM Plant Audit Management System</h1>
        <p style="margin: 6px 0 0; opacity: 0.9; font-size: 14px;">Industrial Operational & Quality Audit</p>
      </div>
      <div style="padding: 28px; background-color: #ffffff;">
        <p style="font-size: 16px;">Hello <strong>${employeeName}</strong>,</p>
        <p>You have been assigned to conduct an on-site plant audit:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <tr style="border-bottom: 1px solid #e2eaf0;">
            <td style="padding: 10px 0; color: #708294; width: 140px;">Audit Reference:</td>
            <td style="padding: 10px 0; font-weight: bold; color: #112e3f;">${auditReference}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2eaf0;">
            <td style="padding: 10px 0; color: #708294;">Company:</td>
            <td style="padding: 10px 0; font-weight: bold;">${companyName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2eaf0;">
            <td style="padding: 10px 0; color: #708294;">Plant / Facility:</td>
            <td style="padding: 10px 0; font-weight: bold;">${plantName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2eaf0;">
            <td style="padding: 10px 0; color: #708294;">Audit Scope:</td>
            <td style="padding: 10px 0;">${auditType}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2eaf0;">
            <td style="padding: 10px 0; color: #708294;">Due Date:</td>
            <td style="padding: 10px 0; font-weight: bold; color: #b83d46;">${formattedDueDate}</td>
          </tr>
          ${instructions ? `
          <tr style="border-bottom: 1px solid #e2eaf0;">
            <td style="padding: 10px 0; color: #708294;">Instructions:</td>
            <td style="padding: 10px 0;">${instructions}</td>
          </tr>` : ''}
        </table>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${auditUrl}" style="background-color: #0c746d; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">
            Open Audit Workspace
          </a>
        </div>

        <p style="font-size: 13px; color: #708294;">
          Note: This secure link requires you to log in with your authorized ESM auditor account. Unauthorized forwarding is strictly prohibited.
        </p>
      </div>
      <div style="background-color: #f4f7f9; padding: 16px; text-align: center; font-size: 12px; color: #708294; border-top: 1px solid #e2eaf0;">
        ESM Industrial Operations & Audit Division &bull; Confidential &bull; Generated Automatically
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`[EmailService MOCK] SMTP credentials not set. Simulated sending email to ${recipientEmail}:`);
    console.log(`Subject: ${subject}`);
    console.log(`Audit Link: ${auditUrl}`);
    return {
      sent: true,
      simulated: true,
      messageId: `mock-${Date.now()}`,
      previewUrl: auditUrl,
    };
  }

  const info = await transporter.sendMail({
    from: SMTP.FROM,
    to: recipientEmail,
    subject,
    html: htmlContent,
  });

  return {
    sent: true,
    simulated: false,
    messageId: info.messageId,
  };
};

module.exports = {
  sendAuditInvitationEmail,
};

