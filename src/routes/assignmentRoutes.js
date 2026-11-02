const express = require('express');
const router = express.Router();
const {
  getAssignments,
  getAssignmentById,
  createAssignment,
  reassignAudit,
} = require('../controllers/assignmentController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

router.use(protect);

router.route('/')
  .get(authorize('Super Admin', 'Admin', 'Reviewer'), getAssignments)
  .post(authorize('Super Admin', 'Admin'), createAssignment);

router.route('/:id')
  .get(authorize('Super Admin', 'Admin', 'Reviewer'), getAssignmentById);

router.post('/:id/reassign', authorize('Super Admin', 'Admin'), reassignAudit);

module.exports = router;
