import express from 'express';
import { uploadFile, wrappSuccessResult, processPagination } from '../utils/index.js'
import { deleteById, getAll, getById, getFilterBy, save, update } from '../services/receiptByUserService.js';
import { authenticateToken, verifyAdmin, checkPlanExpired } from '../middleware/authMiddleware.js';
import models from '../models/index.js';
import mongoose from 'mongoose';
import redisClient from '../utils/redisClient.js';
import logger from '../utils/logger.js';

const router = express.Router();

const getHandler = async (req, res) => {

    try {
        const { startDate, endDate } = req.query;
    
        const dateFilter = {};
        if (startDate && endDate) {
          dateFilter.$gte = new Date(startDate);
          dateFilter.$lte = new Date(endDate);
        }
    
        const userDateFilter = startDate && endDate ? { createdAt: dateFilter } : {};
        const subDateFilter = startDate && endDate ? { startDate: dateFilter } : {};
        const receiptDateFilter = startDate && endDate ? { createdAt: dateFilter } : {};
    
        const customers = await models.UserDB.countDocuments(userDateFilter);
        const activeSubs = await models.SubscriptionsDB.countDocuments({ cus_pdl_status: 'completed', ...subDateFilter });
        const canceledSubs = await models.SubscriptionsDB.countDocuments({ cus_pdl_status: 'canceled', ...subDateFilter });
        const pausedSubs = await models.SubscriptionsDB.countDocuments({ cus_pdl_status: 'paused', ...subDateFilter });
        const past_dueSubs = await models.SubscriptionsDB.countDocuments({ cus_pdl_status: 'past_due', ...subDateFilter });
        const activeSubsCount = activeSubs + pausedSubs + past_dueSubs;
        const deletedAccounts = await models.UserDB.countDocuments({ isDeleted: true, ...userDateFilter });
        const netGrowth = customers - deletedAccounts;
        const momChange = 4.2;
        const totalSubs = await models.SubscriptionsDB.countDocuments(subDateFilter);
        const churnRate = totalSubs ? ((canceledSubs / totalSubs) * 100).toFixed(1) : 0;
        const deletedPercentage = customers ? ((deletedAccounts / customers) * 100).toFixed(1) : 0;
    
        // Receipt count by category
        const receiptData = await models.ReceiptByUserDB.aggregate([
          { $match: receiptDateFilter },
          {
            $group: {
              _id: '$category',
              receipts: { $sum: 1 }
            }
          },
          {
            $project: {
              category: '$_id',
              receipts: 1,
              _id: 0
            }
          }
        ]);
    
        // Receipt list by category
        const categories = await models.ReceiptByUserDB.distinct('receiptCategoryId', receiptDateFilter);
    
        const receiptListByCategory = await Promise.all(
          categories.map(async (category) => {
            const receipts = await models.ReceiptByUserDB.find({ category, ...receiptDateFilter });
            return {
              category,
              receipts
            };
          })
        );
    
        const tableData = await models.UserDB.find(userDateFilter)
          .limit(10)
        //   .select('name email createdAt');
    
        res.json({
          customers,
          activeSubs,
          pausedSubs,
          past_dueSubs,
          activeSubsCount,
          canceledSubs,
          deletedAccounts,
          netGrowth,
          momChange,
          churnRate: parseFloat(churnRate),
          deletedPercentage: parseFloat(deletedPercentage),
          receiptData,
          receiptListByCategory,
          tableData
        });
      } catch (err) {
        logger.error('Error fetching dashboard data', err);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
      }

}

const getSummariesHandler = async (req, res) => {

    try {
        const { startDate, endDate } = req.query;
    
        const dateFilter = {};
        if (startDate && endDate) {
          dateFilter.$gte = new Date(startDate);
          dateFilter.$lte = new Date(endDate);
        }
    
        const userDateFilter = startDate && endDate ? { createdAt: dateFilter } : {};
        const subDateFilter = startDate && endDate ? { startDate: dateFilter } : {};
        const receiptDateFilter = startDate && endDate ? { createdAt: dateFilter } : {};
    
        const customers = await models.UserDB.countDocuments(userDateFilter);
        const activeSubs = await models.SubscriptionsDB.countDocuments({ cus_pdl_status: 'completed', ...subDateFilter });
        const canceledSubs = await models.SubscriptionsDB.countDocuments({ cus_pdl_status: 'canceled', ...subDateFilter });
        const pausedSubs = await models.SubscriptionsDB.countDocuments({ cus_pdl_status: 'paused', ...subDateFilter });
        const past_dueSubs = await models.SubscriptionsDB.countDocuments({ cus_pdl_status: 'past_due', ...subDateFilter });
        const activeSubsCount = activeSubs + pausedSubs + past_dueSubs;
        const deletedAccounts = await models.UserDB.countDocuments({ isDeleted: true, ...userDateFilter });
        const netGrowth = customers - deletedAccounts;
        const momChange = 4.2;
        const totalSubs = await models.SubscriptionsDB.countDocuments(subDateFilter);
        const churnRate = totalSubs ? ((canceledSubs / totalSubs) * 100).toFixed(1) : 0;
        const deletedPercentage = customers ? ((deletedAccounts / customers) * 100).toFixed(1) : 0;
    
        
        res.status(200).send(wrappSuccessResult(200, {
          customers,
          activeSubs,
          pausedSubs,
          past_dueSubs,
          activeSubsCount,
          canceledSubs,
          deletedAccounts,
          netGrowth,
          momChange,
          churnRate: parseFloat(churnRate),
          deletedPercentage: parseFloat(deletedPercentage)
         
          
        }));
        
      } catch (err) {
        logger.error('Error fetching dashboard data', err);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
      }

}

