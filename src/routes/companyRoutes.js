const express = require('express');
const router = express.Router();
const {
  getCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany,
  toggleCompanyStatus,
} = require('../controllers/companyController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

router.use(protect);

router.route('/')
  .get(authorize('Super Admin', 'Admin', 'Reviewer'), getCompanies)
  .post(authorize('Super Admin', 'Admin'), createCompany);

router.patch('/:id/toggle-status', authorize('Super Admin', 'Admin'), toggleCompanyStatus);

router.route('/:id')
  .get(authorize('Super Admin', 'Admin', 'Reviewer'), getCompanyById)
  .put(authorize('Super Admin', 'Admin'), updateCompany)
  .delete(authorize('Super Admin', 'Admin'), deleteCompany);

module.exports = router;
