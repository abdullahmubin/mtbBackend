import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { body, validationResult } from 'express-validator';
import { BadRequest } from '../utils/errors/customErrors.js';
import logger from '../utils/logger.js';

/**
 * Rate Limiting Configuration
 */
export const createRateLimiters = () => {
    // Control rate limiting with environment variable `ENABLE_RATE_LIMIT`.
    // If `ENABLE_RATE_LIMIT` is set to 'true' -> enable rate limiting.
    // If `ENABLE_RATE_LIMIT` is explicitly set to 'false' -> disable rate limiting.
    // If not set, fall back to legacy behavior: enable only in production unless RATE_LIMIT_DISABLED is 'true'.

    const isProd = process.env.NODE_ENV === 'production';

    // Accept the correctly spelled `ENABLE_RATE_LIMIT` or a common typo `ENABLE_REATE_LIMIT`.
    const enableRateLimitEnv = process.env.ENABLE_RATE_LIMIT ?? process.env.ENABLE_REATE_LIMIT;
    const enableRateLimit = enableRateLimitEnv === 'true';

    const disabled = (enableRateLimitEnv !== undefined)
        ? !enableRateLimit
        : (process.env.RATE_LIMIT_DISABLED === 'true'); // || isProd

    // Emit runtime info so deploy environments (like Dokploy) show the effective setting.
    const envDebug = {
        ENABLE_RATE_LIMIT: process.env.ENABLE_RATE_LIMIT,
        ENABLE_REATE_LIMIT: process.env.ENABLE_REATE_LIMIT,
        RATE_LIMIT_DISABLED: process.env.RATE_LIMIT_DISABLED,
        NODE_ENV: process.env.NODE_ENV
    };
    const enabledState = disabled ? 'DISABLED' : 'ENABLED';
    if (logger && typeof logger.info === 'function') {
        logger.info(`Rate limiting is ${enabledState}. env: ${JSON.stringify(envDebug)}`);
    }
    // Also print to stdout so simple container logs capture it regardless of logger config
    console.info(`Rate limiting is ${enabledState}. env: ${JSON.stringify(envDebug)}`);

    // No-op middleware used when rate limits are disabled
    const noop = (req, res, next) => next();

    if (disabled) {
        return {
            general: noop,
            auth: noop,
            upload: noop,
        };
    }

    // General API rate limiter
    const generalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        message: {
            error: 'Too many requests from this IP, please try again later.',
            retryAfter: '15 minutes'
        },
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
    });

    // Auth endpoints rate limiter (more strict)
    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // Limit each IP to 5 requests per windowMs
        message: {
            error: 'Too many authentication attempts, please try again later.',
            retryAfter: '15 minutes'
        },
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
    });

    // File upload rate limiter
    const uploadLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 10, // Limit each IP to 10 uploads per hour
        message: {
            error: 'Too many file uploads, please try again later.',
            retryAfter: '1 hour'
        },
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
    });

    return {
        general: generalLimiter,
        auth: authLimiter,
        upload: uploadLimiter
    };
};

/**
 * Helmet Security Configuration
 */
export const helmetConfig = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
});

/**
 * CORS Configuration
 */
export const corsConfig = {
    origin: function (origin, callback) {
        const envOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
        const defaultOrigins = [
            'http://localhost:3000',
            'http://localhost:5173'
        ];

        // const defaultOrigins = [
        //     'http://localhost:3000',
        //     'http://localhost:5173',
        //     'https://app.noreplay@mytenantbook.com',
        //     'https://noreplay@mytenantbook.com'
        // ];

        const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Allow any localhost/127.0.0.1 with any port for dev
        const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\\d+)?$/.test(origin);
        if (isLocal) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    maxAge: 86400 // 24 hours
};

/**
 * Input Validation Middleware
 */
export const validateInput = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(error => ({
            field: error.path,
            message: error.msg,
            value: error.value
        }));
        throw new BadRequest(`Validation failed: ${JSON.stringify(errorMessages)}`);
    }
    next();
};

/**
 * Common Validation Rules
 */
export const commonValidations = {
    // User registration validation
    registerUser: [
        body('firstName').trim().isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters'),
        body('lastName').trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters'),
        body('userName').trim().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_]+$/).withMessage('Username must be 3-30 characters, alphanumeric and underscore only'),
        body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).withMessage('Password must be at least 8 characters with uppercase, lowercase, number and special character'),
        body('plan').isIn(['single-plan', 'basic-plan', 'premium-plan']).withMessage('Invalid plan selected'),
        validateInput
    ],

    // Login validation
    login: [
        body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('password').notEmpty().withMessage('Password is required'),
        validateInput
    ],

    // Receipt creation validation
    createReceipt: [
        body('receiptTitle').trim().isLength({ min: 1, max: 100 }).withMessage('Receipt title must be between 1 and 100 characters'),
        body('receiptCategoryId').isMongoId().withMessage('Valid category ID is required'),
        body('receiptDesign').notEmpty().withMessage('Receipt design is required'),
        validateInput
    ],

    // Update receipt validation
    updateReceipt: [
        body('_id').isMongoId().withMessage('Valid receipt ID is required'),
        body('receiptTitle').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Receipt title must be between 1 and 100 characters'),
        body('receiptCategoryId').optional().isMongoId().withMessage('Valid category ID is required'),
        validateInput
    ],

    // ID parameter validation
    validateId: [
        body('id').isMongoId().withMessage('Valid ID is required'),
        validateInput
    ],

    // Contract creation validation
    createContract: [
        body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required and must be under 200 characters'),
        body('tenant_id').notEmpty().withMessage('tenant_id is required'),
        body('effective_date').optional().isISO8601().withMessage('effective_date must be a valid ISO date'),
        body('expiry_date').optional().isISO8601().withMessage('expiry_date must be a valid ISO date'),
        body('auto_renew').optional().isBoolean().withMessage('auto_renew must be boolean'),
        validateInput
    ],

    // Contract update validation
    updateContract: [
        body('title').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Title must be under 200 characters'),
        body('expiry_date').optional().isISO8601().withMessage('expiry_date must be a valid ISO date'),
        body('auto_renew').optional().isBoolean().withMessage('auto_renew must be boolean'),
        validateInput
    ]
};

/**
 * Request Sanitization Middleware
 */
export const sanitizeRequest = (req, res, next) => {
    // Sanitize request body
    if (req.body) {
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = req.body[key].trim();
            }
        });
    }

    // Sanitize query parameters
    if (req.query) {
        Object.keys(req.query).forEach(key => {
            if (typeof req.query[key] === 'string') {
                req.query[key] = req.query[key].trim();
            }
        });
    }

    next();
};

/**
 * Security Headers Middleware
 */
export const securityHeaders = (req, res, next) => {
    // Remove server information
    res.removeHeader('X-Powered-By');
    
    // Add custom security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    next();
};

/**
 * Request Logging Middleware
 */
export const requestLogger = (req, res, next) => {
    req.startTime = Date.now();
    // logger.info('incoming request', { time: new Date().toISOString(), method: req.method, url: req.originalUrl, ip: req.ip });
    res.on('finish', () => {
        const duration = Date.now() - req.startTime;
        // logger.info('request finished', { time: new Date().toISOString(), method: req.method, url: req.originalUrl, status: res.statusCode, duration });
    });
    next();
};