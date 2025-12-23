import express from 'express';
import Joi from 'joi';
import models from '../models/index.js';
import { getModel } from '../models/registry.js';
import { authenticateToken, verifyAdmin } from '../middleware/authMiddleware.js';
import { attachOrganizationContext, enforceTenantQuota } from '../middleware/planQuotaMiddleware.js';
import { wrappSuccessResult, processPagination, hashPassword } from '../utils/index.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';
import ACTIONS from '../utils/activityActions.js';
import { NotFound } from '../utils/errors/customErrors.js';
import logger from '../utils/logger.js';

const router = express.Router();

const tenantDto = Joi.object({
  id: Joi.string().optional(),
  _id: Joi.any().optional(),
  __v: Joi.any().optional(), // Add this to make MongoDB version field explicitly optional
  organization_id: Joi.number().required(),
  first_name: Joi.string().required(),
  last_name: Joi.string().required(),
  email: Joi.string().email().required(),
  phone: Joi.string().optional().allow(''),
  building_id: Joi.string().optional().allow(''),
  floor_id: Joi.string().optional().allow(''),
  suite_id: Joi.string().optional().allow(''),
  lease_id: Joi.string().optional().allow(null,''),
  lease_start_date: Joi.date().optional(),
  lease_end_date: Joi.date().optional(),
  status: Joi.string().valid('Active','Pending','Vacated','active','Expiring Soon').optional(),
  rent_due: Joi.number().optional(),
  rent_paid: Joi.number().optional(),
  last_payment_date: Joi.date().optional(),
  balance: Joi.number().optional(),
  created_at: Joi.date().optional(),
  updated_at: Joi.date().optional(),
  emergency_contact_name: Joi.string().optional().allow(''),
  emergency_contact_phone: Joi.string().optional().allow(''),
  preferred_contact: Joi.string().optional().allow(''),
  sms_opt_in: Joi.boolean().optional(),
  has_portal_access: Joi.boolean().optional(),
  use_tenant_id_as_password: Joi.boolean().optional().default(false),
  password: Joi.string().optional().allow(''),
  password_set: Joi.boolean().optional()
  ,
  // additional optional fields
  billing_address: Joi.string().optional().allow(''),
  secondary_email: Joi.string().email().optional().allow(''),
  occupants_count: Joi.number().optional(),
  guarantor_name: Joi.string().optional().allow(''),
  guarantor_phone: Joi.string().optional().allow(''),
  parking_spot: Joi.string().optional().allow(''),
  tags: Joi.array().items(Joi.string()).optional(),
  profile_image_url: Joi.string().uri().optional().allow(''),
  custom_metadata: Joi.any().optional(),
  created_by: Joi.string().optional().allow(''),
  updated_by: Joi.string().optional().allow('')
});

router.get('/', authenticateToken, attachOrganizationContext, async (req, res, next) => {
  try {
    const { skip, limit, sortQuery, queryFilter, page } = processPagination(req.query);
    const baseFilter = { organization_id: req.organization_id };
    const filter = { ...queryFilter, ...baseFilter };
    
  logger.info('Tenant list request', { filter, organization_id: req.organization_id });
    
    // Count total tenants
    const totalCount = await models.TenantsDB.countDocuments(baseFilter);
  logger.debug('Total tenants for organization', { organization_id: req.organization_id, total: totalCount });
    
    let items = await models.TenantsDB.find(filter).sort(sortQuery).skip(skip).limit(parseInt(limit)).lean();
  logger.debug('Found tenants matching filter', { count: items.length, filter });

    // Note: Removed server-side enrichment of `active_lease` to keep tenant objects raw.
    // The frontend computes active lease client-side via available leases when needed.

    // Return tenant items with raw building_id, floor_id and suite_id
    // Frontend will perform inline per-column requests to resolve names.
    
    // If pagination params are provided, return with metadata
    if (req.query.page || req.query.limit) {
      const totalPages = Math.ceil(totalCount / limit);
      res.status(200).send({
        success: true,
        data: items,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          totalPages: totalPages,
          hasMore: parseInt(page) < totalPages
        }
      });
    } else {
      // Backward compatibility: return just the items
      res.status(200).send(wrappSuccessResult(200, items));
    }
  } catch (error) { 
    logger.error('Error in tenant list endpoint', error);
    return next(error, req, res); 
  }
});

