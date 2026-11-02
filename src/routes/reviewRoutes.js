const express = require('express');
const router = express.Router();
const { submitReview, getAuditReviews } = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

router.use(protect);

router.post('/submit', authorize('Super Admin', 'Admin', 'Reviewer'), submitReview);
router.get('/audit/:auditId', getAuditReviews);

module.exports = router;

