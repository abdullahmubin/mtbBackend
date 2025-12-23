import express from 'express';
import models from '../models/index.js';
import { authenticateToken, verifyAdmin } from '../middleware/authMiddleware.js';
import logger from '../utils/logger.js';
import { attachOrganizationContext } from '../middleware/planQuotaMiddleware.js';
import { wrappSuccessResult } from '../utils/index.js';
import redisClient from '../utils/redisClient.js';

const router = express.Router();

/**
 * GET /api/dashboard/tenant-expiring-late
 * 
 * Returns a list of tenants that are either:
 * 1. Expiring soon (lease_end_date within the next 30 days)
 * 2. Have 'Expiring Soon', 'Pending', or 'Vacated' status
 * 3. Have a balance > 0
 * 
 * This endpoint is specifically for the dashboard's "Expiring / Late Detail" table
 */
router.get('/tenant-expiring-late', authenticateToken, attachOrganizationContext, async (req, res, next) => {
  try {
  logger.info('Fetching tenant expiring/late details', { organization_id: req.organization_id });
    
    // Get current date
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);
    
    // Build query to find tenants that should appear in the dashboard table
    const query = {
      organization_id: req.organization_id,
      $or: [
        { status: { $in: ['Expiring Soon', 'Pending', 'Vacated'] } },
        { balance: { $gt: 0 } },
        { 
          lease_end_date: { 
            $gte: now,
            $lte: thirtyDaysFromNow
          } 
        }
      ]
    };
    
  logger.debug('Expiring/late query', { query: JSON.stringify(query) });
    
    // Find matching tenants
    const tenants = await models.TenantsDB.find(query).lean();
  logger.info('Found tenants matching expiring/late criteria', { count: tenants.length });
    
    // Format the response
    const formattedTenants = tenants.map(t => ({
      id: t.id || t._id,
      name: `${t.first_name} ${t.last_name || ''}`.trim(),
      suite: t.suite_id,
      end: t.lease_end_date,
      status: t.status,
      balance: t.balance || 0
    }));
    
    return res.status(200).send(wrappSuccessResult(200, formattedTenants));
  } catch (error) {
    logger.error('Error fetching tenant expiring/late details', error);
    return next(error, req, res);
  }
});

/**
 * PUT /api/dashboard/organizations/:id/scheduler
 * Admin only: toggle schedulerEnabled flag for an organization
 */
router.put('/organizations/:id/scheduler', authenticateToken, verifyAdmin, async (req, res, next) => {
  try{
    const orgId = req.params.id;
    const { schedulerEnabled } = req.body;
    if (typeof schedulerEnabled !== 'boolean') return res.status(400).send({ message: 'schedulerEnabled must be boolean' });
    const org = await models.OrganizationsDB.findOneAndUpdate({ _id: orgId }, { $set: { schedulerEnabled } }, { new: true }).lean();
    if(!org) return res.status(404).send({ message: 'Organization not found' });
    return res.status(200).send(wrappSuccessResult(200, { organization: org }));
  }catch(err){
    logger.error('Failed to update organization scheduler flag', err);
    return next(err);
  }
});

// Worker health endpoint: checks Redis connectivity (basic)
router.get('/worker/health', authenticateToken, verifyAdmin, async (req, res) => {
  try{
    if (!redisClient) return res.status(200).send(wrappSuccessResult(200, { status: 'no-redis-client' }));
    try{
      const pong = await redisClient.ping();
      return res.status(200).send(wrappSuccessResult(200, { status: pong ? 'redis-pong' : 'unknown' }));
    }catch(e){
      return res.status(503).send(wrappSuccessResult(503, { status: 'redis-unreachable', error: e && e.message }));
    }
  }catch(err){
    return res.status(500).send(wrappSuccessResult(500, { status: 'error', error: err && err.message }));
  }
});

export default router;
