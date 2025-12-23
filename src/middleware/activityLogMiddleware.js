import { createActivityLog } from '../services/activityLogService.js';
import logger from '../utils/logger.js';
import ACTIONS from '../utils/activityActions.js';

export const logActivity = (action, resourceType, description) => {
    return async (req, res, next) => {
    logger.debug('activity log middleware');
        // Add start time for response time calculation
        req.startTime = Date.now();
        
        // Store original methods
        const originalSend = res.send;
        const originalJson = res.json;
        const originalStatus = res.status;
        
        // Track if response has been sent to prevent duplicate logging
        let responseSent = false;
        
        // Override res.status to track status codes
        res.status = function(code) {
            res.statusCode = code;
            return originalStatus.call(this, code);
        };
    logger.debug('activity log middleware 22');
        // Override res.send to intercept successful responses
        res.send = function(data) {
            if (!responseSent) {
                logger.debug('activity log middleware 26');
                responseSent = true;
                logActivityData(req, res, action, resourceType, description, 'SUCCESS', data);
            }
            originalSend.call(this, data);
        };
    logger.debug('activity log middleware 31');
        // Override res.json for JSON responses
        res.json = function(data) {
            if (!responseSent) {
                logger.debug('activity log middleware 36');
                responseSent = true;
                logActivityData(req, res, action, resourceType, description, 'SUCCESS', data);
            }
            originalJson.call(this, data);
        };
        
    logger.debug('activity log middleware 41');
        // Handle errors by overriding next
        const originalNext = next;
        next = function(error) {
            if (error && !responseSent) {
                logger.debug('activity log middleware 48');
                responseSent = true;
                logActivityData(req, res, action, resourceType, description, 'FAILED', null, error);
            }
            originalNext.call(this, error);
        };
        
        next();
    };
};

const logActivityData = async (req, res, action, resourceType, description, status, responseData, error = null) => {
    try {
        // ✅ CORRECT: Use req.user.id (from JWT payload) instead of req.user._id
        // ✅ Get user ID from JWT payload
        const userId = req.user?.id;
    logger.debug('activity log userId', { userId });
        
        // ✅ Get username and other user details
        const username = req.user?.username;
        const userEmail = req.user?.email;
        const userRole = req.user?.role;
        
        const logData = {
            userId: userId,
            action,
            resourceType,
            description: error ? `${description} - FAILED` : description,
            ipAddress: getClientIP(req),
            userAgent: req.get('User-Agent'),
            status,
            // ✅ Add username directly to main log object for easy access
            username: username || 'anonymous',
            metadata: {
                method: req.method,
                url: req.originalUrl,
                statusCode: res.statusCode,
                responseTime: Date.now() - req.startTime,
                isAuthenticated: !!userId,
                requestBody: sanitizeRequestBody(req.body),
                requestParams: req.params,
                requestQuery: req.query,
                headers: sanitizeHeaders(req.headers),
                // ✅ Enhanced user context
                userContext: {
                    userId: userId,
                    username: username,
                    email: userEmail,
                    role: userRole,
                    plan: req.user?.plan,
                    isAuthenticated: !!userId
                }
            }
        };
    logger.debug('logData', { logData });
        // Add resource ID if available in URL parameters
        if (req.params.id) {
            logData.resourceId = req.params.id;
        }
    logger.debug('logData 107', { logData });
        // Add error details if present
        if (error) {
            logData.metadata.error = {
                message: error.message,
                name: error.name,
                code: error.code,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            };
        }
    logger.debug('logData 117', { logData });
        // Add response data for successful operations (sanitized)
        if (responseData && status === 'SUCCESS') {
            logData.metadata.response = sanitizeResponseData(responseData);
        }
    logger.debug('logData 122', { logData });
        // Add user context if available
        if (userId) {
            logData.metadata.userContext = {
                email: req.user?.email,
                username: req.user?.username,
                role: req.user?.role,
                plan: req.user?.plan
            };
        }
        logger.debug('activity log middleware 131');
        // Save log asynchronously (don't block response)
        createActivityLog(logData).catch(err => {
            logger.error('Failed to log activity', err);
            // Don't throw error to avoid breaking the main request
        });
        
    } catch (logError) {
        logger.error('Error in activity logging middleware', logError);
        // Don't throw error to avoid breaking the main request
    }
};