router.post('/', authenticateToken, attachOrganizationContext, verifyAdmin, enforceTenantQuota, logActivity(ACTIONS.TENANT_CREATE, 'TENANT', 'Tenant created'), async (req, res, next) => {
  try {
  console.log('=== SINGLE TENANT CREATE ===');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  logger.info('POST /tenants body', { body: req.body });
    
    // Generate a unique ID for new tenants if not provided
    const payload = { 
      ...req.body, 
      organization_id: req.organization_id,
      id: req.body.id || `tenant_${req.organization_id}_${Date.now()}`,
      // lease_id should be blank until a lease is applied
      lease_id: req.body.lease_id || null
    };
    
    console.log('🔍 Validating tenant...');
    // Skip validation for id field since we're generating it
    const { error, value } = tenantDto.validate(payload, { abortEarly: false });
    if (error) {
  console.log('❌ Validation failed:', error.details.map(d=>d.message));
  logger.warn('Tenant validation error', { details: error.details });
      return res.status(400).json({ error: error.details.map(d=>d.message) });
    }
    
    console.log('✅ Validation passed for:', value.first_name, value.last_name, value.email);
    
    // Create a new tenant using new
    // Password handling for portal access
    // If portal access is disabled, ensure password is cleared
    if (!value.has_portal_access) {
      delete value.password;
      value.password_set = false;
    } else {
      // Determine organization plan - only allow tenant-id-as-password when on 'pro' plan
      const organization = await models.OrganizationDB.findOne({ organization_id: req.organization_id }).lean();
      const planKey = (organization?.plan || req.user?.plan || 'starter').toString().toLowerCase();
      const isProPlan = planKey === 'pro';
      if (!isProPlan) {
        // force-disable tenant-id-as-password if org is not pro to prevent client spoofing
        value.use_tenant_id_as_password = false;
      }
      // If use_tenant_id_as_password is true (default), use tenant id as default password
      // Prefer explicit provided password when present
      let chosenPassword = null;
      if (value.password && String(value.password).trim() !== '') {
        chosenPassword = String(value.password).trim();
      } else if (value.use_tenant_id_as_password) {
        // use the id field (generated above) as default password
        chosenPassword = String(payload.id || value.id || '');
      } else {
        // fallback to email if nothing else
        chosenPassword = String(value.email || payload.email || '');
      }

      if (chosenPassword && chosenPassword !== '') {
        try {
          value.password = await hashPassword(chosenPassword);
          value.password_set = true;
        } catch (pwErr) {
          logger.warn('Failed to hash tenant password during create', pwErr && pwErr.message);
          delete value.password;
          value.password_set = false;
        }
      } else {
        // no usable password found
        delete value.password;
        value.password_set = false;
      }
    }

    const tenantModel = new models.TenantsDB(value);
    const created = await tenantModel.save();
  console.log('✅ Tenant created successfully:', created.id || created._id);
  logger.info('Tenant created', { id: created.id || created._id });
    
    res.status(201).send(wrappSuccessResult(201, created));
  } catch (error) { 
    console.error('💥 Error creating tenant:', error);
    logger.error('Error creating tenant', error);
    return next(error, req, res); 
  }
});

