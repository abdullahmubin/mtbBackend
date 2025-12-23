import express from 'express';
import Joi from 'joi';
import models from '../models/index.js';
import mongoose from 'mongoose';
import { authenticateToken, verifyAdmin } from '../middleware/authMiddleware.js';
import { attachOrganizationContext } from '../middleware/planQuotaMiddleware.js';
import { wrappSuccessResult, processPagination } from '../utils/index.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';
import ACTIONS from '../utils/activityActions.js';
import { createContract, findContractByLeaseId, updateContractByLeaseId } from '../services/contractsService.js';

const router = express.Router();

const leaseDto = Joi.object({
  id: Joi.number().required(),
  organization_id: Joi.number().required(),
  tenant_id: Joi.string().required(),
  unit_id: Joi.string().optional(),
  lease_start: Joi.date().required(),
  lease_end: Joi.date().required(),
  rent_amount: Joi.number().required(),
  due_day: Joi.number().integer().min(1).max(28).optional(),
  grace_period_days: Joi.number().integer().min(0).max(31).optional(),
  late_fee_flat: Joi.number().optional(),
  late_fee_percent: Joi.number().optional(),
  security_deposit_amount: Joi.number().optional(),
  recurring_charges: Joi.array().items(Joi.object({ 
    code: Joi.string(), 
    name: Joi.string(), 
    amount: Joi.number(), 
    frequency: Joi.string(),
    _id: Joi.string().optional() // Allow MongoDB auto-generated _id
  })).optional(),
  status: Joi.string().valid('Active','Expired','Pending','Terminated').optional(),
  reason: Joi.string().optional().allow('', null),
  terminated_at: Joi.date().optional(),
  terminated_by: Joi.string().optional()
});