// Get client IP address (handles proxies)
const getClientIP = (req) => {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           req.headers['x-forwarded-for']?.split(',')[0] ||
           req.headers['x-real-ip'] ||
           'unknown';
};

// Sanitize sensitive data from request body
const sanitizeRequestBody = (body) => {
    if (!body || typeof body !== 'object') return body;
    
    const sanitized = { ...body };
    const sensitiveFields = [
        'password', 'token', 'secret', 'apiKey', 'creditCard', 
        'cardNumber', 'cvv', 'ssn', 'socialSecurityNumber',
        'authorization', 'cookie', 'session'
    ];
    
    sensitiveFields.forEach(field => {
        if (sanitized[field]) {
            sanitized[field] = '[REDACTED]';
        }
    });
    
    // Handle nested objects
    Object.keys(sanitized).forEach(key => {
        if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
            sanitized[key] = sanitizeRequestBody(sanitized[key]);
        }
    });
    
    return sanitized;
};

// Sanitize response data (only log basic info, not full data)
const sanitizeResponseData = (data) => {
    if (!data) return data;
    
    // For security, only log basic response structure, not actual data
    return {
        type: typeof data,
        hasData: !!data,
        isArray: Array.isArray(data),
        dataKeys: typeof data === 'object' && data !== null ? Object.keys(data) : null,
        dataSize: typeof data === 'string' ? data.length : null
    };
};

// Sanitize headers (remove sensitive information)
const sanitizeHeaders = (headers) => {
    if (!headers) return headers;
    
    const sanitized = { ...headers };
    const sensitiveHeaders = [
        'authorization', 'cookie', 'x-api-key', 'x-auth-token',
        'x-csrf-token', 'x-xsrf-token'
    ];
    
    sensitiveHeaders.forEach(header => {
        if (sanitized[header]) {
            sanitized[header] = '[REDACTED]';
        }
    });
    
    return sanitized;
};

// Optional: Middleware for logging unauthenticated activities
export const logPublicActivity = (action, resourceType, description) => {
    return async (req, res, next) => {
        req.startTime = Date.now();
        
        const originalSend = res.send;
        const originalJson = res.json;
        let responseSent = false;
        
        res.send = function(data) {
            if (!responseSent) {
                responseSent = true;
                logActivityData(req, res, action, resourceType, description, 'SUCCESS', data);
            }
            originalSend.call(this, data);
        };
        
        res.json = function(data) {
            if (!responseSent) {
                responseSent = true;
                logActivityData(req, res, action, resourceType, description, 'SUCCESS', data);
            }
            originalJson.call(this, data);
        };
        
        next();
    };
};

// Optional: Middleware for logging admin activities
export const logAdminActivity = (action, resourceType, description) => {
    return async (req, res, next) => {
        // Check if user is admin
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                message: 'Admin access required' 
            });
        }
        
        req.startTime = Date.now();
        
        const originalSend = res.send;
        const originalJson = res.json;
        let responseSent = false;
        
        res.send = function(data) {
            if (!responseSent) {
                responseSent = true;
                logActivityData(req, res, action, resourceType, description, 'SUCCESS', data);
            }
            originalSend.call(this, data);
        };
        
        res.json = function(data) {
            if (!responseSent) {
                responseSent = true;
                logActivityData(req, res, action, resourceType, description, 'SUCCESS', data);
            }
            originalJson.call(this, data);
        };
        
        next();
    };
};

// Re-export ACTIONS for ease of use elsewhere
export { ACTIONS };