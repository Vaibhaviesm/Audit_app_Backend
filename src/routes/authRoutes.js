const express = require('express');
const router = express.Router();
const {
  login,
  getMe,
  logout,
  refresh,
  changePassword,
  forgotPassword,
  resetPassword,
  logoutAll,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { loginRateLimiter } = require('../middleware/rateLimiter');

router.post('/login', loginRateLimiter({ maxAttempts: 10, windowMs: 60 * 1000 }), login);
router.post('/logout', logout);
router.post('/refresh', refresh);
router.get('/me', protect, getMe);
router.post('/change-password', protect, changePassword);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/logout-all', protect, logoutAll);

module.exports = router;
