const Company = require('../models/Company');
const Plant = require('../models/Plant');
const AuditAssignment = require('../models/AuditAssignment');
const User = require('../models/User');

exports.getCompanies = async (req, res, next) => {
  try {
    const { search, status } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { industry: { $regex: search, $options: 'i' } },
      ];
    }

    if (status) {
      query.status = status;
    }

    const companies = await Company.find(query).sort({ createdAt: -1 });

    // Fetch plants count for each company
    const plantCounts = await Plant.aggregate([
      { $group: { _id: '$company', count: { $sum: 1 } } }
    ]);
    const plantCountMap = {};
    plantCounts.forEach(p => { plantCountMap[p._id.toString()] = p.count; });

    const result = companies.map(c => ({
      ...c.toObject(),
      plantCount: plantCountMap[c._id.toString()] || 0,
    }));

    res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

exports.getCompanyById = async (req, res, next) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    const plants = await Plant.find({ company: company._id });
    const employees = await User.find({ companyAssignments: company._id })
      .select('-passwordHash')
      .populate('plantAssignments', 'name code city');
    const audits = await AuditAssignment.find({ company: company._id })
      .populate('plant', 'name code')
      .populate('assignedEmployee', 'fullName email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        ...company.toObject(),
        plants,
        employees,
        audits,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.toggleCompanyStatus = async (req, res, next) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    company.status = company.status === 'Active' ? 'Inactive' : 'Active';
    await company.save();

    res.status(200).json({
      success: true,
      message: `Company marked as ${company.status}.`,
      status: company.status,
      data: company,
    });
  } catch (error) {
    next(error);
  }
};

exports.createCompany = async (req, res, next) => {
  try {
    const { name, code, industry, registeredAddress, contactPerson, contactEmail, contactMobile, notes } = req.body;

    if (!name || !code || !industry) {
      return res.status(400).json({
        success: false,
        message: 'Company name, unique code, and industry are required.',
      });
    }

    const existing = await Company.findOne({ code: code.toUpperCase().trim() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Company code '${code.toUpperCase()}' is already in use.`,
      });
    }

    const company = await Company.create({
      name,
      code: code.toUpperCase().trim(),
      industry,
      registeredAddress,
      contactPerson,
      contactEmail,
      contactMobile,
      notes,
    });

    res.status(201).json({
      success: true,
      data: company,
    });
  } catch (error) {
    next(error);
  }
};

exports.updateCompany = async (req, res, next) => {
  try {
    const company = await Company.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    res.status(200).json({
      success: true,
      data: company,
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteCompany = async (req, res, next) => {
  try {
    const plantCount = await Plant.countDocuments({ company: req.params.id });
    if (plantCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete company. It has ${plantCount} associated plant(s). Please remove or reassign the plants first.`,
      });
    }

    const company = await Company.findByIdAndDelete(req.params.id);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Company deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

