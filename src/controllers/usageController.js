import express from 'express';
import models from '../models/index.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { attachOrganizationContext } from '../middleware/planQuotaMiddleware.js';
import { wrappSuccessResult } from '../utils/index.js';

const router = express.Router();

// Mirror limits used in planQuotaMiddleware (env overrides allowed)
const LIMITS = {
  free: Number(process.env.PLAN_TENANT_LIMIT_FREE || 0),
  starter: Number(process.env.PLAN_TENANT_LIMIT_STARTER || 5),
  pro: Number(process.env.PLAN_TENANT_LIMIT_PRO || 50),
  business: Number(process.env.PLAN_TENANT_LIMIT_BUSINESS || 200),
  enterprise: Number(process.env.PLAN_TENANT_LIMIT_ENTERPRISE || 1000)
};

router.get('/usage', authenticateToken, attachOrganizationContext, async (req, res, next) => {
  try {
    const orgId = req.organization_id;
    const plan = (req.user?.plan || 'starter').toLowerCase();
    const limit = LIMITS[plan] ?? LIMITS.starter;
    const tenants = await models.TenantsDB.countDocuments({ organization_id: orgId });
    const remaining = Math.max(0, (limit || 0) - tenants);
    
    const usageData = {
      organization_id: orgId,
      plan,
      tenants: { used: tenants, limit, remaining }
    };
    
    res.status(200).send(wrappSuccessResult(200, usageData));
  } catch (e) { 
    console.error('Error fetching usage data:', e);
    next(e); 
  }
});

const configure = (app) => {
  app.use('/api', router);
};

export default configure;
