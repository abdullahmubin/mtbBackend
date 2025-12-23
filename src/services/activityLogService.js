import mongoose from 'mongoose';
import ActivityLogDB from '../models/activityLog.js';
import logger from '../utils/logger.js';

// ✅ Enhanced user activity logs with filters
export const getUserActivityLogs = async (userId, page = 1, limit = 20, filters = {}) => {
    try {
        // ✅ ADD: Validate userId format
        if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
            throw new Error('Invalid user ID format');
        }

        const skip = (page - 1) * limit;
        const query = { userId };
        
        // Apply filters
        if (filters.action) query.action = filters.action;
        if (filters.startDate) query.createdAt = { $gte: new Date(filters.startDate) };
        if (filters.endDate) {
            query.createdAt = { 
                ...query.createdAt, 
                $lte: new Date(filters.endDate) 
            };
        }
        
        const logs = await ActivityLogDB.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'firstName lastName email username');
        
        const total = await ActivityLogDB.countDocuments(query);
        
        return {
            logs,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: limit
            }
        };
    } catch (error) {
        logger.error('Error fetching user activity logs', error);
        throw error;
    }
};

// ✅ FIXED: Enhanced system activity logs with more filters
export const getSystemActivityLogs = async (query = {}, page = 1, limit = 50) => {
    try {
        const skip = (page - 1) * limit;
        
    // ✅ FIXED: Use the query directly (no need to reconstruct)
    logger.debug('MongoDB Query', { query: JSON.stringify(query, null, 2) });
    logger.debug('Pagination', { skip, limit });

        const logs = await ActivityLogDB.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'firstName lastName email username');
        
        const total = await ActivityLogDB.countDocuments(query);
        
    logger.info('Found logs', { found: logs.length, total });
        
        // ✅ ADD: Log sample data for debugging
        if (logs.length > 0) {
            logger.debug('Sample Log', {
                id: logs[0]._id,
                action: logs[0].action,
                username: logs[0].username,
                description: logs[0].description,
                createdAt: logs[0].createdAt
            });
        }
        
        return {
            logs,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: limit
            }
        };
    } catch (error) {
        logger.error('Error fetching system activity logs', error);
        throw error;
    }
};

// ✅ Get activity statistics
export const getActivityStatistics = async (startDate, endDate) => {
    try {
        const query = {};
        if (startDate) query.createdAt = { $gte: new Date(startDate) };
        if (endDate) {
            query.createdAt = { 
                ...query.createdAt, 
                $lte: new Date(endDate) 
            };
        }
        
        const [
            totalActivities,
            uniqueUsers,
            actionBreakdown,
            statusBreakdown,
            dailyActivity
        ] = await Promise.all([
            ActivityLogDB.countDocuments(query),
            ActivityLogDB.distinct('username', query),
            ActivityLogDB.aggregate([
                { $match: query },
                { $group: { _id: '$action', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            ActivityLogDB.aggregate([
                { $match: query },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            ActivityLogDB.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: -1 } },
                { $limit: 30 }
            ])
        ]);
        
        return {
            totalActivities,
            uniqueUsers: uniqueUsers.length,
            actionBreakdown,
            statusBreakdown,
            dailyActivity,
            timeRange: {
                startDate: startDate || null,
                endDate: endDate || null
            }
        };
    } catch (error) {
        logger.error('Error fetching activity statistics', error);
        throw error;
    }
};

// Keep existing functions
export const getUserActivities = async (username, limit = 50) => {
    return await ActivityLogDB.find({ username })
        .sort({ createdAt: -1 })
        .limit(limit);
};

export const getUserActivitiesByAction = async (username, action) => {
    return await ActivityLogDB.find({ username, action })
        .sort({ createdAt: -1 });
};

export const getRecentActivities = async (limit = 20) => {
    return await ActivityLogDB.find({})
        .select('username action description status createdAt')
        .sort({ createdAt: -1 })
        .limit(limit);
};

export const createActivityLog = async (logData) => {
    try {
        logger.debug('logData', logData);
        const activityLog = new ActivityLogDB(logData);
        logger.debug('activityLog created', { id: activityLog._id });
        await activityLog.save();
        return activityLog;
    } catch (error) {
        logger.error('Error creating activity log', error);
        throw error;
    }
};

// Stream activity logs as CSV using a Mongoose cursor
export const streamActivityLogsAsCsv = (query = {}) => {
    // Create a query cursor ordered by createdAt desc
    const cursor = ActivityLogDB.find(query).sort({ createdAt: -1 }).cursor();
    return cursor;
};