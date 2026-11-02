const express = require('express');
const router = express.Router();
const { getTemplates, getTemplateById, createTemplate } = require('../controllers/templateController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

router.use(protect);

router.route('/')
  .get(getTemplates)
  .post(authorize('Super Admin', 'Admin'), createTemplate);

router.route('/:id')
  .get(getTemplateById);

module.exports = router;

