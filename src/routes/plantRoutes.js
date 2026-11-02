const express = require('express');
const router = express.Router();
const {
  getPlants,
  getPlantById,
  createPlant,
  updatePlant,
  deletePlant,
} = require('../controllers/plantController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

router.use(protect);

router.route('/')
  .get(authorize('Super Admin', 'Admin', 'Reviewer'), getPlants)
  .post(authorize('Super Admin', 'Admin'), createPlant);

router.route('/:id')
  .get(authorize('Super Admin', 'Admin', 'Reviewer'), getPlantById)
  .put(authorize('Super Admin', 'Admin'), updatePlant)
  .delete(authorize('Super Admin', 'Admin'), deletePlant);

module.exports = router;
