import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { attachOrganizationContext } from '../middleware/planQuotaMiddleware.js';
import { getModel } from '../models/registry.js';
import logger from '../utils/logger.js';

export default function configureErrorLogs(app) {
  const router = express.Router();

  router.use(authenticateToken);
  router.use(attachOrganizationContext);

  // GET /api/error-logs?limit=&skip=&from=&to=&route=&name=&level=
  router.get('/', async (req, res) => {
    try {
      const role = req.user?.role;
      if (!['admin','manager','clientadmin'].includes(role)) return res.status(403).json({ success:false, message: 'Forbidden' });

      const ErrorLog = getModel('error_logs');
      const { limit = 50, skip = 0, from, to, route, name, level } = req.query;
      const q = {};
      if (from || to) q.created_at = {};
      if (from) q.created_at.$gte = new Date(from);
      if (to) q.created_at.$lte = new Date(to);
      if (route) q.route = new RegExp(route, 'i');
      if (name) q.name = new RegExp(name, 'i');
      if (level) q.level = level;

      const data = await ErrorLog.find(q).sort({ created_at: -1 }).skip(Number(skip)).limit(Math.min(1000, Number(limit))).lean();
      const total = await ErrorLog.countDocuments(q);
      res.status(200).json({ success: true, total, data });
    } catch (e) {
      logger.error('Failed to list error logs', e);
      res.status(500).json({ success: false, message: 'Failed to list error logs' });
    }
  });

  app.use('/error-logs', router);
  app.use('/api/error-logs', router);
}