const getCategoryDataHandler = async (req, res) => {

    try {
        const { startDate, endDate } = req.query;
    
        const dateFilter = {};
        if (startDate && endDate) {
          dateFilter.$gte = new Date(startDate);
          dateFilter.$lte = new Date(endDate);
        }
    
        const userDateFilter = startDate && endDate ? { createdAt: dateFilter } : {};
        const subDateFilter = startDate && endDate ? { startDate: dateFilter } : {};
        const receiptDateFilter = startDate && endDate ? { createdAt: dateFilter } : {};
    
        // Receipt count by category
        const receiptData = await models.ReceiptByUserDB.aggregate([
          { $match: receiptDateFilter },
          {
            $group: {
              _id: '$category',
              receipts: { $sum: 1 }
            }
          },
          {
            $project: {
              category: '$_id',
              receipts: 1,
              _id: 0
            }
          }
        ]);
    
        // Receipt list by category
        const categories = await models.ReceiptByUserDB.distinct('receiptCategoryId', receiptDateFilter);
    
        const receiptListByCategory = await Promise.all(
          categories.map(async (category) => {
            const receipts = await models.ReceiptByUserDB.find({ category, ...receiptDateFilter });
            return {
              category,
              receipts
            };
          })
        );
    
    
        res.json({
          receiptData,
          receiptListByCategory
        });
      } catch (err) {
        logger.error('Error fetching dashboard data', err);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
      }

}

// const getDataTableHandler = async (req, res) => {

//     try {
//         const { startDate, endDate } = req.query;
    
//         const dateFilter = {};
//         if (startDate && endDate) {
//           dateFilter.$gte = new Date(startDate);
//           dateFilter.$lte = new Date(endDate);
//         }
    
//         const userDateFilter = startDate && endDate ? { createdAt: dateFilter } : {};
//         const subDateFilter = startDate && endDate ? { startDate: dateFilter } : {};
//         const receiptDateFilter = startDate && endDate ? { createdAt: dateFilter } : {};
    
//         const tableData = await models.UserDB.find(userDateFilter)
//           .limit(10)
//         //   .select('name email createdAt');
    
//         res.json({
//           tableData
//         });
//       } catch (err) {
//         console.error('Error fetching dashboard data:', err);
//         res.status(500).json({ error: 'Failed to fetch dashboard data' });
//       }

// }

// ✅ TABLE DATA - Standardized response
// src/controllers/dashboardController.js - COMPLETE TABLE HANDLER

