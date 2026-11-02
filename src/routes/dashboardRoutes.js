const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

router.use(protect);
router.get('/stats', authorize('Super Admin', 'Admin', 'Reviewer'), getDashboardStats);

module.exports = router;

