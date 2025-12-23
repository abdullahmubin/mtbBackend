import express from 'express';
import mongoose from 'mongoose';
import { 
    getUserActivityLogs, 
    getSystemActivityLogs, 
    getUserActivities,
    getUserActivitiesByAction,
    getRecentActivities,
    createActivityLog,
    getActivityStatistics
    , streamActivityLogsAsCsv
} from '../services/activityLogService.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { wrappSuccessResult } from '../utils/index.js';

const router = express.Router();

// ✅ Get user's own activity logs (by userId from JWT)
const getUserLogsHandler = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, action, startDate, endDate } = req.query;
        const userId = req.user.id; // ✅ Use req.user.id (from JWT payload)
        
        const filters = { action, startDate, endDate };
        const result = await getUserActivityLogs(userId, parseInt(page), parseInt(limit), filters);
        
        res.status(200).send(wrappSuccessResult(200, result));
    } catch (error) {
        return next(error, req, res);
    }
};

// ✅ Get system-wide activity logs (admin only)
// ✅ FIXED: Get system-wide activity logs (admin only)
const getSystemLogsHandler = async (req, res, next) => {
    try {
        const { 
            page = 1, 
            limit = 50, 
            action, 
            resourceType, 
            status, 
            startDate, 
            endDate,
            username,
            userId,
            search // ✅ ADD search parameter
        } = req.query;
        
        // ✅ FIXED: Build query object directly
        const query = {};
        
        // ✅ FIXED: Handle "all" values - only add to query if not "all"
        if (action && action !== 'all') query.action = action;
        if (resourceType && resourceType !== 'all') query.resourceType = resourceType;
        if (status && status !== 'all') query.status = status;
        
        // ✅ FIXED: Handle search parameter
        if (search && search.trim() !== '') {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { action: { $regex: search, $options: 'i' } },
                { resourceType: { $regex: search, $options: 'i' } }
            ];
        } else if (username && username !== 'all') {
            // ✅ FIXED: Only add username filter if not searching and username is not "all"
            query.username = { $regex: username, $options: 'i' };
        }
        
        // ✅ FIXED: Handle userId properly
        if (userId && userId !== 'all') {
            if (mongoose.Types.ObjectId.isValid(userId)) {
                query.userId = userId;
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid user ID format'
                });
            }
        }
        
        // ✅ FIXED: Handle date filtering properly
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) {
                query.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                query.createdAt.$lte = new Date(endDate);
            }
        }
        
        console.log('🔍 System Logs Query:', JSON.stringify(query, null, 2));
        console.log('📄 Page:', page, 'Limit:', limit);
        console.log('�� Filters Applied:', {
            action: action === 'all' ? 'ALL' : action,
            resourceType: resourceType === 'all' ? 'ALL' : resourceType,
            status: status === 'all' ? 'ALL' : status,
            search: search || 'NONE',
            username: username === 'all' ? 'ALL' : username
        });
        
        // ✅ FIXED: Pass query directly instead of filters object
        const result = await getSystemActivityLogs(query, parseInt(page), parseInt(limit));
        
        console.log('✅ System Logs Result:', {
            totalLogs: result.logs.length,
            totalItems: result.pagination.totalItems,
            currentPage: result.pagination.currentPage,
            totalPages: result.pagination.totalPages
        });
        
        res.status(200).send(wrappSuccessResult(200, result));
    } catch (error) {
        console.error('❌ System Logs Error:', error);
        return next(error, req, res);
    }
};

// ✅ Get activities by username (admin only)
const getActivitiesByUsernameHandler = async (req, res, next) => {
    try {
        const { username } = req.params;
        const { action, limit = 50 } = req.query;
        
        let result;
        if (action) {
            result = await getUserActivitiesByAction(username, action);
        } else {
            result = await getUserActivities(username, parseInt(limit));
        }
        
        res.status(200).send(wrappSuccessResult(200, {
            username,
            activities: result,
            count: result.length
        }));
    } catch (error) {
        return next(error, req, res);
    }
};

// ✅ Get recent activities dashboard (admin only)
const getRecentActivitiesHandler = async (req, res, next) => {
    try {
        const { limit = 20 } = req.query;
        const activities = await getRecentActivities(parseInt(limit));
        
        // Calculate summary statistics
        const uniqueUsers = [...new Set(activities.map(a => a.username))];
        const actionCounts = activities.reduce((acc, activity) => {
            acc[activity.action] = (acc[activity.action] || 0) + 1;
            return acc;
        }, {});
        
        const result = {
            activities,
            summary: {
                totalActivities: activities.length,
                uniqueUsers: uniqueUsers.length,
                actionBreakdown: actionCounts,
                timeRange: {
                    oldest: activities[activities.length - 1]?.createdAt,
                    newest: activities[0]?.createdAt
                }
            }
        };
        
        res.status(200).send(wrappSuccessResult(200, result));
    } catch (error) {
        return next(error, req, res);
    }
};

