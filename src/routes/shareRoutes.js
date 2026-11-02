const express = require('express');
const router = express.Router();
const { shareAudit, verifyInvitationToken } = require('../controllers/shareController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

router.post('/share', protect, authorize('Super Admin', 'Admin', 'Reviewer'), shareAudit);
router.get('/verify/:token', verifyInvitationToken);

module.exports = router;

