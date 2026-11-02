const express = require('express');
const router = express.Router();
const {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  toggleEmployeeStatus,
  revokeEmployeeSessions,
  initiatePasswordReset,
} = require('../controllers/employeeController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

router.use(protect);
router.use(authorize('Super Admin', 'Admin'));

router.route('/')
  .get(getEmployees)
  .post(createEmployee);

router.route('/:id')
  .get(getEmployeeById)
  .put(updateEmployee);

router.patch('/:id/toggle-status', toggleEmployeeStatus);
router.post('/:id/revoke-sessions', revokeEmployeeSessions);
router.post('/:id/initiate-reset', initiatePasswordReset);

module.exports = router;
