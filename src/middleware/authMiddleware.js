import jwt from 'jsonwebtoken';
import moment from 'moment';
import { secretKey, refreshSecretKey, compareHasRole, compareForgetKey } from './../utils/index.js'
import redisClient from "../utils/redisClient.js";
import models from '../models/index.js';
import { getModel } from '../models/registry.js';
import logger from '../utils/logger.js';

export const authenticateToken = async (req, res, next) => {
    // console.log("Authenticating token for request:", req.method, req.originalUrl);
    try {
        // Prefer Authorization header but fall back to cookie jwt (useful for image requests from browser)
        const authHeader = req.header("Authorization");
        let token = null;

        if (authHeader) {
            const [bearer, tkn] = authHeader.split(" ");
            if (bearer === "Bearer" && tkn) token = tkn;
        }

        // fallback to cookie token if header missing
        if (!token && req.cookies && req.cookies.jwt) {
            token = req.cookies.jwt;
        }

        if (!token) {
            return res.status(401).json({ message: "Unauthorized: missing token", statusCode: 401, status: "Unauthorized" });
        }

        // Check if the specific token is blacklisted
        const isBlacklisted = await redisClient.get(token);
        if (isBlacklisted) {
            return res.status(401).json({ message: "Token revoked", statusCode: 401, status: "Unauthorized" });
        }

        // Verify token synchronously to get decoded payload
        let decoded;
        try {
            if (process.env.DEBUG_AUTH === 'true') {
                console.log('[AUTH DEBUG] authenticateToken verifying token (prefix):', token?.slice(0,32) + '...');
            }
            decoded = jwt.verify(token, secretKey);
            if (process.env.DEBUG_AUTH === 'true') {
                try { console.log('[AUTH DEBUG] authenticateToken decoded payload:', JSON.stringify({ id: decoded.id, email: decoded.email, role: decoded.role })); } catch (e) {}
            }
        } catch (verr) {
            if (process.env.DEBUG_AUTH === 'true') console.warn('[AUTH DEBUG] jwt.verify failed in authenticateToken:', verr && verr.message);
            return res.status(403).json({ message: "Forbidden: Invalid token", statusCode: 403, status: "Unauthorized" });
        }

        // Check if user has logged out since this token was issued
        const userId = decoded.id || decoded._id || decoded.userId || decoded.user_id;
        if (userId) {
            const userLogoutTime = await redisClient.get(`user_logout:${userId}`);
            if (userLogoutTime) {
                const logoutTimestamp = parseInt(userLogoutTime);
                const tokenIssuedAt = (decoded.iat || 0) * 1000; // Convert to milliseconds

                // If token was issued before the most recent logout
                if (tokenIssuedAt < logoutTimestamp) {
                    return res.status(401).json({ 
                        message: "Session expired, please login again", 
                        statusCode: 401, 
                        status: "Unauthorized",
                        clearSession: true // Signal to frontend that user needs to re-login
                    });
                }
            }
        }

        // Attach decoded payload and normalized user to request
        req.user = decoded;
        req._decoded_jwt = decoded;
        return next();
    } catch (error) {
        console.error("Authentication error:", error);
        return res.status(401).json({ message: "Invalid Token", statusCode: 401, status: "Unauthorized" });
    }
}

