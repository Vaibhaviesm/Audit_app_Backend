const Plant = require('../models/Plant');
const Company = require('../models/Company');

exports.getPlants = async (req, res, next) => {
  try {
    const { companyId, search } = req.query;
    const query = {};

    if (companyId) {
      query.company = companyId;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
      ];
    }

    const plants = await Plant.find(query).populate('company', 'name code industry').sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: plants.length,
      data: plants,
    });
  } catch (error) {
    next(error);
  }
};

exports.getPlantById = async (req, res, next) => {
  try {
    const plant = await Plant.findById(req.params.id).populate('company', 'name code');
    if (!plant) {
      return res.status(404).json({ success: false, message: 'Plant not found' });
    }
    res.status(200).json({ success: true, data: plant });
  } catch (error) {
    next(error);
  }
};

exports.createPlant = async (req, res, next) => {
  try {
    const { name, code, company, address, city, state, country, contactPerson, contactNumber, operationalInfo } = req.body;

    if (!name || !code || !company) {
      return res.status(400).json({
        success: false,
        message: 'Plant name, code, and parent company are required.',
      });
    }

    const parentCompany = await Company.findById(company);
    if (!parentCompany) {
      return res.status(404).json({ success: false, message: 'Parent company not found' });
    }

    const existingCode = await Plant.findOne({ code: code.toUpperCase().trim() });
    if (existingCode) {
      return res.status(409).json({
        success: false,
        message: `Plant code '${code.toUpperCase()}' is already taken.`,
      });
    }

    const plant = await Plant.create({
      name,
      code: code.toUpperCase().trim(),
      company,
      address,
      city,
      state,
      country: country || 'India',
      contactPerson,
      contactNumber,
      operationalInfo,
    });

    res.status(201).json({
      success: true,
      data: plant,
    });
  } catch (error) {
    next(error);
  }
};

exports.updatePlant = async (req, res, next) => {
  try {
    const plant = await Plant.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).populate('company', 'name code');

    if (!plant) {
      return res.status(404).json({ success: false, message: 'Plant not found' });
    }

    res.status(200).json({
      success: true,
      data: plant,
    });
  } catch (error) {
    next(error);
  }
};

exports.deletePlant = async (req, res, next) => {
  try {
    const plant = await Plant.findByIdAndDelete(req.params.id);
    if (!plant) {
      return res.status(404).json({ success: false, message: 'Plant not found' });
    }
    res.status(200).json({
      success: true,
      message: 'Plant deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

