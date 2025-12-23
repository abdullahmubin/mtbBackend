import models from '../models/index.js';
import { getModel } from '../models/registry.js';

// Plan-based tenant limits with env overrides
// Defaults mirror the frontend PlanContext defaults
const DEFAULT_LIMITS = {
  free: 5,
  starter: 25,
  pro: 100,
  business: 500,
  enterprise: Infinity
};

const LIMITS = {
  free: process.env.PLAN_TENANT_LIMIT_FREE ? Number(process.env.PLAN_TENANT_LIMIT_FREE) : DEFAULT_LIMITS.free,
  starter: process.env.PLAN_TENANT_LIMIT_STARTER ? Number(process.env.PLAN_TENANT_LIMIT_STARTER) : DEFAULT_LIMITS.starter,
  pro: process.env.PLAN_TENANT_LIMIT_PRO ? Number(process.env.PLAN_TENANT_LIMIT_PRO) : DEFAULT_LIMITS.pro,
  business: process.env.PLAN_TENANT_LIMIT_BUSINESS ? Number(process.env.PLAN_TENANT_LIMIT_BUSINESS) : DEFAULT_LIMITS.business,
  enterprise: process.env.PLAN_TENANT_LIMIT_ENTERPRISE ? Number(process.env.PLAN_TENANT_LIMIT_ENTERPRISE) : DEFAULT_LIMITS.enterprise
};

// Export LIMITS for use in controllers
export { LIMITS };

function hashToInt(str) {
  // Simple 32-bit FNV-1a hash
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  // Ensure positive non-zero small-ish number
  return (h % 100000000) + 1;
}

export function resolveOrganizationIdFromUser(user) {
  // Prefer explicit claim if present
  if (user && (user.organization_id || user.orgId)) {
    const n = Number(user.organization_id || user.orgId);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  // Derive a stable numeric org id from user id/email as a fallback
  const basis = user?.id || user?._id || user?.userId || user?.email || '1';
  return hashToInt(String(basis));
}

export async function attachOrganizationContext(req, _res, next) {
  try {
    let orgId = resolveOrganizationIdFromUser(req.user || {});
    // If the authenticated user is a tenant and the tenant record exists, prefer the tenant's organization_id
    try {
      if (req.user && req.user.tenant_id && typeof req.user.tenant_id !== 'undefined') {
        const tenant = await models.TenantsDB.findOne({ id: req.user.tenant_id });
        if (tenant && tenant.organization_id) {
          orgId = Number(tenant.organization_id);
        }
      }
    } catch (e) {
      // ignore tenant lookup errors and fall back to derived orgId
    }
    req.organization_id = orgId;
    // Remove any client-provided org id on writes; controllers can set their payload accordingly
    if (req.body && 'organization_id' in req.body) delete req.body.organization_id;
    next();
  } catch (e) { next(e); }
}

export async function enforceTenantQuota(req, res, next) {
  try {
    const orgId = req.organization_id || resolveOrganizationIdFromUser(req.user || {});

    // Resolve the organization's configured plan (prefer organization record)
    const organization = await models.OrganizationDB.findOne({ organization_id: orgId });
    const planKey = (organization?.plan || req.user?.plan || 'starter').toString().toLowerCase();

    // Primary source of truth: plan_settings collection
    const planSettingsModel = getModel('plan_settings');
    const planSettings = await planSettingsModel.findOne({ _id: planKey });

    // Determine effective tenant limit. If plan_settings has `tenantLimit` === null -> treat as unlimited.
    let effectiveLimit;
    if (planSettings && Object.prototype.hasOwnProperty.call(planSettings, 'tenantLimit')) {
      // explicit null means unlimited
      if (planSettings.tenantLimit === null || planSettings.tenantLimit === undefined) {
        effectiveLimit = Infinity;
      } else {
        effectiveLimit = Number(planSettings.tenantLimit);
        if (Number.isNaN(effectiveLimit)) effectiveLimit = LIMITS[planKey] ?? LIMITS.starter;
      }
    } else {
      // Fallback to env/defaults if no DB record exists
      effectiveLimit = LIMITS[planKey] ?? LIMITS.starter;
    }

    if (!effectiveLimit || effectiveLimit <= 0) {
      return res.status(403).json({ message: 'Your plan does not allow creating tenants. Please upgrade.' });
    }

    const count = await models.TenantsDB.countDocuments({ organization_id: orgId });
    // Compute remaining (Infinity stays Infinity)
    const used = Number(isNaN(Number(count)) ? 0 : Number(count));
    const limit = effectiveLimit === Infinity ? Infinity : Number(effectiveLimit);
    const remaining = (limit === Infinity) ? Infinity : Math.max(0, limit - used);

    // Expose quota info to downstream handlers
    res.locals = res.locals || {};
    res.locals.tenantQuota = { plan: planKey, used, limit, remaining };

    if (used >= limit) {
      return res.status(403).json({
        message: `Tenant limit reached for plan "${planKey}" (${limit === Infinity ? '∞' : limit}). Please upgrade to add more tenants.`,
        quota: { used, limit: limit === Infinity ? '∞' : limit, remaining: remaining === Infinity ? '∞' : remaining }
      });
    }

    // Add a response header for quick client-checks (optional)
    try { if (res.setHeader) res.setHeader('X-Tenant-Quota-Remaining', remaining === Infinity ? '∞' : String(remaining)); } catch (e) { /* ignore header set errors */ }

    next();
  } catch (e) { next(e); }
}
