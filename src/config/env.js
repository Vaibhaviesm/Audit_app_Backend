const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/esm_plant_audit',
  JWT_SECRET: process.env.JWT_SECRET || 'esm_plant_audit_super_secret_jwt_key_2026_secured',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'esm_plant_audit_super_secret_jwt_key_2026_secured',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'esm_plant_audit_refresh_secret_key_2026_secured',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  COOKIE_SECRET: process.env.COOKIE_SECRET || 'esm_cookie_secret_key_plant_audit_2026',
  APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:3000',
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:5000',
  UPLOAD_DIR: process.env.UPLOAD_DIR || (process.env.VERCEL ? '/tmp/uploads' : 'uploads'),
  SMTP: {
    HOST: process.env.SMTP_HOST || 'smtp.mailtrap.io',
    PORT: parseInt(process.env.SMTP_PORT || '2525', 10),
    USER: process.env.SMTP_USER || '',
    PASS: process.env.SMTP_PASS || '',
    FROM: process.env.SMTP_FROM || 'ESM Plant Audit System <noreply@esm-audit.com>',
  },
  AI: {
    API_KEY: process.env.AUDIT_AI_API_KEY || '',
    MODEL: process.env.AUDIT_AI_MODEL || 'google/gemini-2.0-flash-001',
    BASE_URL: process.env.AUDIT_AI_BASE_URL || 'https://openrouter.ai/api/v1',
  },
};