const getDataTableHandler = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      userName = '',
      email = '',
      plan = '', // ✅ ADD THIS
      paddleStatus = '', // ✅ ADD THIS TOO
      startDate = '',
      endDate = '',
      sortField = 'createdAt',
      sortOrder = 'descend'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build match conditions for users
    const userMatchStage = {};
    
    if (userName) {
      userMatchStage.userName = { $regex: userName, $options: 'i' };
    }
    
    if (email) {
      userMatchStage.email = { $regex: email, $options: 'i' };
    }

    // Build aggregation pipeline
    const pipeline = [
      { $match: userMatchStage },
      {
        $lookup: {
          from: 'subscriptions',
          let: { userId: { $toString: '$_id' } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$userId', '$$userId'] }
              }
            }
          ],
          as: 'subscription'
        }
      },
      {
        $unwind: {
          path: '$subscription',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'receiptbyusers',
          let: { userId: { $toString: '$_id' } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$userId', '$$userId'] }
              }
            }
          ],
          as: 'receipts'
        }
      },
      {
        $addFields: {
          receiptCount: { $size: '$receipts' }
        }
      }
    ];

    // ✅ ADD SUBSCRIPTION FILTERS AFTER LOOKUP
    const subscriptionFilters = {};
    
    // Plan filter
    if (plan) {
      subscriptionFilters['subscription.plan'] = { $regex: plan, $options: 'i' };
    }
    
    // Paddle Status filter
    if (paddleStatus) {
      subscriptionFilters['subscription.cus_pdl_status'] = { $regex: paddleStatus, $options: 'i' };
    }
    
    // Date filtering for subscription dates
    if (startDate && endDate) {
      subscriptionFilters['subscription.planStartDate'] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    // Apply subscription filters if any exist
    if (Object.keys(subscriptionFilters).length > 0) {
      pipeline.push({
        $match: subscriptionFilters
      });
    }

    // Project fields
    pipeline.push({
      $project: {
        userName: 1,
        email: 1,
        createdAt: 1,
        isDeleted: 1,
        receiptCount: 1,
        'subscription.plan': 1,
        'subscription.planStartDate': 1,
        'subscription.planEndDate': 1,
        'subscription.isActive': 1,
        'subscription.cus_pdl_status': 1,
        'subscription.customer_id': 1,
        'subscription.sub_pdl_id': 1
      }
    });

    // Add sorting
    const mongoSortOrder = sortOrder === 'ascend' ? 1 : -1;
    pipeline.push({
      $sort: { [sortField]: mongoSortOrder }
    });

    // Count pipeline for total records (before pagination)
    const countPipeline = [...pipeline];
    countPipeline.push({ $count: "total" });

    // Add pagination to main pipeline
    pipeline.push(
      { $skip: skip },
      { $limit: parseInt(limit) }
    );

    // Execute aggregation and count
    const [tableData, countResult] = await Promise.all([
      models.UserDB.aggregate(pipeline),
      models.UserDB.aggregate(countPipeline)
    ]);

    const totalCount = countResult[0]?.total || 0;

    const paginatedData = {
      users: tableData,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        hasNextPage: skip + parseInt(limit) < totalCount,
        hasPrevPage: parseInt(page) > 1,
        limit: parseInt(limit)
      },
      filters: {
        userName: userName || null,
        email: email || null,
        plan: plan || null, // ✅ ADD THIS
        paddleStatus: paddleStatus || null, // ✅ ADD THIS
        sortField,
        sortOrder
      },
      dateRange: {
        startDate: startDate || null,
        endDate: endDate || null,
        isFiltered: !!(startDate && endDate)
      },
      generatedAt: new Date().toISOString()
    };

    // ✅ STANDARDIZED RESPONSE
    res.status(200).send(wrappSuccessResult(200, paginatedData, "User table data retrieved successfully"));

  } catch (error) {
    logger.error('❌ Table data error', error);
    
    // ✅ STANDARDIZED ERROR RESPONSE
    res.status(500).send({
      status: "Error",
      statusCode: 500,
      message: "Failed to fetch table data",
      data: null,
      error: {
        details: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
};
// ✅ High-Performance Dashboard Stats Handler
export const getDashboardStatsHandler = async (req, res) => {
  try {
      const { startDate, endDate, useCache = true } = req.query;
      
      const cacheKey = `dashboard:stats:${startDate || 'all'}:${endDate || 'all'}`;
      
      // Try cache first
      if (useCache && redisClient.isReady) {
          try {
              const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
          logger.info('📊 Dashboard data served from cache');
          const parsedData = JSON.parse(cachedData);
                  
                  // ✅ Return cached data in standardized format
                  return res.status(200).send(wrappSuccessResult(200, {
                      ...parsedData,
                      cached: true,
                      performance: {
                          ...parsedData.performance,
                          servedFromCache: true,
                          cacheTimestamp: new Date().toISOString()
                      }
                  }));
              }
          } catch (cacheError) {
              console.warn('Cache read failed:', cacheError.message);
          }
      }

      const dateFilter = buildDateFilter(startDate, endDate);
      
  console.time('Dashboard Query Execution');
      
      // Separate optimized queries
      const [userStats, subscriptionStats] = await Promise.all([
          models.UserDB.aggregate([
              { $match: dateFilter.user },
              {
                  $group: {
                      _id: null,
                      totalCustomers: { $sum: 1 },
                      deletedAccounts: {
                          $sum: { $cond: [{ $eq: ["$isDeleted", true] }, 1, 0] }
                      },
                      activeCustomers: {
                          $sum: { $cond: [{ $eq: ["$isDeleted", false] }, 1, 0] }
                      }
                  }
              }
          ]),
          
          models.SubscriptionsDB.aggregate([
              { $match: dateFilter.subscription },
              {
                  $group: {
                      _id: null,
                      totalSubscriptions: { $sum: 1 },
                      activeSubscriptions: {
                          $sum: {
                              $cond: [
                                  { $in: ['$cus_pdl_status', ['completed', 'active']] }, 1, 0
                              ]
                          }
                      },
                      canceledSubscriptions: {
                          $sum: {
                              $cond: [
                                  { $eq: ['$cus_pdl_status', 'canceled'] }, 1, 0
                              ]
                          }
                      },
                      pausedSubscriptions: {
                          $sum: {
                              $cond: [
                                  { $eq: ['$cus_pdl_status', 'paused'] }, 1, 0
                              ]
                          }
                      },
                      pastDueSubscriptions: {
                          $sum: {
                              $cond: [
                                  { $eq: ['$cus_pdl_status', 'past_due'] }, 1, 0
                              ]
                          }
                      }
                  }
              }
          ])
      ]);

  console.timeEnd('Dashboard Query Execution');

      const processedUserStats = userStats[0] || {
          totalCustomers: 0,
          deletedAccounts: 0,
          activeCustomers: 0
      };

      const processedSubscriptionStats = subscriptionStats[0] || {
          totalSubscriptions: 0,
          activeSubscriptions: 0,
          canceledSubscriptions: 0,
          pausedSubscriptions: 0,
          pastDueSubscriptions: 0
      };

      const totalCustomers = processedUserStats.totalCustomers;
      const totalSubscriptions = processedSubscriptionStats.totalSubscriptions;
      const deletedAccounts = processedUserStats.deletedAccounts;

      const dashboardData = {
          totalCustomers,
          activeSubscriptions: processedSubscriptionStats.activeSubscriptions,
          canceledSubscriptions: processedSubscriptionStats.canceledSubscriptions,
          deletedAccounts,
          netGrowth: totalCustomers - deletedAccounts,
          pausedSubscriptions: processedSubscriptionStats.pausedSubscriptions,
          pastDueSubscriptions: processedSubscriptionStats.pastDueSubscriptions,
          totalSubscriptions,
          churnRate: totalSubscriptions > 0 
              ? ((processedSubscriptionStats.canceledSubscriptions / totalSubscriptions) * 100).toFixed(2)
              : "0.00",
          deletionRate: totalCustomers > 0 
              ? ((deletedAccounts / totalCustomers) * 100).toFixed(2)
              : "0.00",
          subscriptionRate: totalCustomers > 0 
              ? ((totalSubscriptions / totalCustomers) * 100).toFixed(2)
              : "0.00",
          dateRange: {
              startDate: startDate || null,
              endDate: endDate || null,
              isFiltered: !!(startDate && endDate)
          },
          performance: {
              cached: false,
              generatedAt: new Date().toISOString()
          }
      };

      // Cache the results
      if (useCache && redisClient.isReady) {
      try {
        await redisClient.setEx(cacheKey, 300, JSON.stringify(dashboardData));
        logger.info('📊 Dashboard data cached successfully');
      } catch (cacheError) {
        logger.warn('Cache write failed:', { message: cacheError.message });
      }
      }

      // ✅ STANDARDIZED RESPONSE
      res.status(200).send(wrappSuccessResult(200, dashboardData, "Dashboard statistics retrieved successfully"));

  } catch (error) {
      console.error('❌ Dashboard stats error:', error);
      
      // ✅ STANDARDIZED ERROR RESPONSE
      res.status(500).send({
          status: "Error",
          statusCode: 500,
          message: "Failed to fetch dashboard data",
          data: null,
          error: {
              details: error.message,
              timestamp: new Date().toISOString()
          }
      });
  }
};

// ✅ Optimized Real-time Stats (for live updates)
const getRealTimeStatsHandler = async (req, res) => {
  try {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const realTimeStats = await Promise.all([
          models.UserDB.countDocuments({ 
              createdAt: { $gte: last24Hours },
              isDeleted: false 
          }),
          models.SubscriptionsDB.countDocuments({ 
              createdAt: { $gte: last24Hours },
              cus_pdl_status: { $in: ['completed', 'active'] }
          }),
          models.SubscriptionsDB.countDocuments({ 
              updatedAt: { $gte: last24Hours },
              cus_pdl_status: 'canceled'
          })
      ]);

      const realTimeData = {
          newCustomersLast24h: realTimeStats[0],
          newSubscriptionsLast24h: realTimeStats[1],
          cancellationsLast24h: realTimeStats[2],
          timeframe: "Last 24 hours",
          generatedAt: new Date().toISOString()
      };

      // ✅ STANDARDIZED RESPONSE
      res.status(200).send(wrappSuccessResult(200, realTimeData, "Real-time statistics retrieved successfully"));

  } catch (error) {
      console.error('❌ Real-time stats error:', error);
      
      // ✅ STANDARDIZED ERROR RESPONSE
      res.status(500).send({
          status: "Error",
          statusCode: 500,
          message: "Failed to fetch real-time data",
          data: null,
          error: {
              details: error.message,
              timestamp: new Date().toISOString()
          }
      });
  }
};

// ✅ Performance optimized trends (for charts)
const getTrendsHandler = async (req, res) => {
  try {
      const { period = '30d' } = req.query;
      
      const dateRange = getPeriodDateRange(period);
      
      const trends = await models.UserDB.aggregate([
          {
              $match: { 
                  createdAt: { $gte: dateRange.start, $lte: dateRange.end } 
              }
          },
          {
              $group: {
                  _id: {
                      year: { $year: '$createdAt' },
                      month: { $month: '$createdAt' },
                      day: { $dayOfMonth: '$createdAt' }
                  },
                  newCustomers: { $sum: 1 },
                  deletions: {
                      $sum: { $cond: [{ $eq: ['$isDeleted', true] }, 1, 0] }
                  }
              }
          },
          {
              $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
          },
          {
              $project: {
                  date: {
                      $dateFromParts: {
                          year: '$_id.year',
                          month: '$_id.month',
                          day: '$_id.day'
                      }
                  },
                  newCustomers: 1,
                  deletions: 1,
                  netGrowth: { $subtract: ['$newCustomers', '$deletions'] }
              }
          }
      ]);

      const trendsData = {
          period,
          dateRange: {
              start: dateRange.start.toISOString(),
              end: dateRange.end.toISOString()
          },
          trends,
          summary: {
              totalDays: trends.length,
              avgDailyGrowth: trends.length > 0 
                  ? (trends.reduce((sum, day) => sum + day.netGrowth, 0) / trends.length).toFixed(2)
                  : 0,
              totalNewCustomers: trends.reduce((sum, day) => sum + day.newCustomers, 0),
              totalDeletions: trends.reduce((sum, day) => sum + day.deletions, 0)
          },
          generatedAt: new Date().toISOString()
      };

      // ✅ STANDARDIZED RESPONSE
      res.status(200).send(wrappSuccessResult(200, trendsData, `Trend data for ${period} retrieved successfully`));

  } catch (error) {
      console.error('❌ Trends error:', error);
      
      // ✅ STANDARDIZED ERROR RESPONSE
      res.status(500).send({
          status: "Error",
          statusCode: 500,
          message: "Failed to fetch trends data",
          data: null,
          error: {
              details: error.message,
              timestamp: new Date().toISOString()
          }
      });
  }
};


// ✅ USER STATS - Standardized response
const getUserStatsHandler = async (req, res) => {
  try {
      const userId = req.params.userId;

      const userData = await models.UserDB.aggregate([
          {
              $match: {
                  _id: new mongoose.Types.ObjectId(userId)
              }
          },
          {
              $lookup: {
                  from: 'subscriptions',
                  let: { userId: { $toString: '$_id' } },
                  pipeline: [
                      {
                          $match: {
                              $expr: { $eq: ['$userId', '$$userId'] }
                          }
                      }
                  ],
                  as: 'subscription'
              }
          },
          {
              $unwind: {
                  path: '$subscription',
                  preserveNullAndEmptyArrays: true
              }
          },
          {
              $lookup: {
                  from: 'receiptbyusers',
                  let: { userId: { $toString: '$_id' } },
                  pipeline: [
                      {
                          $match: {
                              $expr: { $eq: ['$userId', '$$userId'] }
                          }
                      }
                  ],
                  as: 'receipts'
              }
          },
          {
              $addFields: {
                  receiptCount: { $size: '$receipts' }
              }
          },
          {
              $project: {
                  userName: 1,
                  email: 1,
                  receiptCount: 1,
                  receipts: 1,
                  'subscription.plan': 1,
                  'subscription.planStartDate': 1,
                  'subscription.planEndDate': 1,
                  'subscription.isActive': 1,
                  'subscription.cus_pdl_status': 1,
                  'subscription.customer_id': 1,
                  'subscription.sub_pdl_id': 1
              }
          }
      ]);

      const total = await models.ReceiptByUserDB.countDocuments({
          userId: new mongoose.Types.ObjectId(userId)
      });

      const userStatsData = {
          user: userData[0] || null,
          totalReceipts: total,
          generatedAt: new Date().toISOString()
      };

      // ✅ STANDARDIZED RESPONSE
      res.status(200).send(wrappSuccessResult(200, userStatsData, "User statistics retrieved successfully"));

  } catch (error) {
      console.error('❌ User stats error:', error);
      
      // ✅ STANDARDIZED ERROR RESPONSE
      res.status(500).send({
          status: "Error",
          statusCode: 500,
          message: "Failed to fetch user statistics",
          data: null,
          error: {
              details: error.message,
              timestamp: new Date().toISOString()
          }
      });
  }
};

// ✅ Helper Functions
// Helper Functions (unchanged)
const buildDateFilter = (startDate, endDate) => {
  const filter = {
      user: {},
      subscription: {}
  };
  
  if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      filter.user = { createdAt: { $gte: start, $lte: end } };
      filter.subscription = { createdAt: { $gte: start, $lte: end } };
  }
  
  return filter;
};

const getPeriodDateRange = (period) => {
  const end = new Date();
  const start = new Date();
  
  switch (period) {
      case '7d':
          start.setDate(end.getDate() - 7);
          break;
      case '30d':
          start.setDate(end.getDate() - 30);
          break;
      case '90d':
          start.setDate(end.getDate() - 90);
          break;
      case '1y':
          start.setFullYear(end.getFullYear() - 1);
          break;
      default:
          start.setDate(end.getDate() - 30);
  }
  
  return { start, end };
};


// ✅ HIGH-PERFORMANCE MONTHLY CUSTOMER DATA - COMPLETE VERSION

// Current year monthly data (excludes future months)
// GET /api/dashboard/monthly-data

// Specific year
// GET /api/dashboard/monthly-data?year=2024

// Include future months with zero values
// GET /api/dashboard/monthly-data?year=2024&includeFuture=true

// Disable caching
// GET /api/dashboard/monthly-data?year=2024&useCache=false

// Quarterly data
// GET /api/dashboard/quarterly-data?year=2024

// Future year (returns empty data)
// GET /api/dashboard/monthly-data?year=2026

const getMonthlyCustomerDataHandler = async (req, res) => {
  try {
    const { 
      year = new Date().getFullYear(), 
      includeFuture = false,
      useCache = true 
    } = req.query;
    
    const cacheKey = `dashboard:monthly:${year}:${includeFuture}`;
    
    // Try cache first
    if (useCache && redisClient.isReady) {
          try {
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
          logger.info('📊 Monthly data served from cache');
          const parsedData = JSON.parse(cachedData);
          
          return res.status(200).send(wrappSuccessResult(200, {
            ...parsedData,
            performance: {
              ...parsedData.performance,
              cached: true,
              servedFromCache: true,
              cacheTimestamp: new Date().toISOString()
            }
          }, "Monthly customer data retrieved successfully"));
        }
      } catch (cacheError) {
        logger.warn('📊 Cache read failed for monthly data', { message: cacheError.message });
      }
    }

    // Get current date info
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const requestedYear = parseInt(year);
    
    // Handle future years
  if (requestedYear > currentYear && !includeFuture) {
  logger.info('📊 Future year requested, returning empty data');
      return res.status(200).send(wrappSuccessResult(200, {
        data: [],
        summary: {
          year: requestedYear,
          message: "No data available for future years",
          currentYear,
          futureYear: true,
          totalCustomers: 0,
          totalActiveSubscriptions: 0,
          totalCanceledSubscriptions: 0,
          totalDeletedAccounts: 0
        },
        metadata: {
          year: requestedYear,
          dataPoints: 0,
          hasCompleteYear: false,
          includeFuture: false,
          currentDate: {
            year: currentYear,
            month: currentMonth
          }
        },
        performance: {
          cached: false,
          generatedAt: new Date().toISOString()
        }
      }, "No data available for future year"));
    }

    // Determine month range
    let maxMonth = 12;
    if (requestedYear === currentYear && !includeFuture) {
      maxMonth = currentMonth; // Only include months up to current
    }

    console.time('📊 Monthly Customer Data Query');
    
    const startOfYear = new Date(requestedYear, 0, 1);
    const endOfYear = new Date(requestedYear, 11, 31, 23, 59, 59, 999);

    // Parallel aggregation for optimal performance
    const [userMonthlyData, subscriptionMonthlyData] = await Promise.all([
      // User data aggregation
      models.UserDB.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfYear, $lte: endOfYear }
          }
        },
        {
          $group: {
            _id: {
              month: { $month: '$createdAt' },
              year: { $year: '$createdAt' }
            },
            totalCustomers: { $sum: 1 },
            deletedAccounts: {
              $sum: { $cond: [{ $eq: ['$isDeleted', true] }, 1, 0] }
            },
            activeCustomers: {
              $sum: { $cond: [{ $eq: ['$isDeleted', false] }, 1, 0] }
            }
          }
        },
        {
          $sort: { '_id.month': 1 }
        }
      ]),

      // Subscription data aggregation
      models.SubscriptionsDB.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfYear, $lte: endOfYear }
          }
        },
        {
          $group: {
            _id: {
              month: { $month: '$createdAt' },
              year: { $year: '$createdAt' }
            },
            activeSubscriptions: {
              $sum: {
                $cond: [
                  { $in: ['$cus_pdl_status', ['completed', 'active']] }, 1, 0
                ]
              }
            },
            canceledSubscriptions: {
              $sum: {
                $cond: [
                  { $eq: ['$cus_pdl_status', 'canceled'] }, 1, 0
                ]
              }
            },
            pausedSubscriptions: {
              $sum: {
                $cond: [
                  { $eq: ['$cus_pdl_status', 'paused'] }, 1, 0
                ]
              }
            },
            pastDueSubscriptions: {
              $sum: {
                $cond: [
                  { $eq: ['$cus_pdl_status', 'past_due'] }, 1, 0
                ]
              }
            },
            totalSubscriptions: { $sum: 1 }
          }
        },
        {
          $sort: { '_id.month': 1 }
        }
      ])
    ]);

  console.timeEnd('📊 Monthly Customer Data Query');
  logger.info('📊 Processing monthly data aggregation results...');

    // Month names mapping
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Create dataset only for relevant months
    const monthlyData = [];
    
    for (let month = 1; month <= maxMonth; month++) {
      const userData = userMonthlyData.find(item => item._id.month === month) || {
        totalCustomers: 0,
        deletedAccounts: 0,
        activeCustomers: 0
      };
      
      const subscriptionData = subscriptionMonthlyData.find(item => item._id.month === month) || {
        activeSubscriptions: 0,
        canceledSubscriptions: 0,
        pausedSubscriptions: 0,
        pastDueSubscriptions: 0,
        totalSubscriptions: 0
      };

      const isCurrent = requestedYear === currentYear && month === currentMonth;
      const isPast = requestedYear < currentYear || (requestedYear === currentYear && month < currentMonth);
      const isFuture = requestedYear > currentYear || (requestedYear === currentYear && month > currentMonth);

      monthlyData.push({
        month: monthNames[month - 1],
        monthNumber: month,
        customers: userData.totalCustomers,
        activeCustomers: userData.activeCustomers,
        activeSubscriptions: subscriptionData.activeSubscriptions,
        canceledSubscriptions: subscriptionData.canceledSubscriptions,
        pausedSubscriptions: subscriptionData.pausedSubscriptions,
        pastDueSubscriptions: subscriptionData.pastDueSubscriptions,
        deletedAccounts: userData.deletedAccounts,
        totalSubscriptions: subscriptionData.totalSubscriptions,
        netCustomerGrowth: userData.totalCustomers - userData.deletedAccounts,
        subscriptionRate: userData.totalCustomers > 0 
          ? ((subscriptionData.totalSubscriptions / userData.totalCustomers) * 100).toFixed(2)
          : "0.00",
        churnRate: subscriptionData.totalSubscriptions > 0
          ? ((subscriptionData.canceledSubscriptions / subscriptionData.totalSubscriptions) * 100).toFixed(2)
          : "0.00",
        // Add metadata for each month
        status: {
          isCurrent,
          isPast,
          isFuture,
          type: isCurrent ? "current" : isPast ? "historical" : "future"
        }
      });
    }

    // Calculate year summary
    const yearSummary = {
      year: requestedYear,
      dataType: requestedYear === currentYear ? "current_year" : requestedYear < currentYear ? "historical" : "future",
      monthsIncluded: maxMonth,
      totalMonthsInYear: 12,
      isCompleteYear: maxMonth === 12,
      currentMonth: requestedYear === currentYear ? currentMonth : null,
      totalCustomers: monthlyData.reduce((sum, month) => sum + month.customers, 0),
      totalActiveSubscriptions: monthlyData.reduce((sum, month) => sum + month.activeSubscriptions, 0),
      totalCanceledSubscriptions: monthlyData.reduce((sum, month) => sum + month.canceledSubscriptions, 0),
      totalPausedSubscriptions: monthlyData.reduce((sum, month) => sum + month.pausedSubscriptions, 0),
      totalDeletedAccounts: monthlyData.reduce((sum, month) => sum + month.deletedAccounts, 0),
      totalNetGrowth: monthlyData.reduce((sum, month) => sum + month.netCustomerGrowth, 0),
      avgMonthlyGrowth: monthlyData.length > 0 
        ? (monthlyData.reduce((sum, month) => sum + month.netCustomerGrowth, 0) / monthlyData.length).toFixed(2)
        : "0.00",
      avgChurnRate: monthlyData.length > 0
        ? (monthlyData.reduce((sum, month) => sum + parseFloat(month.churnRate), 0) / monthlyData.length).toFixed(2)
        : "0.00",
      peakMonth: monthlyData.length > 0 
        ? monthlyData.reduce((prev, current) => (current.customers > prev.customers) ? current : prev).month
        : null,
      lowestMonth: monthlyData.length > 0 
        ? monthlyData.reduce((prev, current) => (current.customers < prev.customers) ? current : prev).month
        : null,
      bestGrowthMonth: monthlyData.length > 0
        ? monthlyData.reduce((prev, current) => (current.netCustomerGrowth > prev.netCustomerGrowth) ? current : prev).month
        : null
    };

    const responseData = {
      data: monthlyData,
      summary: yearSummary,
      metadata: {
        year: requestedYear,
        dataPoints: monthlyData.length,
        hasCompleteYear: maxMonth === 12,
        includeFuture: includeFuture,
        requestParams: {
          year: requestedYear,
          includeFuture,
          useCache
        },
        currentDate: {
          year: currentYear,
          month: currentMonth,
          monthName: monthNames[currentMonth - 1],
          timestamp: now.toISOString()
        },
        futureMonthsExcluded: includeFuture ? 0 : Math.max(0, 12 - maxMonth),
        dataIntegrity: {
          userDataPoints: userMonthlyData.length,
          subscriptionDataPoints: subscriptionMonthlyData.length,
          monthsWithData: monthlyData.filter(m => m.customers > 0).length
        }
      },
      performance: {
        cached: false,
        generatedAt: new Date().toISOString(),
        queryExecutionTime: "Logged in console",
        optimizations: [
          "Excludes future months by default",
          "Parallel aggregation queries", 
          "Indexed date fields",
          "Redis caching enabled",
          "Efficient month filtering"
        ]
      }
    };

    // Cache the results for 1 hour (3600 seconds)
    if (useCache && redisClient.isReady) {
      try {
        await redisClient.setEx(cacheKey, 3600, JSON.stringify(responseData));
        logger.info('📊 Monthly data cached successfully for', { year: requestedYear });
      } catch (cacheError) {
        logger.warn('📊 Cache write failed for monthly data', { message: cacheError.message });
      }
    }

    logger.info('📊 Monthly data generation completed successfully');
    logger.info('📊 Data summary', {
      year: requestedYear,
      monthsGenerated: monthlyData.length,
      totalCustomers: yearSummary.totalCustomers,
      cachedResult: false
    });
    
    // ✅ STANDARDIZED RESPONSE
    res.status(200).send(wrappSuccessResult(200, responseData, "Monthly customer data retrieved successfully"));

  } catch (error) {
    console.error('❌ Monthly customer data error:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Request params:', req.query);
    
    // ✅ STANDARDIZED ERROR RESPONSE
    res.status(500).send({
      status: "Error",
      statusCode: 500,
      message: "Failed to fetch monthly customer data",
      data: null,
      error: {
        details: error.message,
        timestamp: new Date().toISOString(),
        operation: "monthly_customer_data",
        requestParams: req.query
      }
    });
  }
};

