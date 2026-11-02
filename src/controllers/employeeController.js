const crypto = require('crypto');
const User = require('../models/User');
const Plant = require('../models/Plant');
const AuditAssignment = require('../models/AuditAssignment');
const { logSecurityEvent } = require('../services/securityLogger');
const { NODE_ENV } = require('../config/env');

exports.getEmployees = async (req, res, next) => {
  try {
    const { search, role, status, companyId } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
      ];
    }

    if (role) {
      query.role = role;
    }

    if (status) {
      query.status = status;
    }

    if (companyId) {
      query.companyAssignments = companyId;
    }

    const employees = await User.find(query)
      .select('-passwordHash -passwordResetToken -passwordResetExpires')
      .populate('companyAssignments', 'name code')
      .populate('plantAssignments', 'name code city state')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: employees.length,
      data: employees,
    });
  } catch (error) {
    next(error);
  }
};

exports.getEmployeeById = async (req, res, next) => {
  try {
    const employee = await User.findById(req.params.id)
      .select('-passwordHash -passwordResetToken -passwordResetExpires')
      .populate('companyAssignments', 'name code industry')
      .populate('plantAssignments', 'name code city');

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const assignedAudits = await AuditAssignment.find({ assignedEmployee: employee._id })
      .populate('company', 'name code')
      .populate('plant', 'name code')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        ...employee.toObject(),
        assignedAudits,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.createEmployee = async (req, res, next) => {
  try {
    const { fullName, email, password, phone, role, companyAssignments = [], plantAssignments = [] } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, and password are required.',
      });
    }

    // Role privilege escalation check:
    // Only Super Admin can create Admin or Super Admin accounts.
    if (req.user.role === 'Admin') {
      if (role === 'Super Admin') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Admins are not permitted to create Super Admin accounts.',
        });
      }
      if (role === 'Admin') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Only Super Admin can create and manage Administrator accounts.',
        });
      }
    }

    // Validate plantAssignments: Each plant must belong to an assigned company
    if (plantAssignments && plantAssignments.length > 0) {
      const plants = await Plant.find({ _id: { $in: plantAssignments } });
      const compIdStrings = companyAssignments.map((id) => id.toString());
      for (const plant of plants) {
        if (!compIdStrings.includes(plant.company.toString())) {
          return res.status(400).json({
            success: false,
            message: `Plant '${plant.name}' does not belong to any of the assigned companies.`,
          });
        }
      }
    }

    const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: 'An employee with this email address already exists.',
      });
    }

    // Generate unique employee ID
    const count = await User.countDocuments();
    const prefix = role === 'Reviewer' ? 'ESM-REV-' : (role === 'Super Admin' || role === 'Admin' ? 'ESM-ADM-' : 'ESM-EMP-');
    const employeeId = `${prefix}${String(count + 1).padStart(3, '0')}`;

    const passwordHash = await User.hashPassword(password);

    const employee = await User.create({
      employeeId,
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      phone: phone ? phone.trim() : '',
      role: role || 'Auditor/Employee',
      companyAssignments,
      plantAssignments,
      status: 'Active',
      tokenVersion: 0,
    });

    await logSecurityEvent({
      userId: req.user._id,
      email: req.user.email,
      eventType: 'ACCOUNT_CREATED',
      req,
      details: { createdUserId: employee._id, createdEmail: employee.email, role: employee.role },
    });

    res.status(201).json({
      success: true,
      data: employee.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

exports.updateEmployee = async (req, res, next) => {
  try {
    const { fullName, phone, role, companyAssignments, plantAssignments, status } = req.body;

    const employee = await User.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    // Role privilege escalation check:
    // Admin cannot modify Super Admin account
    if (req.user.role === 'Admin' && employee.role === 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Admins cannot modify Super Admin accounts.',
      });
    }

    // Admin cannot elevate any user to Super Admin or Admin
    if (req.user.role === 'Admin' && role && role !== employee.role) {
      if (role === 'Super Admin' || role === 'Admin') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Admins cannot elevate roles to Administrator or Super Admin.',
        });
      }
    }

    // Prevent Admin from elevating their own role
    if (employee._id.toString() === req.user._id.toString() && role && role !== req.user.role) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You cannot elevate your own role.',
      });
    }

    // Validate plantAssignments: Each plant must belong to assigned companies
    const effectiveCompanyAssignments = companyAssignments || employee.companyAssignments;
    const effectivePlantAssignments = plantAssignments || employee.plantAssignments;

    if (effectivePlantAssignments && effectivePlantAssignments.length > 0) {
      const plants = await Plant.find({ _id: { $in: effectivePlantAssignments } });
      const compIdStrings = (effectiveCompanyAssignments || []).map((id) => id.toString());
      for (const plant of plants) {
        if (!compIdStrings.includes(plant.company.toString())) {
          return res.status(400).json({
            success: false,
            message: `Plant '${plant.name}' does not belong to any of the assigned companies.`,
          });
        }
      }
    }

    if (fullName) employee.fullName = fullName.trim();
    if (phone !== undefined) employee.phone = phone.trim();
    if (role) {
      if (role !== employee.role) {
        await logSecurityEvent({
          userId: req.user._id,
          email: req.user.email,
          eventType: 'ROLE_CHANGED',
          req,
          details: { targetUserId: employee._id, oldRole: employee.role, newRole: role },
        });
      }
      employee.role = role;
    }
    if (companyAssignments) employee.companyAssignments = companyAssignments;
    if (plantAssignments) employee.plantAssignments = plantAssignments;

    if (status && status !== employee.status) {
      employee.status = status;
      // If deactivating, immediately revoke active sessions
      if (status === 'Inactive') {
        employee.tokenVersion = (employee.tokenVersion || 0) + 1;
      }
      await logSecurityEvent({
        userId: req.user._id,
        email: req.user.email,
        eventType: 'ACCOUNT_STATUS_CHANGED',
        req,
        details: { targetUserId: employee._id, newStatus: status },
      });
    }

    await employee.save();

    res.status(200).json({
      success: true,
      data: employee.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

exports.toggleEmployeeStatus = async (req, res, next) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    if (req.user.role === 'Admin' && employee.role === 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Admins cannot change the status of a Super Admin account.',
      });
    }

    employee.status = employee.status === 'Active' ? 'Inactive' : 'Active';

    // If deactivating, immediately increment tokenVersion to revoke all active sessions
    if (employee.status === 'Inactive') {
      employee.tokenVersion = (employee.tokenVersion || 0) + 1;
    }

    await employee.save();

    await logSecurityEvent({
      userId: req.user._id,
      email: req.user.email,
      eventType: 'ACCOUNT_STATUS_CHANGED',
      req,
      details: { targetUserId: employee._id, newStatus: employee.status },
    });

    res.status(200).json({
      success: true,
      message: `Employee marked as ${employee.status}.`,
      status: employee.status,
    });
  } catch (error) {
    next(error);
  }
};

