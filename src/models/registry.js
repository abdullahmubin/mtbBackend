import mongoose from 'mongoose';
import planSettingsSchema from './planSettings.js';
import errorLogSchema from './errorLogs.js';

// Create or return a flexible model for a given collection name.
// We store a numeric "id" (matching db.json) and allow other fields freely.
export function getModel(collectionName) {
  const modelName = `Gen_${collectionName}`; // avoid mongoose pluralization collisions
  if (mongoose.models[modelName]) return mongoose.models[modelName];

  // Use custom schema for plan_settings
  if (collectionName === 'plan_settings') {
    return mongoose.model(modelName, planSettingsSchema);
  }

  // Use custom schema for error_logs
  if (collectionName === 'error_logs') {
    return mongoose.model(modelName, errorLogSchema);
  }

  const schema = new mongoose.Schema(
    {
      // Some collections use string IDs (e.g., plan_settings), others numeric.
      id: { type: mongoose.Schema.Types.Mixed, index: true },
      organization_id: { type: Number, index: true },
      // Open schema for quick bootstrapping; refine per-collection later
    },
    { strict: false, timestamps: true, collection: collectionName }
  );

  return mongoose.model(modelName, schema);
}

export const collections = [
  'organizations',
  'email_automations',
  'sms_automations',
  'announcements',
  'documents',
  'tickets',
  'payments',
  'contracts',
  'renewal_reminders',
  'tenants',
  'messages',
  'sms_messages',
  'buildings',
  'floors',
  'suites',
  'leases',
  'users',
  'plan_settings',
  'email_templates',
  'sent_emails',
  'sms_templates',
  'contact_messages'
  ,'notifications'
  ,'notification_reads'
];

export default { getModel, collections };
