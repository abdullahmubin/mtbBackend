import mongoose from 'mongoose';

const errorLogSchema = new mongoose.Schema({
  message: { type: String, required: false },
  name: { type: String, required: false },
  stack: { type: String, required: false },
  level: { type: String, default: 'error' },
  route: { type: String, required: false },
  method: { type: String, required: false },
  ip: { type: String, required: false },
  userAgent: { type: String, required: false },
  userId: { type: mongoose.Schema.Types.Mixed, required: false },
  body: { type: mongoose.Schema.Types.Mixed, required: false },
  params: { type: mongoose.Schema.Types.Mixed, required: false },
  query: { type: mongoose.Schema.Types.Mixed, required: false },
  meta: { type: mongoose.Schema.Types.Mixed, required: false },
  created_at: { type: Date, default: () => new Date() }
}, { collection: 'error_logs', strict: false });

// TTL index for retention (default 30 days). Set ERROR_LOG_RETENTION_DAYS env var to change.
const retentionDays = Number(process.env.ERROR_LOG_RETENTION_DAYS || 30);
try {
  errorLogSchema.index({ created_at: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60 });
} catch (e) {
  // index creation may be deferred; log to console if environment doesn't allow indexing at module load
  try { console.warn('Could not create TTL index for error_logs at module load', e); } catch (ee) {}
}

export default errorLogSchema;