// Bulk create tenants - expects body: { tenants: [ {...}, {...} ] }
router.post('/batch', authenticateToken, attachOrganizationContext, verifyAdmin, logActivity(ACTIONS.TENANT_CREATE, 'TENANT', 'Bulk tenant create'), async (req, res, next) => {
  try {
    console.log('=== BULK TENANT IMPORT START ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const items = Array.isArray(req.body && req.body.tenants) ? req.body.tenants : null;
    if (!items || !items.length) {
      console.log('❌ No tenants array found in request body');
      return res.status(400).json({ message: 'tenants array required in request body' });
    }

    console.log(`📦 Received ${items.length} tenants to import`);
    const orgId = req.organization_id;
    console.log(`🏢 Organization ID: ${orgId}`);

    // Resolve effective tenant limit (reuse planSettings logic from middleware)
    const planSettingsModel = (await import('../models/registry.js')).getModel('plan_settings');
    const organization = await models.OrganizationDB.findOne({ organization_id: orgId });
    const planKey = (organization?.plan || req.user?.plan || 'starter').toString().toLowerCase();
    const planSettings = await planSettingsModel.findOne({ _id: planKey });
    console.log(`📋 Plan: ${planKey}`);

    let effectiveLimit;
    if (planSettings && Object.prototype.hasOwnProperty.call(planSettings, 'tenantLimit')) {
      if (planSettings.tenantLimit === null || planSettings.tenantLimit === undefined) {
        effectiveLimit = Infinity;
      } else {
        effectiveLimit = Number(planSettings.tenantLimit);
        if (Number.isNaN(effectiveLimit)) effectiveLimit = undefined;
      }
    }
    // Fallback to middleware's LIMITS if undefined
    if (effectiveLimit === undefined) {
      try {
        const { LIMITS } = await import('../middleware/planQuotaMiddleware.js');
        effectiveLimit = LIMITS?.[planKey] ?? LIMITS?.starter ?? 25;
      } catch (importErr) {
        console.warn('Failed to import LIMITS, using default:', importErr.message);
        // Hardcoded fallback limits
        const fallbackLimits = { free: 5, starter: 25, pro: 100, business: 500, enterprise: Infinity };
        effectiveLimit = fallbackLimits[planKey] ?? 25;
      }
    }

    console.log(`📊 Tenant limit: ${effectiveLimit === Infinity ? '∞' : effectiveLimit}`);

    if (!effectiveLimit || effectiveLimit <= 0) {
      console.log('❌ Plan does not allow creating tenants');
      return res.status(403).json({ message: 'Your plan does not allow creating tenants. Please upgrade.' });
    }

    const existingCount = await models.TenantsDB.countDocuments({ organization_id: orgId });
    console.log(`📈 Existing tenants: ${existingCount}`);
    
    if (existingCount + items.length > effectiveLimit) {
      console.log(`❌ Would exceed limit: ${existingCount} + ${items.length} > ${effectiveLimit}`);
      return res.status(403).json({ message: `Bulk import would exceed tenant limit for plan "${planKey}". Current: ${existingCount}, Attempting to add: ${items.length}, Limit: ${effectiveLimit === Infinity ? '∞' : effectiveLimit}` });
    }

    // Validate and prepare documents
    console.log('🔍 Validating tenants...');
    const prepared = items.map((it, idx) => {
      const payload = { ...it, organization_id: orgId, id: it.id || `tenant_${orgId}_${Date.now()}_${Math.floor(Math.random()*10000)}` };
      const { error, value } = tenantDto.validate(payload, { abortEarly: false });
      if (error) {
        console.log(`❌ Validation failed for tenant ${idx + 1}:`, error.details.map(d=>d.message));
        return { error: error.details.map(d=>d.message).join('; '), raw: it };
      }
      console.log(`✅ Tenant ${idx + 1} validated:`, value.first_name, value.last_name, value.email);
      return { value };
    });

    const errors = prepared.filter(p => p.error).map(p => p.error);
    if (errors.length) {
      console.log(`❌ ${errors.length} validation errors:`, errors);
      return res.status(400).json({ message: 'Validation failed for one or more tenants', errors });
    }

    const docs = prepared.map(p => p.value);
    console.log(`💾 Inserting ${docs.length} tenants into database...`);

    // Bulk insert - unordered so single bad doc won't stop others (validation already done)
    const inserted = await models.TenantsDB.insertMany(docs, { ordered: false });
    
    console.log(`✅ Successfully inserted ${inserted.length} tenants`);
    console.log('=== BULK TENANT IMPORT COMPLETE ===');

    res.status(201).send(wrappSuccessResult(201, { created: inserted.length, totalRequested: items.length }));
  } catch (err) { 
    console.error('💥 Bulk tenant import failed:', err);
    logger.error('Bulk tenant import failed', err); 
    return next(err, req, res); 
  }
});

router.put('/:id', authenticateToken, attachOrganizationContext, logActivity(ACTIONS.TENANT_UPDATE, 'TENANT', 'Tenant updated'), async (req, res, next) => {
  try {
    const paramId = req.params.id;
    let query = { organization_id: req.organization_id };
    
    // Check if the ID is a MongoDB ObjectId (24 character hex string)
    if (/^[0-9a-fA-F]{24}$/.test(paramId)) {
      // If using MongoDB _id
      query._id = paramId;
    } else {
      // If using custom id
      query.id = paramId;
    }

  // Clean up payload - make sure we don't try to update _id
  const payload = { ...req.body, organization_id: req.organization_id };
    
    // Remove MongoDB internal fields that shouldn't be updated
    delete payload.__v;
    delete payload._id; 
  // If the client included profile_image (handled via separate upload endpoints), remove it
  // to avoid Joi rejecting unknown keys and to prevent accidental overwrites of binary data.
  if (payload.profile_image) delete payload.profile_image;
  // keep profile_image_url so it can be updated via PUT (it's validated in DTO)
    
    // If we're using a MongoDB _id but there's an id field in the payload
    if (query._id && !payload.id && payload._id) {
      payload.id = payload._id; // Use _id as id if id is missing
    }
    
  // Validate the payload
  const { error, value } = tenantDto.fork(['id'], (s)=>s.optional()).validate(payload, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d=>d.message) });

  // Read the existing tenant so we can detect when the client sent back the old
  // email/id as the password (common when the frontend pre-fills password with
  // the previous default). If the incoming password equals the previous email
  // or id, treat it as "not provided" so changes to email will update the
  // password when using "email as password" behavior.
  const existingTenant = await models.TenantsDB.findOne(query).lean();
  if (!existingTenant) throw new NotFound('Tenant not found');
    
    // If updating password or enabling portal access with a provided password, hash it
    // Password handling on update
    if (Object.prototype.hasOwnProperty.call(value, 'has_portal_access') && !value.has_portal_access) {
      // Portal disabled -> clear password
      value.password = undefined;
      value.password_set = false;
    } else if (value.has_portal_access) {
      // Determine organization plan - only allow tenant-id-as-password when on 'pro' plan
      const org = await models.OrganizationDB.findOne({ organization_id: req.organization_id }).lean();
      const planKeyUpdate = (org?.plan || req.user?.plan || 'starter').toString().toLowerCase();
      const isProPlanUpdate = planKeyUpdate === 'pro';
      if (!isProPlanUpdate) {
        // ensure flag is ignored when org isn't pro
        value.use_tenant_id_as_password = false;
      }
      // Portal enabled -> determine password
      // Prefer explicit password, then use_tenant_id_as_password, then email
      // Consider whether the client truly provided a new explicit password. Some
      // frontends pre-fill the password input with the previous default (e.g. the
      // old email) which should *not* be treated as an explicit override.
      const providedPwRaw = value.password && String(value.password).trim() !== '' ? String(value.password).trim() : null;
      const explicitlyProvided = providedPwRaw && providedPwRaw !== String(existingTenant.email || '') && providedPwRaw !== String(existingTenant.id || '') && providedPwRaw !== String(existingTenant._id || '');

      let chosenPassword = null;
      if (explicitlyProvided) {
        chosenPassword = providedPwRaw;
      } else if (Object.prototype.hasOwnProperty.call(value, 'use_tenant_id_as_password') ? value.use_tenant_id_as_password : false) {
        // Use tenant id from existing record (we already loaded it)
        const existingId = existingTenant.id || existingTenant._id;
        chosenPassword = String(existingId || value.email || existingTenant.email || '');
      } else {
        // Prefer the updated email if provided, otherwise fallback to existing
        chosenPassword = String(value.email || existingTenant.email || '');
      }

      if (chosenPassword && chosenPassword !== '') {
        try {
          value.password = await hashPassword(chosenPassword);
          value.password_set = true;
        } catch (pwErr) {
          logger.warn('Failed to hash tenant password during update', pwErr && pwErr.message);
          delete value.password;
          value.password_set = false;
        }
      } else {
        // nothing to set
        delete value.password;
        value.password_set = false;
      }
    }

    // Update the tenant
    await models.TenantsDB.updateOne(query, { $set: value });
    
    // Get the updated tenant
    const updated = await models.TenantsDB.findOne(query).lean();
    if (!updated) throw new NotFound('Tenant not found');
    
    res.status(200).send(wrappSuccessResult(200, updated));
  } catch (error) { return next(error, req, res); }
});