exports.revokeEmployeeSessions = async (req, res, next) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    if (req.user.role === 'Admin' && employee.role === 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Admins cannot revoke sessions for Super Admin accounts.',
      });
    }

    employee.tokenVersion = (employee.tokenVersion || 0) + 1;
    await employee.save();

    await logSecurityEvent({
      userId: req.user._id,
      email: req.user.email,
      eventType: 'SESSIONS_REVOKED',
      req,
      details: { targetUserId: employee._id, targetEmail: employee.email },
    });

    res.status(200).json({
      success: true,
      message: `All active sessions for ${employee.fullName} have been revoked.`,
    });
  } catch (error) {
    next(error);
  }
};

exports.initiatePasswordReset = async (req, res, next) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    if (req.user.role === 'Admin' && employee.role === 'Super Admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Admins cannot initiate password reset for Super Admin accounts.',
      });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    employee.passwordResetToken = hashedToken;
    employee.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await employee.save();

    await logSecurityEvent({
      userId: req.user._id,
      email: req.user.email,
      eventType: 'PASSWORD_RESET_REQUEST',
      req,
      details: { targetUserId: employee._id, targetEmail: employee.email, initiatedByAdmin: true },
    });

    res.status(200).json({
      success: true,
      message: `Password reset token generated for ${employee.fullName}.`,
      ...(NODE_ENV !== 'production' && { resetToken: rawToken }),
    });
  } catch (error) {
    next(error);
  }
};
