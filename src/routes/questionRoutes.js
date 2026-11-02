const express = require('express');
const router = express.Router();
const {
  getSections,
  createSection,
  getQuestions,
  getQuestionById,
  createQuestion,
  updateQuestion,
  toggleQuestionStatus,
  deleteCustomQuestion,
} = require('../controllers/questionController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

router.use(protect);

router.route('/sections')
  .get(getSections)
  .post(authorize('Super Admin', 'Admin'), createSection);

router.route('/')
  .get(getQuestions)
  .post(authorize('Super Admin', 'Admin'), createQuestion);

router.patch('/:id/toggle-status', authorize('Super Admin', 'Admin'), toggleQuestionStatus);

router.route('/:id')
  .get(getQuestionById)
  .put(authorize('Super Admin', 'Admin'), updateQuestion)
  .delete(authorize('Super Admin', 'Admin'), deleteCustomQuestion);

module.exports = router;