// ✅ QUARTERLY DATA HANDLER - COMPLETE VERSION
const getQuarterlyDataHandler = async (req, res) => {
  try {
    const { 
      year = new Date().getFullYear(), 
      includeFuture = false,
      useCache = true 
    } = req.query;
    
    const cacheKey = `dashboard:quarterly:${year}:${includeFuture}`;
    
    // Try cache first
    if (useCache && redisClient.isReady) {
      try {
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
          console.log('📊 Quarterly data served from cache');
          return res.status(200).send(wrappSuccessResult(200, JSON.parse(cachedData), "Quarterly data retrieved successfully"));
        }
      } catch (cacheError) {
        console.warn('📊 Quarterly cache read failed:', cacheError.message);
      }
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
    const requestedYear = parseInt(year);

    // Handle future years
    if (requestedYear > currentYear && !includeFuture) {
      console.log('📊 Future year requested for quarterly data, returning empty');
      return res.status(200).send(wrappSuccessResult(200, {
        data: [],
        summary: {
          year: requestedYear,
          message: "No quarterly data available for future years",
          futureYear: true
        },
        performance: {
          cached: false,
          generatedAt: new Date().toISOString()
        }
      }, "No quarterly data available for future year"));
    }

    console.time('📊 Quarterly Data Query');
    
    const startOfYear = new Date(requestedYear, 0, 1);
    const endOfYear = new Date(requestedYear, 11, 31, 23, 59, 59, 999);

    const quarterlyData = await models.UserDB.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfYear, $lte: endOfYear }
        }
      },
      {
        $group: {
          _id: {
            quarter: {
              $ceil: { $divide: [{ $month: '$createdAt' }, 3] }
            },
            year: { $year: '$createdAt' }
          },
          customers: { $sum: 1 },
          deletedAccounts: {
            $sum: { $cond: [{ $eq: ['$isDeleted', true] }, 1, 0] }
          },
          activeCustomers: {
            $sum: { $cond: [{ $eq: ['$isDeleted', false] }, 1, 0] }
          }
        }
      },
      {
        $lookup: {
          from: 'subscriptions',
          let: { 
            quarterStart: {
              $dateFromParts: {
                year: '$_id.year',
                month: { $subtract: [{ $multiply: ['$_id.quarter', 3] }, 2] },
                day: 1
              }
            },
            quarterEnd: {
              $dateFromParts: {
                year: '$_id.year',
                month: { $multiply: ['$_id.quarter', 3] },
                day: 31
              }
            }
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $gte: ['$createdAt', '$$quarterStart'] },
                    { $lte: ['$createdAt', '$$quarterEnd'] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                activeSubscriptions: {
                  $sum: {
                    $cond: [
                      { $in: ['$cus_pdl_status', ['completed', 'active']] }, 1, 0
                    ]
                  }
                },
                canceledSubscriptions: {
                  $sum: {
                    $cond: [{ $eq: ['$cus_pdl_status', 'canceled'] }, 1, 0]
                  }
                },
                totalSubscriptions: { $sum: 1 }
              }
            }
          ],
          as: 'subscriptionData'
        }
      },
      {
        $sort: { '_id.quarter': 1 }
      }
    ]);

    console.timeEnd('📊 Quarterly Data Query');

    // Filter quarters based on includeFuture setting
    let maxQuarter = 4;
    if (requestedYear === currentYear && !includeFuture) {
      maxQuarter = currentQuarter;
    }

    const processedData = [];
    
    for (let quarter = 1; quarter <= maxQuarter; quarter++) {
      const quarterData = quarterlyData.find(q => q._id.quarter === quarter) || {
        customers: 0,
        deletedAccounts: 0,
        activeCustomers: 0,
        subscriptionData: [{ activeSubscriptions: 0, canceledSubscriptions: 0, totalSubscriptions: 0 }]
      };

      const isCurrent = requestedYear === currentYear && quarter === currentQuarter;
      const isPast = requestedYear < currentYear || (requestedYear === currentYear && quarter < currentQuarter);
      const isFuture = requestedYear > currentYear || (requestedYear === currentYear && quarter > currentQuarter);

      processedData.push({
        quarter: `Q${quarter}`,
        quarterNumber: quarter,
        year: requestedYear,
        customers: quarterData.customers,
        activeCustomers: quarterData.activeCustomers,
        deletedAccounts: quarterData.deletedAccounts,
        activeSubscriptions: quarterData.subscriptionData[0]?.activeSubscriptions || 0,
        canceledSubscriptions: quarterData.subscriptionData[0]?.canceledSubscriptions || 0,
        totalSubscriptions: quarterData.subscriptionData[0]?.totalSubscriptions || 0,
        netGrowth: quarterData.customers - quarterData.deletedAccounts,
        subscriptionRate: quarterData.customers > 0
          ? ((quarterData.subscriptionData[0]?.totalSubscriptions || 0) / quarterData.customers * 100).toFixed(2)
          : "0.00",
        status: {
          isCurrent,
          isPast,
          isFuture,
          type: isCurrent ? "current" : isPast ? "historical" : "future"
        }
      });
    }

    const responseData = {
      data: processedData,
      summary: {
        year: requestedYear,
        quartersIncluded: maxQuarter,
        isCompleteYear: maxQuarter === 4,
        totalCustomers: processedData.reduce((sum, q) => sum + q.customers, 0),
        totalActiveSubscriptions: processedData.reduce((sum, q) => sum + q.activeSubscriptions, 0),
        totalNetGrowth: processedData.reduce((sum, q) => sum + q.netGrowth, 0),
        bestQuarter: processedData.length > 0
          ? processedData.reduce((prev, current) => (current.customers > prev.customers) ? current : prev).quarter
          : null
      },
      metadata: {
        year: requestedYear,
        dataPoints: processedData.length,
        includeFuture,
        currentQuarter: requestedYear === currentYear ? currentQuarter : null
      },
      performance: {
        cached: false,
        generatedAt: new Date().toISOString()
      }
    };

    // Cache for 2 hours
    if (useCache && redisClient.isReady) {
      try {
        await redisClient.setEx(cacheKey, 7200, JSON.stringify(responseData));
        logger.info('📊 Quarterly data cached successfully');
      } catch (cacheError) {
        logger.warn('📊 Quarterly cache write failed', { message: cacheError.message });
      }
    }

    logger.info('📊 Quarterly data generation completed');

    res.status(200).send(wrappSuccessResult(200, responseData, "Quarterly data retrieved successfully"));

  } catch (error) {
    console.error('❌ Quarterly data error:', error);
    res.status(500).send({
      status: "Error",
      statusCode: 500,
      message: "Failed to fetch quarterly data",
      data: null,
      error: {
        details: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
};


// ✅ ROUTES - All standardized
router.get('/stats', verifyAdmin, getDashboardStatsHandler);
router.get('/realtime', verifyAdmin, getRealTimeStatsHandler);
router.get('/trends', verifyAdmin, getTrendsHandler);
router.get('/get-table', verifyAdmin, getDataTableHandler);
router.get('/user-stats/:userId', verifyAdmin, getUserStatsHandler);

// Legacy route for backward compatibility
router.get('/', verifyAdmin, getDashboardStatsHandler);

// old APIs are below

router.get('/user-stats/:userId', verifyAdmin, async (req, res) => {

  const userId = req.params.userId; // from route /user/:userId

  // console.log('userId', userId)
  const userData = await models.UserDB.aggregate([
  {
    $match: {
      _id: new mongoose.Types.ObjectId(userId)
    }
  },
  {
    $lookup: {
      from: 'subscriptions',
      let: { userId: { $toString: '$_id' } },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ['$userId', '$$userId'] },
          },
        },
      ],
      as: 'subscription',
    },
  },
  {
    $unwind: {
      path: '$subscription',
      preserveNullAndEmptyArrays: true,
    },
  },
  {
    $lookup: {
      from: 'receiptbyusers',
      let: { userId: { $toString: '$_id' } },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ['$userId', '$$userId'] }
          }
        }
      ],
      as: 'receipts'
    },
  },
  {
    $addFields: {
      receiptCount: { $size: '$receipts' },
    },
  },
  {
    $project: {
      userName: 1,
      email: 1,
      receiptCount: 1,
      receipts: 1, // includes full list of receipts
      'subscription.plan': 1,
      'subscription.planStartDate': 1,
      'subscription.planEndDate': 1,
      'subscription.isActive': 1,
      'subscription.cus_pdl_status': 1,
      'subscription.planHistory': 1,
      'subscription.timeLeftToEnd': 1,
      'subscription.customer_id': 1,
      'subscription.sub_pdl_id': 1,
    },
  },
]);