router.get('/:id', authenticateToken, attachOrganizationContext, async (req, res, next) => {
  try {
    const paramId = req.params.id;
    if (!paramId) throw new NotFound('Id not provided');

    let query = { organization_id: req.organization_id };
    
    // Check if the ID is a MongoDB ObjectId (24 character hex string)
    if (/^[0-9a-fA-F]{24}$/.test(paramId)) {
      // If using MongoDB _id
      query._id = paramId;
    } else {
      // If using custom id
      query.id = paramId;
    }

    const item = await models.TenantsDB.findOne(query).lean();
    if (!item) throw new NotFound('Tenant not found');
    res.status(200).send(wrappSuccessResult(200, item));
  } catch (error) { return next(error, req, res); }
});

// Return building/floor/suite for a tenant by tenant id (useful for frontend column lookups)
router.get('/:id/locations', authenticateToken, attachOrganizationContext, async (req, res, next) => {
  try {
    const paramId = req.params.id;
    if (!paramId) throw new NotFound('Id not provided');

    let query = { organization_id: req.organization_id };
    if (/^[0-9a-fA-F]{24}$/.test(paramId)) query._id = paramId; else query.id = paramId;

    const tenant = await models.TenantsDB.findOne(query).lean();
    if (!tenant) throw new NotFound('Tenant not found');

    // Resolve building, floor, suite by their id fields (support both id and _id storage)
    const resolveById = async (Model, value) => {
      if (!value) return null;
      // try by id field first, then by _id
      let found = await Model.findOne({ organization_id: req.organization_id, id: value }).lean();
      if (found) return found;
      // If value looks like an ObjectId, try _id
      if (/^[0-9a-fA-F]{24}$/.test(String(value))) {
        found = await Model.findOne({ organization_id: req.organization_id, _id: value }).lean();
        if (found) return found;
      }
      // fallback: try matching as string to _id as well
      found = await Model.findOne({ organization_id: req.organization_id, _id: String(value) }).lean();
      return found || null;
    };

    // Use registry getModel for collections that may not be explicitly exported in models/index
    const BuildingsModel = getModel('buildings');
    const FloorsModel = getModel('floors');
    const SuitesModel = getModel('suites');

    const [building, floor, suite] = await Promise.all([
      resolveById(BuildingsModel, tenant.building_id || tenant.unit_id || tenant.building),
      resolveById(FloorsModel, tenant.floor_id),
      resolveById(SuitesModel, tenant.suite_id || tenant.unit_id)
    ]);

    // Find any lease that references this tenant by tenant_id (no status/date filtering)
    // Prefer the most recent lease (by lease_end, falling back to lease_start)
    let lease = null;
    try {
      const tenantIds = [];
      if (tenant.id) tenantIds.push(String(tenant.id));
      if (tenant._id) tenantIds.push(String(tenant._id));

      if (tenantIds.length) {
        // Find leases that have tenant_id equal to any of the tenant identifiers
        const candidates = await models.LeasesDB.find({ organization_id: req.organization_id, tenant_id: { $in: tenantIds } }).lean();
        if (Array.isArray(candidates) && candidates.length) {
          // Sort by lease_end (most recent end first), fallback to lease_start, then createdAt
          candidates.sort((a, b) => {
            const aKey = a.lease_end ? new Date(a.lease_end).getTime() : (a.lease_start ? new Date(a.lease_start).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0));
            const bKey = b.lease_end ? new Date(b.lease_end).getTime() : (b.lease_start ? new Date(b.lease_start).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0));
            return bKey - aKey; // descending (most recent first)
          });
          lease = candidates[0];
        }
      }
    } catch (leaseErr) {
      logger.warn('Failed to resolve lease for tenant locations', leaseErr && leaseErr.message);
      lease = null;
    }

    res.status(200).send(wrappSuccessResult(200, { building, floor, suite, lease }));
  } catch (error) { return next(error, req, res); }
});

router.delete('/:id', authenticateToken, attachOrganizationContext, logActivity(ACTIONS.TENANT_DELETE, 'TENANT', 'Tenant deleted'), async (req, res, next) => {
  try {
    const paramId = req.params.id;
    if (!paramId) throw new NotFound('Id not provided');

    let query = { organization_id: req.organization_id };
    
    // Check if the ID is a MongoDB ObjectId (24 character hex string)
    if (/^[0-9a-fA-F]{24}$/.test(paramId)) {
      // If using MongoDB _id
      query._id = paramId;
    } else {
      // If using custom id
      query.id = paramId;
    }

    const result = await models.TenantsDB.deleteOne(query);
    if (result.deletedCount === 0) throw new NotFound('Tenant not found');
    res.status(200).send(wrappSuccessResult(200, { ok: true }));
  } catch (error) { return next(error, req, res); }
});

const configure = (app) => {
  app.use('/tenants', router);
  app.use('/api/tenants', router);
};

export default configure;
