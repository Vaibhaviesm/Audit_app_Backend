const express = require('express');
const router = express.Router();
const { generateReport, downloadReport, getReports } = require('../controllers/reportController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

router.use(protect);

router.post('/generate', generateReport);
router.get('/', getReports);
router.get('/:id/download', downloadReport);

module.exports = router;

