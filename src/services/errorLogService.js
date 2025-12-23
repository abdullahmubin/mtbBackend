import mongoose from 'mongoose';
import { getModel } from '../models/registry.js';
import logger from '../utils/logger.js';
import alertService from './alertService.js';

const ErrorLog = getModel('error_logs');

async function logError(payload = {}) {
  try {
    // Prepare document - keep small to avoid exploding storage
    const doc = {
      message: payload.message || (payload.err && payload.err.message) || String(payload),
      name: payload.name || (payload.err && payload.err.name) || undefined,
      stack: payload.stack || (payload.err && payload.err.stack) || undefined,
      level: payload.level || 'error',
      route: payload.route || payload.url || undefined,
      method: payload.method || undefined,
      ip: payload.ip || undefined,
      userAgent: payload.userAgent || undefined,
      userId: payload.userId || (payload.user && payload.user.id) || undefined,
      body: payload.body || undefined,
      params: payload.params || undefined,
      query: payload.query || undefined,
      meta: payload.meta || undefined,
      created_at: new Date()
    };

    // Non-blocking insert, but await to catch DB errors here
    const Model = ErrorLog;
    if (Model && typeof Model.create === 'function') {
      const created = await Model.create(doc);
      // If high-severity, send alert (best-effort)
      try {
        const severity = (payload.level || payload.meta?.severity || 'error').toString().toLowerCase();
        if (severity === 'error' || payload.meta?.alert === true) {
          alertService.notify({ title: `New error: ${doc.name || 'unknown'}`, text: doc.message || '', level: severity, meta: { route: doc.route, method: doc.method, userId: doc.userId } }).catch(e=>{});
        }
      } catch (e) { /* ignore alert failures */ }
      return created;
    } else {
      logger.warn('ErrorLog model not available; skipping DB persistence');
    }
  } catch (e) {
    // If DB write fails, log to file/console but don't throw
    try { logger.error('Failed to persist error log', e, { original: payload && payload.message ? payload.message : undefined }); } catch (ee) { console.error('Failed to persist error log', e, ee); }
  }
}

export default { logError };