export const checkPlanExpired = async (req, res, next) => {
    try {
        const authHeader = req.header("Authorization");

        const [bearer, token] = authHeader.split(" ");
        const decoded = jwt.verify(token, secretKey);

        if (decoded.plan === "single-plan") {
            const findGeneratedReceipt = await models.ReceiptByUserDB.findOne({ userId: decoded.id });

            if (findGeneratedReceipt) {
                return res.status(403).json({ status: 403, message: "You have reached the limit of your plan. Please upgrade your plan to continue using the app." });
            }
        }

        const hasCompletedSubscription = await models.SubscriptionsDB.findOne({ userId: decoded.id });

        // console.log('hasCompletedSubscription');
        // console.log(hasCompletedSubscription)

        if (hasCompletedSubscription) {
            
            const isPlanExpired = moment().isAfter(moment(hasCompletedSubscription.planEndDate));
            if (isPlanExpired) {
                return res.status(403).json({ status: 403, message: "Your plan has expired. Please make a payment to continue." });
            }
        }
        
        next();
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export const verifyAdmin = async (req, res, next) => {
    // console.log("Verifying admin for request:", req.method, req.originalUrl);
    try {
        const authHeader = req.header("Authorization");

        if (!authHeader)
            return res.status(401).json({ message: "Unauthorized: Missing token", statusCode: 401, status: "Unauthorized" });

        const [bearer, token] = authHeader.split(" ");

        if (bearer !== "Bearer" || !token)
            return res.status(401).json({ message: "Unauthorized: Invalid token format", statusCode: 401, status: "Unauthorized" });

        const isBlacklisted = await redisClient.get(token);
        if (isBlacklisted) {
            return res.status(401).json({ message: "Token revoked", statusCode: 401, status: "Unauthorized" });
        }

        // Verify token
        try {
            // Safely determine cookie vs header token (cookie-parser may not be present)
            const cookieToken = (req.cookies && req.cookies.jwt) ? req.cookies.jwt : null;
            logger.debug('[verifyAdmin] attempting jwt.verify, token source:', cookieToken ? 'cookie' : 'header');
            // Use synchronous verify to get decoded payload
            if (process.env.DEBUG_AUTH === 'true') console.log('[AUTH DEBUG] verifyAdmin verifying token (prefix):', token?.slice(0,32) + '...');
            const decoded = jwt.verify(token, secretKey);
            // attach decoded for later use
            req._decoded_jwt = decoded;
            if (process.env.DEBUG_AUTH === 'true') {
                try { console.log('[AUTH DEBUG] verifyAdmin decoded payload:', JSON.stringify({ id: decoded.id, email: decoded.email, role: decoded.role })); } catch (e) {}
            }
            console.log("Auth check for user role:", decoded.role);

            // Check if user role is "admin" or "clientadmin"
            const userRole = decoded.role?.toLowerCase();
            if (userRole === 'admin' || userRole === 'clientadmin') {
                req.user = decoded; // Store user info in request object
                return next(); // Proceed to the next middleware or route handler
            }

            // If not one of the allowed roles, use the original comparison method as fallback
            const isAdmin = await compareHasRole("sUp&perA#min", decoded.role);
            if (!isAdmin) {
                return res.status(403).json({ message: "Forbidden: Admin access required", statusCode: 401, status: "Unauthorized" });
            }

            req.user = decoded; // Store user info in request object
            next(); // Proceed to the next middleware or route handler
        } catch (verr) {
            logger.warn('[verifyAdmin] jwt.verify failed', { err: verr && verr.message });
            throw verr;
        }

        // Check if user role is "admin" or "clientadmin"
        const userRole = decoded.role?.toLowerCase();
        if (userRole === 'admin' || userRole === 'clientadmin') {
            req.user = decoded; // Store user info in request object
            return next(); // Proceed to the next middleware or route handler
        }

        // If not one of the allowed roles, use the original comparison method as fallback
        const isAdmin = await compareHasRole("sUp&perA#min", decoded.role);
        if (!isAdmin) {
            return res.status(403).json({ message: "Forbidden: Admin access required", statusCode: 401, status: "Unauthorized" });
        }

        req.user = decoded; // Store user info in request object
        next(); // Proceed to the next middleware or route handler
    } catch (error) {
        console.error("Admin authentication error:", error);
        return res.status(401).json({ message: "Invalid Token", statusCode: 401, status: "Unauthorized" });
    }
};

// Allow either super admin or the organization owner (active subscriber)
export const verifyAdminOrOrgAdmin = async (req, res, next) => {
    try {
        const authHeader = req.header("Authorization");
        if (!authHeader)
            return res.status(401).json({ message: "Unauthorized: Missing token", statusCode: 401, status: "Unauthorized" });
        const [bearer, token] = authHeader.split(" ");
        if (bearer !== "Bearer" || !token)
            return res.status(401).json({ message: "Unauthorized: Invalid token format", statusCode: 401, status: "Unauthorized" });

        const isBlacklisted = await redisClient.get(token);
        if (isBlacklisted) {
            return res.status(401).json({ message: "Token revoked", statusCode: 401, status: "Unauthorized" });
        }

        const decoded = jwt.verify(token, secretKey);
        req.user = decoded;

        // Super admin bypass
        const isAdmin = await compareHasRole("sUp&perA#min", decoded.role);
        if (isAdmin) return next();

        // Otherwise require an active subscription (owner is org admin)
        const sub = await models.SubscriptionsDB.findOne({ userId: decoded.id, isActive: true });
        if (!sub) return res.status(403).json({ message: "Forbidden: Admin access required", statusCode: 401, status: "Unauthorized" });
        return next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid Token", statusCode: 401, status: "Unauthorized" });
    }
};

// Generic role guard: allow if decoded.role is in allowed roles
export const verifyRole = (...allowedRoles) => {
    return async (req, res, next) => {
        try {
            const authHeader = req.header("Authorization");
            if (!authHeader)
                return res.status(401).json({ message: "Unauthorized: Missing token", statusCode: 401, status: "Unauthorized" });

            const [bearer, token] = authHeader.split(" ");
            if (bearer !== "Bearer" || !token)
                return res.status(401).json({ message: "Unauthorized: Invalid token format", statusCode: 401, status: "Unauthorized" });

            const isBlacklisted = await redisClient.get(token);
            if (isBlacklisted) {
                return res.status(401).json({ message: "Token revoked", statusCode: 401, status: "Unauthorized" });
            }

            const decoded = jwt.verify(token, secretKey);
            req.user = decoded;

            if (!allowedRoles.includes(decoded.role)) {
                return res.status(403).json({ message: "Forbidden: Insufficient role", statusCode: 403, status: "Unauthorized" });
            }

            next();
        } catch (error) {
            return res.status(401).json({ message: "Invalid Token", statusCode: 401, status: "Unauthorized" });
        }
    };
};

export const verifyForgetToken = async (req, res, next) => {

    try {
        const authHeader = req.header("Authorization");

        if (!authHeader)
            return res.status(401).json({ message: "Unauthorized: Missing token" });

        const [bearer, token] = authHeader.split(" ");

        if (bearer !== "Bearer" || !token)
            return res.status(401).json({ message: "Unauthorized: Invalid token format" });

        const isBlacklisted = await redisClient.get(token);
        if (isBlacklisted) {
            return res.status(401).json({ message: "Token revoked" });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.FORGET_PASSWORD);

        // Check if user role is "admin"
        const isAdmin = await compareForgetKey(process.env.FORGET_PASSWORD_KEY, decoded.plan);


        if (!isAdmin) {
            return res.status(403).json({ message: "Forbidden: Admin access required" });
        }

        req.user = decoded; // Store user info in request object
        next(); // Proceed to the next middleware or route handler
    } catch (error) {

        return res.status(401).json({ message: "Invalid Token" });
    }

}

export const verifyToken = (token) => {
    if (process.env.DEBUG_AUTH === 'true') {
        try { console.log('[AUTH DEBUG] verifyToken verifying token (prefix):', token?.slice(0,32) + '...'); } catch (e) {}
    }
    const decoded = jwt.verify(token, secretKey);
    if (process.env.DEBUG_AUTH === 'true') {
        try { console.log('[AUTH DEBUG] verifyToken decoded payload:', JSON.stringify({ id: decoded.id, email: decoded.email, role: decoded.role })); } catch (e) {}
    }
    return decoded;
}

// Middleware to verify if a user has a valid token AND is a tenant with portal access
export const verifyTenant = async (req, res, next) => {
    try {
        // Safely read cookie (cookie-parser may not be present)
        const cookieToken = (req.cookies && req.cookies.jwt) ? req.cookies.jwt : null;
        const headerToken = req.header('Authorization') ? req.header('Authorization').replace('Bearer ', '') : null;
        const token = cookieToken || headerToken;
        if (!token) {
            return res.status(401).json({ message: "Authentication required", statusCode: 401, status: "Unauthorized" });
        }

        try {
            const decoded = jwt.verify(token, secretKey);
            const userRole = decoded.role?.toLowerCase();

            // Check if user has tenant role and organization has tenant directory enabled
            if (userRole === 'tenant') {
                // Get the organization's plan settings to check if tenant directory is enabled
                const organizationId = decoded.organization_id;
                const PlanSettingsModel = getModel('plan_settings');
                
                // Get the organization's plan
                const orgModel = getModel('organizations');
                const organization = await orgModel.findOne({ _id: organizationId });
                
                if (!organization) {
                    return res.status(403).json({ message: "Organization not found", statusCode: 403, status: "Unauthorized" });
                }
                
                const planSettings = await PlanSettingsModel.findOne({ _id: organization.plan || 'free' });
                
                if (!planSettings || !planSettings.tenantDirectoryEnabled) {
                    return res.status(403).json({ 
                        message: "Tenant portal access is not enabled for this organization", 
                        statusCode: 403, 
                        status: "Unauthorized" 
                    });
                }
                
                // Also verify that this tenant has portal access enabled
                const TenantsModel = getModel('tenants');
                const tenant = await TenantsModel.findOne({ 
                    email: decoded.email,
                    organization_id: organizationId,
                    has_portal_access: true
                });
                
                if (!tenant) {
                    return res.status(403).json({ 
                        message: "Portal access not enabled for this tenant", 
                        statusCode: 403, 
                        status: "Unauthorized" 
                    });
                }
                
                // prefer decoded from req._decoded_jwt if present
                req.user = req._decoded_jwt || decoded;
                req.tenant = tenant;
                return next();
            }
            
            // If the user is an admin, they can also access tenant routes
            if (userRole === 'admin' || userRole === 'clientadmin') {
                req.user = decoded;
                return next();
            }
            
            return res.status(403).json({ 
                message: "Forbidden: Tenant access required", 
                statusCode: 403, 
                status: "Unauthorized" 
            });
        } catch (error) {
            console.error("Tenant authentication error:", error);
            return res.status(401).json({ 
                message: "Authentication token expired or invalid", 
                statusCode: 401, 
                status: "Unauthorized" 
            });
        }
    } catch (error) {
        console.error("Tenant verification error:", error);
        res.status(500).json({ 
            message: "Server error during tenant verification", 
            statusCode: 500, 
            status: "Error" 
        });
    }
};

export const verifyRefreshToken = (token) => {
    if (process.env.DEBUG_AUTH === 'true') {
        try { console.log('[AUTH DEBUG] verifyRefreshToken verifying token (prefix):', token?.slice(0,32) + '...'); } catch (e) {}
    }
    const decoded = jwt.verify(token, refreshSecretKey);
    if (process.env.DEBUG_AUTH === 'true') {
        try { console.log('[AUTH DEBUG] verifyRefreshToken decoded payload:', JSON.stringify({ id: decoded.id, email: decoded.email, role: decoded.role })); } catch (e) {}
    }
    return decoded;
}

export const extractForgetToken = (token) => {
    return jwt.verify(token, process.env.FORGET_PASSWORD)
}