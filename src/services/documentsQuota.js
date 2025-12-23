import models from '../models/index.js';
import { getModel } from '../models/registry.js';

// Compute tenant document limit from plan settings record
export function resolveTenantDocLimit(planSettings) {
  // Normalize various shapes coming from Mongoose or JSON sources into a plain object
  // If planSettings is missing, fallback to the starter plan default (5 docs per tenant)
  // This aligns backend fallback with frontend PLAN_LIMITS_FALLBACK and avoids unexpectedly strict limits if DB rows are missing.
  if (!planSettings) return 5;

  let obj = planSettings;

  // If it's a JSON string, try to parse
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch (e) { return 5; }
  }

  // If it's a Mongoose document, convert to plain object
  try {
    if (obj && typeof obj.toObject === 'function') obj = obj.toObject();
  } catch (e) {
    // ignore and continue with original value
  }

  // Some callers may wrap the payload: { data: {...} } or { planSettings: {...} }
  if (obj && typeof obj === 'object') {
    if (obj.data && typeof obj.data === 'object') obj = obj.data;
    else if (obj.planSettings && typeof obj.planSettings === 'object') obj = obj.planSettings;
  }

  if (!obj || typeof obj !== 'object') return 5;

  if (!Object.prototype.hasOwnProperty.call(obj, 'tenantDocumentLimit')) return 5;

  const v = obj.tenantDocumentLimit;
  if (v === null || v === undefined) return Infinity;

  // Accept explicit string tokens for infinity
  if (typeof v === 'string' && (v.toLowerCase() === 'infinity' || v === '\u221e')) return Infinity;

  const n = Number(v);
  return Number.isFinite(n) ? n : 5;
}

// Compute quota for a single tenant. Allows injection of models/getModel for tests.
export async function computeTenantQuota(tenantId, organizationId, { injectedModels = null, injectedGetModel = null } = {}){
  const M = injectedModels || models;
  const gm = injectedGetModel || getModel;
  const planSettingsModel = gm('plan_settings');

  const organization = await M.OrganizationDB.findOne({ organization_id: organizationId });
  const planKey = (organization?.plan || 'starter').toString().toLowerCase();
  // Try to find the plan_settings document by several possible keys: _id, plan, or id
  const planSettings = await planSettingsModel.findOne({ $or: [{ _id: planKey }, { plan: planKey }, { id: planKey }] });
  const tenantDocLimit = resolveTenantDocLimit(planSettings);

  const used = await M.DocumentsDB.countDocuments({ tenant_id: tenantId, organization_id: organizationId });
  const remaining = tenantDocLimit === Infinity ? Infinity : Math.max(0, tenantDocLimit - used);
  return { tenant_id: tenantId, limit: tenantDocLimit, used, remaining };
}

// Compute quotas for a list of tenant ids (batch). Allows injection for tests.
export async function computeQuotaBatch(tenantIds = [], organizationId, { injectedModels = null, injectedGetModel = null } = {}){
  const M = injectedModels || models;
  const gm = injectedGetModel || getModel;
  const planSettingsModel = gm('plan_settings');

  const organization = await M.OrganizationDB.findOne({ organization_id: organizationId });
  const planKey = (organization?.plan || 'starter').toString().toLowerCase();
  // Try to find the plan_settings document by several possible keys: _id, plan, or id
  const planSettings = await planSettingsModel.findOne({ $or: [{ _id: planKey }, { plan: planKey }, { id: planKey }] });
  const tenantDocLimit = resolveTenantDocLimit(planSettings);

  // aggregate counts
  const counts = await M.DocumentsDB.aggregate([
    { $match: { tenant_id: { $in: tenantIds }, organization_id: organizationId } },
    { $group: { _id: '$tenant_id', count: { $sum: 1 } } }
  ]).allowDiskUse(true);

  const countsMap = {};
  (counts || []).forEach(c => { countsMap[String(c._id)] = c.count; });

  return tenantIds.map(tid => {
    const used = countsMap[String(tid)] || 0;
    const remaining = tenantDocLimit === Infinity ? Infinity : Math.max(0, tenantDocLimit - used);
    return { tenant_id: tid, limit: tenantDocLimit, used, remaining };
  });
}

export default { resolveTenantDocLimit, computeTenantQuota, computeQuotaBatch };