router.get('/', authenticateToken, attachOrganizationContext, async (req, res, next) => {
  try {
    const { skip, limit, sortQuery, queryFilter, page } = processPagination(req.query);
    const filter = { ...queryFilter, organization_id: req.organization_id };
    
    // If pagination params are provided, return paginated response with metadata
    if (req.query.page || req.query.limit) {
      const totalCount = await models.LeasesDB.countDocuments(filter);
      const items = await models.LeasesDB.find(filter).sort(sortQuery).skip(skip).limit(parseInt(limit)).lean();
      const totalPages = Math.ceil(totalCount / parseInt(limit));
      
      return res.status(200).json({
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
    }
    
    // Otherwise return all items for backward compatibility
    const items = await models.LeasesDB.find(filter).sort(sortQuery).skip(skip).limit(parseInt(limit)).lean();
    res.status(200).send(wrappSuccessResult(200, items));
  } catch (error) { return next(error, req, res); }
});

router.post('/', authenticateToken, attachOrganizationContext, verifyAdmin, logActivity(ACTIONS.LEASE_CREATE, 'LEASE', 'Lease created'), async (req, res, next) => {
  try {
  const payload = { ...req.body, organization_id: req.organization_id };
  const { error, value } = leaseDto.validate(payload, { abortEarly: false });
    if (error) return res.status(400).json({ error: error.details.map(d=>d.message) });
  // If the incoming lease will be Active, reject when any existing Active lease overlaps the requested dates
  if (value.unit_id) {
    const incomingStatus = value.status ? String(value.status) : 'Active';
    if (incomingStatus === 'Active') {
      // Treat both Active and Pending as blocking statuses
      const overlapFilter = {
        organization_id: req.organization_id,
        unit_id: value.unit_id,
        status: { $in: ['Active','Pending'] },
        // end-exclusive: existingStart < newEnd AND existingEnd > newStart
        $and: [
          { lease_start: { $lt: new Date(value.lease_end) } },
          { lease_end: { $gt: new Date(value.lease_start) } }
        ]
      };
      const overlaps = await models.LeasesDB.find(overlapFilter).lean();
      if (overlaps.length > 0) {
        return res.status(400).json({ error: `Cannot create Active lease: unit ${value.unit_id} already has an overlapping lease (Active/Pending).`, overlaps });
      }
    }
  }

  await models.LeasesDB.updateOne({ id: value.id, organization_id: req.organization_id }, { $set: value }, { upsert: true });
  const created = await models.LeasesDB.findOne({ id: value.id, organization_id: req.organization_id }).lean();
    
    // Auto-create contract from lease
    try {
      // Get tenant information for contract title
      let tenantName = 'Unknown Tenant';
      try {
        const tenant = await models.TenantsDB.findOne({ id: value.tenant_id, organization_id: req.organization_id }).lean();
        if (tenant) {
          tenantName = `${tenant.first_name || ''} ${tenant.last_name || ''}`.trim();
        }
      } catch (e) {
        console.warn('Could not fetch tenant for contract creation:', e.message);
      }
      
      const contractPayload = {
        organization_id: req.organization_id,
        tenant_id: value.tenant_id,
        title: `Lease Agreement - ${tenantName}`,
        effective_date: value.lease_start,
        expiry_date: value.lease_end,
        status: value.status === 'Active' ? 'active' : (value.status === 'Pending' ? 'draft' : 'active'),
        auto_renew: false,
        // Link back to lease for reference
        lease_id: value.id
      };
      
      await createContract(contractPayload);
      console.log(`Auto-created contract for lease ${value.id}`);
    } catch (contractError) {
      console.error('Failed to auto-create contract from lease:', contractError);
      // Don't fail the lease creation if contract creation fails
    }
    
    res.status(201).send(wrappSuccessResult(201, created));
  } catch (error) { return next(error, req, res); }
});

router.put('/:id', authenticateToken, attachOrganizationContext, verifyAdmin, logActivity(ACTIONS.LEASE_UPDATE, 'LEASE', 'Lease updated'), async (req, res, next) => {
  try {
    const rawId = req.params.id;
    const idNum = Number(rawId);
    // Validate payload without forcing id into the body (id is optional for validation)
    const payloadToValidate = { ...req.body, organization_id: req.organization_id };
    const { error, value } = leaseDto.fork(['id'], (s)=>s.optional()).validate(payloadToValidate, { abortEarly: false });
    if (error) return res.status(400).json({ error: error.details.map(d=>d.message) });
  // If the updated lease will be Active, reject when any other existing Active lease overlaps the requested dates
    if (value.unit_id) {
      const incomingStatus = value.status ? String(value.status) : 'Active';
      if (incomingStatus === 'Active') {
        // Treat both Active and Pending as blocking statuses
        const overlapFilter = {
          organization_id: req.organization_id,
          unit_id: value.unit_id,
          id: { $ne: Number.isNaN(idNum) ? rawId : idNum },
          status: { $in: ['Active','Pending'] },
          // end-exclusive: existingStart < newEnd AND existingEnd > newStart
          $and: [
            { lease_start: { $lt: new Date(value.lease_end) } },
            { lease_end: { $gt: new Date(value.lease_start) } }
          ]
        };
        const overlaps = await models.LeasesDB.find(overlapFilter).lean();
        if (overlaps.length > 0) {
          return res.status(400).json({ error: `Cannot update to Active: unit ${value.unit_id} already has an overlapping lease (Active/Pending).`, overlaps });
        }
      }
    }

    // Perform update: try numeric id (Mongoose) first; otherwise use raw collection update to avoid casting errors
    let updated = null;
    if (!Number.isNaN(idNum)) {
      await models.LeasesDB.updateOne({ id: idNum, organization_id: req.organization_id }, { $set: value });
      updated = await models.LeasesDB.findOne({ id: idNum, organization_id: req.organization_id }).lean();
    } else {
      // Try update by string id field via collection (bypass Mongoose casting)
      let collRes = { matchedCount: 0 };
      try {
        collRes = await models.LeasesDB.collection.updateOne({ id: rawId, organization_id: req.organization_id }, { $set: value });
      } catch (e) {
        collRes = { matchedCount: 0 };
      }
      if (collRes.matchedCount && collRes.matchedCount > 0) {
        updated = await models.LeasesDB.collection.findOne({ id: rawId, organization_id: req.organization_id });
      } else if (mongoose.Types.ObjectId.isValid(String(rawId))) {
        try {
          const oid = new mongoose.Types.ObjectId(String(rawId));
          const collRes2 = await models.LeasesDB.collection.updateOne({ _id: oid, organization_id: req.organization_id }, { $set: value });
          if (collRes2.matchedCount && collRes2.matchedCount > 0) {
            updated = await models.LeasesDB.collection.findOne({ _id: oid, organization_id: req.organization_id });
          }
        } catch (e) {
          // ignore
        }
      }
    }

    if (!updated) return res.status(404).json({ error: `Lease not found: ${String(req.params.id)}` });
    // If updated came from the raw collection it may be a BSON doc; normalize to plain object
    if (updated && updated._id && typeof updated.toObject === 'function') updated = updated.toObject();
    
    // Sync contract with lease updates
    try {
      // Get tenant information for contract title
      let tenantName = 'Unknown Tenant';
      try {
        const tenant = await models.TenantsDB.findOne({ id: updated.tenant_id, organization_id: req.organization_id }).lean();
        if (tenant) {
          tenantName = `${tenant.first_name || ''} ${tenant.last_name || ''}`.trim();
        }
      } catch (e) {
        console.warn('Could not fetch tenant for contract sync:', e.message);
      }
      
      const contractPayload = {
        tenant_id: updated.tenant_id,
        title: `Lease Agreement - ${tenantName}`,
        effective_date: updated.lease_start,
        expiry_date: updated.lease_end,
        status: updated.status === 'Active' ? 'active' : 
                updated.status === 'Expired' ? 'expired' : 
                updated.status === 'Terminated' ? 'archived' : 'draft'
      };
      
      // Check if contract exists for this lease
      const existingContract = await findContractByLeaseId(updated.id, req.organization_id);
      
      if (existingContract) {
        // Update existing contract
        await updateContractByLeaseId(updated.id, req.organization_id, contractPayload);
        console.log(`Updated contract for lease ${updated.id}`);
      } else {
        // Create new contract
        const newContractPayload = {
          ...contractPayload,
          organization_id: req.organization_id,
          lease_id: updated.id,
          auto_renew: false
        };
        await createContract(newContractPayload);
        console.log(`Created contract for lease ${updated.id}`);
      }
    } catch (contractError) {
      console.error('Failed to sync contract with lease update:', contractError);
      // Don't fail the lease update if contract sync fails
    }
    
    res.status(200).send(wrappSuccessResult(200, updated));
  } catch (error) { return next(error, req, res); }
});

router.delete('/:id', authenticateToken, attachOrganizationContext, verifyAdmin, logActivity(ACTIONS.LEASE_DELETE, 'LEASE', 'Lease deleted'), async (req, res, next) => {
  try {
  const rawId = req.params.id;
  // Try numeric id first, then string id field, then fallback to _id (if possible).
  let result = { deletedCount: 0 };
  const idNum = Number(rawId);
  try {
    if (!Number.isNaN(idNum)) {
      result = await models.LeasesDB.deleteOne({ id: idNum, organization_id: req.organization_id });
    } else {
      // Use raw collection delete to avoid Mongoose casting when id field is defined as Number
      try {
        result = await models.LeasesDB.collection.deleteOne({ id: rawId, organization_id: req.organization_id });
      } catch (e) {
        // If collection-level delete failed, fall back to zero
        result = { deletedCount: 0 };
      }

      if (!result || result.deletedCount === 0) {
        // Fallback: try by Mongo _id string if it looks like an ObjectId
        if (mongoose.Types.ObjectId.isValid(String(rawId))) {
          try {
            result = await models.LeasesDB.collection.deleteOne({ _id: new mongoose.Types.ObjectId(String(rawId)), organization_id: req.organization_id });
          } catch (e) {
            result = { deletedCount: 0 };
          }
        }
      }
    }
  } catch (err) {
    return next(err, req, res);
  }

  if (!result || result.deletedCount === 0) {
    return res.status(404).json({ error: `Lease not found: ${String(rawId)}` });
  }

  res.status(200).send(wrappSuccessResult(200, { ok: true }));
  } catch (error) { return next(error, req, res); }
});

const configure = (app) => {
  app.use('/leases', router);
  app.use('/api/leases', router);
};

export default configure;
