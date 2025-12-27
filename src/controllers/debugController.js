import express from 'express';
import redisClient from '../utils/redisClient.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import logger from '../utils/logger.js';

export default function configureDebug(app){
  const router = express.Router();

  // Require auth to avoid abuse in production
  router.use(authenticateToken);

  // POST /notify - publish a test notification payload to Redis
  router.post('/notify', async (req, res, next) => {
    try{
      const body = req.body || {};
      const payload = body.payload || {
        type: 'notification.created',
        record: {
          id: 'manual-test-' + Date.now(),
          organization_id: req.user && (req.user.organization_id || req.user.orgId) || Number(process.env.DEFAULT_ORG_ID) || 0,
          type: 'manual',
          title: body.title || 'Manual test notification',
          created_at: new Date().toISOString(),
          meta: { sent_by: req.user && req.user.id }
        }
      };

      if(!redisClient) return res.status(503).json({ status: 'error', message: 'Redis client not available' });

      // Attempt to ensure client is ready if possible
      try{
        if(redisClient.isReady === false && typeof redisClient.connect === 'function'){
          await redisClient.connect();
        }
      }catch(e){ logger.warn('Debug notify: failed to connect redis client', e); }

      if(typeof redisClient.publish !== 'function'){
        return res.status(503).json({ status: 'error', message: 'Redis publish is not available' });
      }

      await redisClient.publish('notifications', JSON.stringify(payload));
      logger.info('Debug notify: published payload', payload.record && payload.record.id);
      res.status(200).json({ status: 'ok', payload: payload.record });
    }catch(e){ next(e); }
  });

  app.use('/api/debug', router);
}