const total = await models.ReceiptByUserDB.countDocuments({
  userId: new mongoose.Types.ObjectId(userId),
});
    
    // Send results
    res.json({ data: userData, total });

})
router.get('/user-stats', verifyAdmin, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    
    const {
      userName = '',
      email = '',
      startDate = '',
      endDate = '',
      sortField = 'userName',
      sortOrder = 'ascend'
    } = req.query;
  
    const matchStage = {};
  
    if (userName) {
      matchStage.userName = { $regex: userName, $options: 'i' };
    }
  
    if (email) {
      matchStage.email = { $regex: email, $options: 'i' };
    }
  
    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'subscriptions',
          let: { userId: { $toString: '$_id' } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$userId', '$$userId'] },
              },
            },
          ],
          as: 'subscription',
        },
      },
      {
        $unwind: {
          path: '$subscription',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'receiptbyusers',
          let: { userId: { $toString: '$_id' } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$userId', '$$userId'] }
              }
            }
          ],
          as: 'receipts'
        },
      },
      {
        $addFields: {
          receiptCount: { $size: '$receipts' },
        },
      },
    ];
  
    if (startDate && endDate) {
      pipeline.push({
        $match: {
          'subscription.planStartDate': {
            $gte: new Date(startDate),
            $lte: new Date(endDate),
          },
        },
      });
    }
  
    pipeline.push(
      {
        $project: {
          userName: 1,
          email: 1,
          receiptCount: 1,
          'subscription.plan': 1,
          'subscription.planStartDate': 1,
          'subscription.planEndDate': 1,
          'subscription.isActive': 1,
          'subscription.cus_pdl_status': 1,
          'subscription.planHistory': 1,
          'subscription.timeLeftToEnd': 1,
          'subscription.customer_id': 1,
          'subscription.sub_pdl_id': 1,
        },
      },
      {
        $sort: {
          [sortField]: sortOrder === 'ascend' ? 1 : -1,
        },
      },
      { $skip: skip },
      { $limit: limit }
    );
  
    const data = await models.UserDB.aggregate(pipeline);
    const total = await models.UserDB.countDocuments(matchStage);
  
    res.json({ data, total });

    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', verifyAdmin, getHandler) // verifyAdmin,
// Add these routes to your existing router section in dashboardController.js

// ✅ NEW ROUTES - Add before the configure function
router.get('/monthly-data', verifyAdmin, getMonthlyCustomerDataHandler);
router.get('/quarterly-data', verifyAdmin, getQuarterlyDataHandler);
router.get('/get-summaries', verifyAdmin, getSummariesHandler) // verifyAdmin,
// router.get('/get-table', verifyAdmin, getDataTableHandler) // verifyAdmin,
router.get('/get-chart', verifyAdmin, getCategoryDataHandler)

const configure = (app) => {
    app.use('/api/dashboard', router)
}

export default configure;