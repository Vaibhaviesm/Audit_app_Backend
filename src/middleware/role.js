const { logSecurityEvent } = require('../services/securityLogger');

const authorize = (...roles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
        code: 'AUTH_REQUIRED',
      });
    }

    if (!roles.includes(req.user.role)) {
      await logSecurityEvent({
        userId: req.user._id,
        email: req.user.email,
        eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        req,
        details: {
          attemptedUrl: req.originalUrl,
          method: req.method,
          requiredRoles: roles,
          userRole: req.user.role,
        },
      });

      return res.status(403).json({
        success: false,
        message: `Forbidden: User role '${req.user.role}' is not authorized to access this resource.`,
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    next();
  };
};

module.exports = { authorize };