// ✅ Get activity statistics (admin only)
const getActivityStatsHandler = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        
        const stats = await getActivityStatistics(startDate, endDate);
        res.status(200).send(wrappSuccessResult(200, stats));
    } catch (error) {
        return next(error, req, res);
    }
};

// ✅ Manual activity log creation (for special cases)
const createManualActivityLogHandler = async (req, res, next) => {
    try {
        const { action, resourceType, description, metadata } = req.body;
        const userId = req.user.id;
        const username = req.user.username;
        
        const logData = {
            userId,
            username,
            action,
            resourceType,
            description,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            status: 'SUCCESS',
            metadata: {
                ...metadata,
                method: req.method,
                url: req.originalUrl,
                isManualLog: true
            }
        };
        
        const result = await createActivityLog(logData);
        res.status(201).send(wrappSuccessResult(201, result));
    } catch (error) {
        return next(error, req, res);
    }
};

// ✅ Admin middleware for protected routes
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Admin access required',
            statusCode: 403
        });
    }
    next();
};

// Routes
// GET  /api/activity-logs/user-logs          # User's own logs
// GET  /api/activity-logs/system-logs        # Admin: all system logs
// GET  /api/activity-logs/user/:username     # Admin: specific user logs
// GET  /api/activity-logs/recent             # Admin: recent activities
// GET  /api/activity-logs/stats              # Admin: statistics
// POST /api/activity-logs/manual             # Admin: manual logging
router.get('/user-logs', authenticateToken, getUserLogsHandler);
router.get('/system-logs', authenticateToken, getSystemLogsHandler);
router.get('/user/:username', authenticateToken, requireAdmin, getActivitiesByUsernameHandler);
router.get('/recent', authenticateToken, requireAdmin, getRecentActivitiesHandler);
router.get('/stats', authenticateToken, requireAdmin, getActivityStatsHandler);
// Export CSV for arbitrary query (admin)
const exportCsvHandler = async (req, res, next) => {
    try {
        // reuse query building logic from getSystemLogsHandler
        const { action, resourceType, status, startDate, endDate, username, search, userId } = req.query;
        const query = {};
        if (action && action !== 'all') query.action = action;
        if (resourceType && resourceType !== 'all') query.resourceType = resourceType;
        if (status && status !== 'all') query.status = status;
        if (search && search.trim() !== '') {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { action: { $regex: search, $options: 'i' } },
                { resourceType: { $regex: search, $options: 'i' } }
            ];
        } else if (username && username !== 'all') {
            query.username = { $regex: username, $options: 'i' };
        }
        if (userId && userId !== 'all') query.userId = userId;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        // set headers for CSV download
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        const filename = `activity-logs-export-${Date.now()}.csv`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // write CSV header
        res.write('createdAt,username,action,resourceType,resourceId,description,status,ipAddress,userAgent,metadata\n');

        const cursor = streamActivityLogsAsCsv(query);
        for await (const doc of cursor) {
            const row = [
                doc.createdAt ? doc.createdAt.toISOString() : '',
                escapeCsv(doc.username || ''),
                escapeCsv(doc.action || ''),
                escapeCsv(doc.resourceType || ''),
                escapeCsv(doc.resourceId || ''),
                escapeCsv(doc.description || ''),
                escapeCsv(doc.status || ''),
                escapeCsv(doc.ipAddress || ''),
                escapeCsv(doc.userAgent || ''),
                escapeCsv(JSON.stringify(doc.metadata || {}))
            ].join(',') + '\n';
            // if client aborted, stop
            if (res.writableEnded) break;
            const ok = res.write(row);
            if (!ok) await new Promise(r => res.once('drain', r));
        }

        res.end();
    } catch (error) {
        return next(error, req, res);
    }
};

// simple CSV escaping
const escapeCsv = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
};

router.get('/export', authenticateToken, requireAdmin, exportCsvHandler);
router.post('/manual', authenticateToken, requireAdmin, createManualActivityLogHandler);

const configure = (app) => {
    app.use('/api/activity-logs', router);
};

export default configure;