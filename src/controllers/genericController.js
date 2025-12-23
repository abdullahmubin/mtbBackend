import express from 'express';
import makeService from '../services/genericService.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { attachOrganizationContext } from '../middleware/planQuotaMiddleware.js';
import { wrappSuccessResult } from '../utils/index.js';
import redisClient from '../utils/redisClient.js';
import { getModel } from '../models/registry.js';
import logger from '../utils/logger.js';

export function makeController(collection) {
  const router = express.Router();
  const service = makeService(collection);

  // If this is the public marketing contact collection, allow anonymous POSTs
  // Mount the public POST handler before auth middleware so it is reachable
  if (collection === 'contact_messages') {
    router.post('/', async (req, res, next) => {
      try {
        const body = req.body || {};
        // Marketing submissions are anonymous; attach a default organization so
        // admin listings (which filter by organization_id) can find these messages.
        const data = { ...body, organization_id: body.organization_id || 1 };
        const created = await service.create(data);
        res.status(201).send(wrappSuccessResult(201, created));
      } catch (e) { next(e); }
    });
  }

  // Enforce auth and organization context for the remaining routes
  router.use(authenticateToken);
  router.use(attachOrganizationContext);

  // list
  router.get('/', async (req, res, next) => {
    try {
      // Always filter by the authenticated user's organization_id
      const { limit, skip } = req.query;

      // Default to organization scope
      let filter = { organization_id: req.organization_id };

      // For these collections, prefer returning only resources that are actually
      // referenced by tenants in the organization (avoid returning the entire set).
      // This improves UX when tenant records control which floors/suites/buildings are relevant.
      try {
        if (['suites', 'floors', 'buildings', 'leases'].includes(collection)) {
          const Tenants = getModel('tenants');
          const tenantRecords = await Tenants.find({ organization_id: req.organization_id }, { suite_id: 1, floor_id: 1, id: 1 }).lean();

          if (!tenantRecords || tenantRecords.length === 0) {
            // No tenants -> return empty list for these collections
            return res.status(200).send(wrappSuccessResult(200, []));
          }

          const suiteIds = Array.from(new Set(tenantRecords.map(t => t.suite_id).filter(Boolean)));
          const floorIds = Array.from(new Set(tenantRecords.map(t => t.floor_id).filter(Boolean)));
          const tenantIds = Array.from(new Set(tenantRecords.map(t => t.id || t._id).filter(Boolean)));

          if (collection === 'suites') {
            const orClauses = [];
            if (suiteIds.length) orClauses.push({ id: { $in: suiteIds } });
            if (floorIds.length) orClauses.push({ floor_id: { $in: floorIds } });
            if (orClauses.length === 0) return res.status(200).send(wrappSuccessResult(200, []));
            filter = { organization_id: req.organization_id, $or: orClauses };
          }

          if (collection === 'floors') {
            let floorIdsFinal = floorIds.slice();
            if (floorIdsFinal.length === 0 && suiteIds.length) {
              const Suites = getModel('suites');
              const suites = await Suites.find({ organization_id: req.organization_id, id: { $in: suiteIds } }, { floor_id: 1 }).lean();
              floorIdsFinal = Array.from(new Set(suites.map(s => s.floor_id).filter(Boolean)));
            }
            if (floorIdsFinal.length === 0) return res.status(200).send(wrappSuccessResult(200, []));
            filter = { organization_id: req.organization_id, id: { $in: floorIdsFinal } };
          }

          if (collection === 'buildings') {
            // Need to derive building ids from floor ids (or from suites -> floors -> buildings)
            let floorIdsForBuildings = floorIds.slice();
            if (floorIdsForBuildings.length === 0 && suiteIds.length) {
              const Suites = getModel('suites');
              const suites = await Suites.find({ organization_id: req.organization_id, id: { $in: suiteIds } }, { floor_id: 1 }).lean();
              floorIdsForBuildings = Array.from(new Set(suites.map(s => s.floor_id).filter(Boolean)));
            }
            if (floorIdsForBuildings.length === 0) return res.status(200).send(wrappSuccessResult(200, []));
            const Floors = getModel('floors');
            const floors = await Floors.find({ organization_id: req.organization_id, id: { $in: floorIdsForBuildings } }, { building_id: 1 }).lean();
            const buildingIds = Array.from(new Set(floors.map(f => f.building_id).filter(Boolean)));
            if (buildingIds.length === 0) return res.status(200).send(wrappSuccessResult(200, []));
            filter = { organization_id: req.organization_id, id: { $in: buildingIds } };
          }

          if (collection === 'leases') {
            const orClauses = [];
            if (tenantIds.length) orClauses.push({ tenant_id: { $in: tenantIds } });
            // if (suiteIds.length) orClauses.push({ unit_id: { $in: suiteIds } });
            if (orClauses.length === 0) return res.status(200).send(wrappSuccessResult(200, []));
            filter = { organization_id: req.organization_id, $or: orClauses };
          }
        }
      } catch (err) {
        // If anything fails while attempting tenant-driven filtering, log and fall back
        // to the default org-scoped listing to avoid breaking API.
        logger && logger.warn && logger.warn('Tenant-driven filtering failed, falling back to org-scoped list', { collection, err: err && err.message });
        filter = { organization_id: req.organization_id };
      }

      const data = await service.list(filter, { limit: Number(limit) || 500, skip: Number(skip) || 0 });
      res.status(200).send(wrappSuccessResult(200, data));
    } catch (e) { next(e); }
  });

  // get by id
  router.get('/:id', async (req, res, next) => {
    try {
      // Add organization_id filter to ensure data isolation between organizations
      const data = await service.getByIdAndOrgId(req.params.id, req.organization_id);
      if (!data) return res.status(404).json({ 
        status: "Error", 
        statusCode: 404, 
        message: "Resource not found",
        error: 'Not found' 
      });
      res.status(200).send(wrappSuccessResult(200, data));
    } catch (e) { next(e); }
  });

  // create
  router.post('/', async (req, res, next) => {
    try {
      // Ensure organization_id is set on all created items
      const dataWithOrgId = { ...req.body, organization_id: req.organization_id };

      // Enforce canonical class_name fields and name fallbacks for building/floor/suite collections
      const coll = collection;
      if(['suites','buildings','floors'].includes(coll)){
        // add a canonical class_name to avoid column drift
        dataWithOrgId.class_name = dataWithOrgId.class_name || coll.slice(0, -1); // 'suite'|'building'|'floor'
        // for suites, ensure human label 'name' exists by copying suite_number if missing
        if(coll === 'suites'){
          if((dataWithOrgId.name === undefined || dataWithOrgId.name === null || dataWithOrgId.name === '') && dataWithOrgId.suite_number){
            dataWithOrgId.name = String(dataWithOrgId.suite_number);
          }
          // Require a floor_id on create to avoid creating orphan suites or accidental duplicates
          if(!dataWithOrgId.floor_id){
            return res.status(400).json({ status: 'Error', statusCode: 400, message: 'floor_id is required when creating a suite', error: 'floor_id missing' });
          }
        }
      }
      const created = await service.create(dataWithOrgId);
      if (created && created.__duplicate) {
        // Provide a clearer, user-friendly message for suite duplicates; keep generic fallback for other collections
  if (coll === 'suites') {
          const r = created.record || {};
          return res.status(409).json({
            status: 'Error',
            statusCode: 409,
            message: 'A suite with the same number/name already exists for the specified floor and organization.',
            error: 'duplicate_suite',
            conflict: {
              id: r.id || r._id,
              name: r.name,
              suite_number: r.suite_number,
              floor_id: r.floor_id,
              organization_id: r.organization_id
            },
            suggestion: 'If you intended to modify the existing suite, call PUT /suites/:id with the existing suite id; otherwise choose a different suite_number.'
          });
        }
        if (coll === 'floors') {
          const r = created.record || {};
          return res.status(409).json({
            status: 'Error',
            statusCode: 409,
            message: 'A floor with the same number already exists for the specified building and organization.',
            error: 'duplicate_floor',
            conflict: {
              id: r.id || r._id,
              name: r.name,
              floor_number: r.floor_number,
              building_id: r.building_id,
              organization_id: r.organization_id
            },
            suggestion: 'If you intended to modify the existing floor, call PUT /floors/:id with the existing floor id; otherwise choose a different floor_number.'
          });
        }
        if (coll === 'buildings') {
          const r = created.record || {};
          return res.status(409).json({
            status: 'Error',
            statusCode: 409,
            message: 'A building with the same name already exists for the specified organization.',
            error: 'duplicate_building',
            conflict: {
              id: r.id || r._id,
              name: r.name,
              organization_id: r.organization_id
            },
            suggestion: 'If you intended to modify the existing building, call PUT /buildings/:id with the existing building id; otherwise choose a different name.'
          });
        }
        return res.status(409).json({ status: 'Error', statusCode: 409, message: 'Duplicate resource', conflict: created.record });
      }
      // If this collection maps to user-visible notifications (e.g., sms_messages, announcements)
      try {
        const coll = collection;
        if(['sms_messages','announcements'].includes(coll)){
          const Notifications = getModel('notifications');
          // Determine recipients carefully: if a tenant authored the item, target admins only
          let recipients = null;
          if (created.to_tenant_id) {
            recipients = { tenant_ids: [created.to_tenant_id] };
          } else if (created.recipients && created.recipients !== undefined) {
            recipients = created.recipients;
          } else if (created.role === 'tenant' || created.sender_tenant_id) {
            try {
              const Users = getModel('users');
              const admins = await Users.find({ organization_id: created.organization_id, role: { $in: ['admin', 'clientadmin'] } }, { id: 1 }).lean();
                  if (admins && admins.length) recipients = { user_ids: admins.map(a => String(a.id || a._id)) };
              else {
                logger.warn('No admin users found to target tenant-originated notification for org', { organization_id: created.organization_id });
                recipients = { user_ids: [] };
              }
            } catch (err) {
              logger.warn('Failed to resolve admin recipients for generic notification', err);
              recipients = { user_ids: [] };
            }
          } else {
            recipients = 'all';
          }

          const notif = await Notifications.create({
            organization_id: created.organization_id,
            type: coll === 'sms_messages' ? 'sms' : 'announcement',
            title: created.subject || created.title || (created.text||'').slice(0,80) || coll,
            body: created.body || created.text || created.message || '',
            created_at: created.created_at || created.createdAt || new Date(),
            source: { collection: coll, _id: created._id },
            recipients
          });
            if(redisClient && redisClient.isReady){
            try{ await redisClient.publish('notifications', JSON.stringify({ type:'notification.created', record:{ id:String(notif._id), organization_id: notif.organization_id, type: notif.type, title: notif.title, created_at: notif.created_at } })); }catch(e){ logger.warn('Redis publish failed', e); }
          }
          // mark as read for creator so they don't get an unread notification for their own action
          try{
            const NotificationReads = getModel('notification_reads');
              if(req.user && req.user.id){
              const now = new Date();
              await NotificationReads.updateOne({ notification_id: String(notif._id), user_id: String(req.user.id), organization_id: notif.organization_id }, { $set: { read_at: now } }, { upsert: true });
              // publish read event for realtime subscribers so frontends can update badge immediately
              if(redisClient && redisClient.isReady){
                try{ await redisClient.publish('notifications', JSON.stringify({ type: 'notification.read', record: { notification_id: String(notif._id), user_id: req.user.id, organization_id: notif.organization_id, read_at: now } })); }catch(e){ logger.warn('Redis publish failed for creator read', e); }
              }
            }
          }catch(e){ logger.warn('Failed to mark notification read for creator', e); }
        }
  } catch(e){ logger.warn('Failed to create notification for generic create', e); }

      res.status(201).send(wrappSuccessResult(201, created));
    } catch (e) { next(e); }
  });

  // update
  router.put('/:id', async (req, res, next) => {
    try {
      // Enforce organization_id on updates and only allow updates to records in the user's org
      const dataWithOrgId = { ...req.body, organization_id: req.organization_id };
      const coll = collection;
      if(['suites','buildings','floors'].includes(coll)){
        dataWithOrgId.class_name = dataWithOrgId.class_name || coll.slice(0, -1);
        if(coll === 'suites'){
          if((dataWithOrgId.name === undefined || dataWithOrgId.name === null || dataWithOrgId.name === '') && dataWithOrgId.suite_number){
            dataWithOrgId.name = String(dataWithOrgId.suite_number);
          }
          // If an update attempts to set floor_id to an empty value, reject it.
          if(Object.prototype.hasOwnProperty.call(dataWithOrgId, 'floor_id') && !dataWithOrgId.floor_id){
            return res.status(400).json({ status: 'Error', statusCode: 400, message: 'floor_id cannot be empty for suites', error: 'invalid floor_id' });
          }
        }
      }
      const updated = await service.updateWithOrgId(req.params.id, dataWithOrgId, req.organization_id);
      if (updated && updated.__duplicate) {
        if (coll === 'suites') {
          const r = updated.record || {};
          return res.status(409).json({
            status: 'Error',
            statusCode: 409,
            message: 'Update would create a duplicate suite: a different suite with the same number/name already exists on the target floor.',
            error: 'duplicate_suite',
            conflict: {
              id: r.id || r._id,
              name: r.name,
              suite_number: r.suite_number,
              floor_id: r.floor_id,
              organization_id: r.organization_id
            },
            suggestion: 'Change the suite_number/name or update the existing suite by its id if you intended to modify it.'
          });
        }
        if (coll === 'floors') {
          const r = updated.record || {};
          return res.status(409).json({
            status: 'Error',
            statusCode: 409,
            message: 'Update would create a duplicate floor: a different floor with the same number already exists on the target building.',
            error: 'duplicate_floor',
            conflict: {
              id: r.id || r._id,
              name: r.name,
              floor_number: r.floor_number,
              building_id: r.building_id,
              organization_id: r.organization_id
            },
            suggestion: 'Change the floor_number or update the existing floor by its id if you intended to modify it.'
          });
        }
        if (coll === 'buildings') {
          const r = updated.record || {};
          return res.status(409).json({
            status: 'Error',
            statusCode: 409,
            message: 'Update would create a duplicate building: a different building with the same name already exists in this organization.',
            error: 'duplicate_building',
            conflict: {
              id: r.id || r._id,
              name: r.name,
              organization_id: r.organization_id
            },
            suggestion: 'Change the building name or update the existing building by its id if you intended to modify it.'
          });
        }
        return res.status(409).json({ status: 'Error', statusCode: 409, message: 'Update would conflict with existing resource', conflict: updated.record });
      }
      if (!updated) return res.status(404).json({ 
        status: "Error", 
        statusCode: 404, 
        message: "Resource not found or unauthorized", 
        error: 'Not found or not authorized to update this record' 
      });
      res.status(200).send(wrappSuccessResult("update", updated));
    } catch (e) { next(e); }
  });

  // delete
  router.delete('/:id', async (req, res, next) => {
    try {
  // Log incoming delete request for debugging
  logger.info('[genericController] delete request', { collection, id: req.params.id, org: req.organization_id, user: req.user?.id });
  // Only allow deletion of records in the user's organization
  const result = await service.removeWithOrgId(req.params.id, req.organization_id);
      if (result.deletedCount === 0) {
        return res.status(404).json({
          status: "Error", 
          statusCode: 404, 
          message: "Resource not found or unauthorized",
          error: 'Not found or not authorized to delete this record'
        });
      }
      res.status(200).send(wrappSuccessResult("deleted", { ok: true }));
    } catch (e) { next(e); }
  });

  return router;
}

// Only export as default, avoid multiple exports
export default makeController;
