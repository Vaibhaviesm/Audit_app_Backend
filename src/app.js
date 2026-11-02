const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const errorHandler = require('./middleware/errorHandler');
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const companyRoutes = require('./routes/companyRoutes');
const plantRoutes = require('./routes/plantRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const questionRoutes = require('./routes/questionRoutes');
const templateRoutes = require('./routes/templateRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const auditExecutionRoutes = require('./routes/auditExecutionRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const reportRoutes = require('./routes/reportRoutes');
const shareRoutes = require('./routes/shareRoutes');

const app = express();

// Trust reverse proxy for HTTPS cookie delivery on Vercel / Cloudflare
app.set('trust proxy', 1);

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Dynamic CORS configuration (supports local dev, custom domain, and *.vercel.app preview URLs)
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  process.env.APP_BASE_URL,
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests or same-origin
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      /\.vercel\.app$/.test(origin)
    ) {
      return callback(null, true);
    }
    // Allow origin in development / preview
    return callback(null, true);
  },
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Serverless DB Handshake: Ensure database is connected before processing any API route
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    try {
      await connectDB();
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: 'Database connection failed. Please check your MONGODB_URI configuration in Vercel.',
        error: err.message,
      });
    }
  }
  next();
});

const { protect } = require('./middleware/auth');

// Protected static uploaded files (evidence, reports)
const uploadStaticDir = process.env.VERCEL
  ? path.join('/tmp', 'uploads')
  : path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadStaticDir)) {
  try {
    fs.mkdirSync(uploadStaticDir, { recursive: true });
  } catch (e) {}
}

app.use('/uploads', protect, express.static(uploadStaticDir));

// Serve compiled frontend production assets if present
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date(),
    app: 'ESM Plant Audit Backend',
    environment: process.env.NODE_ENV || 'development',
    serverless: Boolean(process.env.VERCEL),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/plants', plantRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditExecutionRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/share', shareRoutes);

// SPA fallback for HTML5 History API (if frontend bundle is hosted with backend)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return next();
  }
  const indexPath = path.join(frontendDist, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(404).json({ success: false, message: 'Resource not found' });
});

// Centralized Error Handling
app.use(errorHandler);

module.exports = app;
