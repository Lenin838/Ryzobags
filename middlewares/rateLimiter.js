const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  keyGenerator: (req, res) => {
    const userId = req.session?.user?._id || req.user?._id;
    return userId?.toString() || req.ip;
  },
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the request limit. Please try again later.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  keyGenerator: (req, res) => {
    const email = req.body?.email?.toLowerCase();
    return email || req.ip;
  },
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json({
      error: 'Too many login attempts',
      message: 'You have exceeded the maximum number of login attempts. Please try again later.',
      retryAfter: `${Math.round(options.windowMs / 60000)} minutes`,
      details: {
        limit: req.rateLimit.limit,
        current: req.rateLimit.current,
        remaining: req.rateLimit.remaining,
        resetTime: new Date(req.rateLimit.resetTime).toISOString(),
      },
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  keyGenerator: (req, res) => {
    const email = req.body?.email?.toLowerCase();
    return email || req.ip;
  },
  message: {
    error: 'Too many OTP requests',
    message: 'You have exceeded the OTP request limit. Please try again after 5 minutes.',
    retryAfter: '5 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  keyGenerator: (req, res) => {
    const email = req.body?.email?.toLowerCase();
    return email || req.ip;
  },
  message: {
    error: 'Too many payment attempts',
    message: 'You have exceeded the payment request limit. Please try again later.',
    retryAfter: '5 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const couponLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  keyGenerator: (req, res) => {
    const userId = req.session?.user?._id || req.user?._id;
    return userId?.toString() || req.ip;
  },
  message: {
    error: 'Too many coupon attempts',
    message: 'You have exceeded the coupon usage limit. Please try again later.',
    retryAfter: '5 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const requestLogger = (req, res, next) => {
  console.log('\n📥 Incoming Request:');
  console.log('- Method:', req.method);
  console.log('- URL:', req.originalUrl);
  console.log('- IP:', req.ip);
  console.log('- User-Agent:', req.get('User-Agent'));
  console.log('- Body:', JSON.stringify(req.body, null, 2));
  next();
};

module.exports = {
  globalLimiter,
  loginLimiter,
  otpLimiter,
  paymentLimiter,
  couponLimiter,
  requestLogger,
};
