// In-memory sliding window rate limiter for login protection
const loginAttempts = new Map();

const loginRateLimiter = (options = {}) => {
  const windowMs = options.windowMs || 60 * 1000; // 1 minute
  const maxAttempts = options.maxAttempts || 10;   // 10 attempts per minute per IP

  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'unknown';
    const now = Date.now();

    const record = loginAttempts.get(ip) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count += 1;
    }

    loginAttempts.set(ip, record);

    if (record.count > maxAttempts) {
      const remainingSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', remainingSeconds);
      return res.status(429).json({
        success: false,
        message: `Too many login attempts from this IP address. Please wait ${remainingSeconds} seconds before trying again.`,
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }

    // Periodically clean up old IP entries
    if (loginAttempts.size > 1000) {
      for (const [key, val] of loginAttempts.entries()) {
        if (now > val.resetTime) {
          loginAttempts.delete(key);
        }
      }
    }

    next();
  };
};

module.exports = { loginRateLimiter };

