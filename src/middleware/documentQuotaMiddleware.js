import modelsDefault from '../models/index.js';
import { getModel as getModelDefault } from '../models/registry.js';
import { resolveTenantDocLimit } from '../services/documentsQuota.js';

// Factory to create middleware with optional injected models/getModel for easier unit testing
export function createEnforceDocumentQuota({ models = modelsDefault, getModel = getModelDefault } = {}) {
  return async function enforceDocumentQuota(req, res, next) {
    try {
      const tenantId = req.body.tenant_id || req.query.tenant_id || (req.file && req.body.tenant_id) || null;
      if (!tenantId) return next(); // nothing to enforce for tenant-less uploads

      const planSettingsModel = getModel('plan_settings');
      const organization = await models.OrganizationDB.findOne({ organization_id: req.organization_id || req.body.organization_id || req.query.organization_id || null });
      console.log('middleware document quota')
      console.log(organization)
      // console.log(req.body.organization_id);

      const planKey = (organization?.plan || req.user?.plan || 'starter').toString().toLowerCase();
      const planSettings = await planSettingsModel.findOne({ $or: [{ _id: planKey.toLowerCase() === 'hobbylist' || planKey.toLowerCase() === 'hobbyist' ? 'starter' : planKey }, { plan: planKey.toLowerCase() === 'hobbylist' || planKey.toLowerCase() === 'hobbyist' ? 'starter' : planKey }, { id: planKey.toLowerCase() === 'hobbylist' || planKey.toLowerCase() === 'hobbyist' ? 'starter' : planKey }] });
      const tenantDocLimit = resolveTenantDocLimit(planSettings);
      console.log('plankey in documentQuotaMiddleware', planKey, tenantDocLimit);
      console.log(planSettings)

      // const existingCount = await models.DocumentsDB.countDocuments({ tenant_id: tenantId, organization_id: req.organization_id || req.body.organization_id || req.query.organization_id || null });
      const existingCount = await models.DocumentsDB.countDocuments({ tenant_id: tenantId, organization_id: organization?.organization_id || null });
      if (tenantDocLimit !== Infinity && existingCount >= tenantDocLimit) {
        return res.status(403).json({ status: 'Error', statusCode: 403, message: `Document upload limit reached for this tenant (allowed: ${tenantDocLimit}).`, error: 'tenant_document_limit_exceeded' });
      }

      next();
    } catch (err) { next(err); }
  };
}

// Default export: middleware using real models
export const enforceDocumentQuota = createEnforceDocumentQuota();
export default enforceDocumentQuota;
