import { GeneralError } from "./customErrors.js";
import logger from "../logger.js";
import errorLogService from '../../services/errorLogService.js';

/**
 * Global Error Handler Middleware
 * Handles all application errors and provides consistent error responses
 */
export const handleErrors = async (err, req, res, next) => {
    // Log the error with context
    logger.error('Application Error', err, {
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id || 'anonymous',
        body: req.body,
        params: req.params,
        query: req.query
    });

    // Persist error to DB (best-effort). Do not block response.
    try {
        errorLogService.logError({
            err,
            message: err?.message,
            name: err?.name,
            stack: err?.stack,
            route: req.originalUrl,
            method: req.method,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            userId: req.user?.id || 'anonymous',
            body: req.body,
            params: req.params,
            query: req.query
        });
    } catch (e) {
        // swallow
        logger.warn('errorLogService failed inside error handler', { e });
    }

    // Handle known application errors
    if (err instanceof GeneralError) {
        const code = err.getCode();
        return res.status(code).json({
            status: "Error",
            statusCode: code,
            message: err.message,
            name: err.name,
            timestamp: new Date().toISOString()
        });
    }

    // Handle Mongoose validation errors
    if (err.name === 'ValidationError') {
        const validationErrors = Object.values(err.errors).map(error => ({
            field: error.path,
            message: error.message,
            value: error.value
        }));

        return res.status(400).json({
            status: "Error",
            statusCode: 400,
            message: 'Data validation failed',
            name: 'Validation Error',
            errors: validationErrors,
            timestamp: new Date().toISOString()
        });
    }

    // Handle Mongoose duplicate key errors
    if (err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0];
        return res.status(409).json({
            status: "Error",
            statusCode: 409,
            message: `${field} already exists`,
            name: 'Duplicate Error',
            field: field,
            timestamp: new Date().toISOString()
        });
    }

    // Handle JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            status: "Error",
            statusCode: 401,
            message: 'Invalid token',
            name: 'Token Error',
            timestamp: new Date().toISOString()
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            status: "Error",
            statusCode: 401,
            message: 'Token has expired',
            name: 'Token Expired',
            timestamp: new Date().toISOString()
        });
    }

    // Handle MongoDB connection errors
    if (err.name === 'MongoNetworkError' || err.name === 'MongoServerSelectionError') {
        return res.status(503).json({
            status: "Error",
            statusCode: 503,
            message: 'Database connection failed',
            name: 'Database Error',
            timestamp: new Date().toISOString()
        });
    }

    // Handle file upload errors
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            status: "Error",
            statusCode: 413,
            message: 'File size exceeds the limit',
            name: 'File Too Large',
            timestamp: new Date().toISOString()
        });
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
            status: "Error",
            statusCode: 400,
            message: 'Unexpected file field',
            name: 'File Upload Error',
            timestamp: new Date().toISOString()
        });
    }

    // Handle rate limiting errors
    if (err.status === 429) {
        return res.status(429).json({
            status: "Error",
            statusCode: 429,
            message: err.message || 'Too many requests',
            name: 'Rate Limit Exceeded',
            retryAfter: err.headers?.['retry-after'],
            timestamp: new Date().toISOString()
        });
    }

    // Default error response for unknown errors
    const statusCode = err.statusCode || err.status || 500;
    const message = process.env.NODE_ENV === 'production' 
        ? 'Internal Server Error' 
        : err.message || 'Something went wrong';

    return res.status(statusCode).json({
        status: "Error",
        statusCode: statusCode,
        message: message,
        name: 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && {
            stack: err.stack,
            details: err
        }),
        timestamp: new Date().toISOString()
    });
};

/**
 * Async Error Wrapper
 * Wraps async route handlers to catch unhandled promise rejections
 */
export const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Not Found Handler
 * Handles 404 errors for undefined routes
 */
export const notFoundHandler = (req, res) => {
    logger.warn('Route not found', {
        url: req.originalUrl,
        method: req.method,
        ip: req.ip
    });

    res.status(404).json({
        status: "Error",
        statusCode: 404,
        message: `Route ${req.originalUrl} not found`,
        name: 'Not Found',
        timestamp: new Date().toISOString()
    });
};