import express from 'express';
import SentEmail from '../models/sentEmail.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Simple passthrough listing (same as controller GET /api/email/sent)
router.get('/sent', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const docs = await SentEmail.find().sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await SentEmail.countDocuments();
    res.json({ ok: true, total, page: parseInt(page), limit: parseInt(limit), data: docs });
  } catch (err) {
    logger.error('emailRoutes /sent failed', err);
    next(err);
  }
});

export default router;
