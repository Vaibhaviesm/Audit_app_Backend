const express = require('express');
const router = express.Router();
const {
  getAuditTypes,
  getAuditTypeById,
  createAuditType,
  updateAuditType,
  toggleAuditTypeStatus,
  addSection,
  addQuestionsFromBank,
  createQuestionInType,
  reorderQuestions,
  copyQuestions,
  moveQuestions,
  removeQuestionFromType,
  deleteAuditType,
} = require('../controllers/auditTypeController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

router.use(protect);

// Global actions: Copy / Move questions between audit types
router.post('/copy-questions', authorize('Super Admin', 'Admin'), copyQuestions);
router.post('/move-questions', authorize('Super Admin', 'Admin'), moveQuestions);

router.route('/')
  .get(getAuditTypes)
  .post(authorize('Super Admin', 'Admin'), createAuditType);

router.patch('/:id/toggle-status', authorize('Super Admin', 'Admin'), toggleAuditTypeStatus);
router.post('/:id/sections', authorize('Super Admin', 'Admin'), addSection);
router.post('/:id/questions/add-from-bank', authorize('Super Admin', 'Admin'), addQuestionsFromBank);
router.post('/:id/questions/create', authorize('Super Admin', 'Admin'), createQuestionInType);
router.put('/:id/questions/reorder', authorize('Super Admin', 'Admin'), reorderQuestions);
router.delete('/:id/questions/:questionId', authorize('Super Admin', 'Admin'), removeQuestionFromType);

router.route('/:id')
  .get(getAuditTypeById)
  .put(authorize('Super Admin', 'Admin'), updateAuditType)
  .delete(authorize('Super Admin', 'Admin'), deleteAuditType);

module.exports = router;

