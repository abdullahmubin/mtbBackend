import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { attachOrganizationContext } from '../middleware/planQuotaMiddleware.js';
import imageQuotaService from '../services/imageQuotaService.js';

export default function configureQuota(app) {
  const router = express.Router();

  router.use(authenticateToken);
  router.use(attachOrganizationContext);

  // GET /quota?suiteId=... - returns used/limit/remaining for building/floor/ticket and optional per-suite info
  router.get('/', async (req, res) => {
    try {
      const orgId = req.organization_id;
      const suiteId = req.query.suiteId || null;

      const [buildingUsed, floorUsed, ticketUsed, suiteTotalUsed] = await Promise.all([
        imageQuotaService.countBuildingImages(orgId),
        imageQuotaService.countFloorImages(orgId),
        imageQuotaService.countTicketImages(orgId),
        imageQuotaService.countAllSuiteImages(orgId)
      ]);

      const plan = await imageQuotaService.getPlanForOrg(orgId);

      console.log('plan:', plan);

      // Normalize plan object returned from DB (some callers wrap payloads)
      const normalizePlanObj = (p) => {
        if (!p) return null;
        // If wrapped like { data: {...} } or { planSettings: {...} }
        if (p.data && typeof p.data === 'object') return p.data;
        if (p.planSettings && typeof p.planSettings === 'object') return p.planSettings;
        // If it's a Mongoose doc with toObject, convert
        if (typeof p.toObject === 'function') {
          try { return p.toObject(); } catch (e) { /* ignore */ }
        }
        // Otherwise assume plain object
        return p;
      };

      const planObj = normalizePlanObj(plan);

      console.log('normalized planObj:', planObj);

      // Helper to safely read numeric limits from plan (tolerant to null/undefined plan)
      const readLimit = (p, key) => {
        if (!p) return null;
        const v = p[key];
        if (v === null || v === undefined) return null;
        const n = Number(v);
        return Number.isNaN(n) ? null : n;
      };

      const buildingLimit = readLimit(planObj, 'buildingImageLimit');
      const floorLimit = readLimit(planObj, 'floorImageLimit');
      const ticketLimit = readLimit(planObj, 'ticketImageLimit');
      const suiteLimit = readLimit(planObj, 'suiteImageLimit');

      console.log('suiteLimit:', suiteLimit, 'suiteTotalUsed:', suiteTotalUsed);

      // Debug: log resolved values to help diagnose mismatches between Plan Settings and quota output
      try {
        console.debug('[quota] orgId=', orgId, 'planFound=', plan && (plan._id || plan.id || plan.plan), 'suiteLimit=', suiteLimit, 'suiteTotalUsed=', suiteTotalUsed);
      } catch (e) { /* ignore logging errors */ }

      const result = {
        building: {
          used: buildingUsed,
          limit: buildingLimit,
          remaining: buildingLimit === null ? null : Math.max(0, buildingLimit - buildingUsed)
        },
        floor: {
          used: floorUsed,
          limit: floorLimit,
          remaining: floorLimit === null ? null : Math.max(0, floorLimit - floorUsed)
        },
        ticket: {
          used: ticketUsed,
          limit: ticketLimit,
          remaining: ticketLimit === null ? null : Math.max(0, ticketLimit - ticketUsed)
        },
        suite: {
          // total images across all suites in the org (useful for org-level visibility)
          used: suiteTotalUsed,
          perSuiteLimit: suiteLimit,
          remaining: suiteLimit === null ? null : Math.max(0, suiteLimit - suiteTotalUsed)
        }
      };

      // If suiteId provided, include the current count for that suite and remaining
      if (suiteId) {
        const current = await imageQuotaService.getSuiteImageCount(suiteId, orgId);
        result.suite.current = current;
        result.suite.remaining = suiteLimit === null ? null : Math.max(0, suiteLimit - current);
      }

      res.status(200).json({ success: true, quota: result });
    } catch (err) {
      console.error('Quota endpoint failed', err);
      res.status(500).json({ success: false, message: 'Failed to load quota information' });
    }
  });

  app.use('/quota', router);
  app.use('/api/quota', router);
}
