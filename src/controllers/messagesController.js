import express from 'express';
import makeService from '../services/genericService.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { attachOrganizationContext } from '../middleware/planQuotaMiddleware.js';
import { wrappSuccessResult } from '../utils/index.js';
import redisClient from '../utils/redisClient.js';
import { getModel } from '../models/registry.js';
import logger from '../utils/logger.js';

export function makeMessagesController() {
  const router = express.Router();
  const service = makeService('messages');

  // Enforce auth and organization context for all routes
  router.use(authenticateToken);
  router.use(attachOrganizationContext);

  // list
  router.get('/', async (req, res, next) => {
    try {
      // Always filter by the authenticated user's organization_id
      const filter = { organization_id: req.organization_id };
      
      // For tenants, only show messages that are:
      // 1. Messages they sent
      // 2. Messages sent to them specifically (to_tenant_id === their tenant_id)
      // 3. Broadcast messages from admin (no to_tenant_id)
      if (req.user.role === 'tenant') {
        logger.info('Tenant requesting messages', { tenant_id: req.user.tenant_id });
        
        filter.$or = [
          { sender_user_id: req.user.id },
          { sender_tenant_id: req.user.tenant_id },
          // Use MongoDB's $eq operator with string conversion for consistent comparison
          { $expr: { $eq: [{ $toString: "$to_tenant_id" }, { $toString: req.user.tenant_id }] } },
          { role: 'admin', to_tenant_id: { $exists: false } },
          { role: 'clientadmin', to_tenant_id: { $exists: false } },
          { role: 'admin', to_tenant_id: null },
          { role: 'clientadmin', to_tenant_id: null }
        ];
        
  logger.debug('Message filter for tenant', { filter });
      }
      
      const { limit, skip } = req.query;
      const data = await service.list(filter, { limit: Number(limit) || 500, skip: Number(skip) || 0 });
      res.status(200).send(wrappSuccessResult(200, data));
    } catch (e) { 
      logger.error('Error fetching messages', e);
      next(e); 
    }
  });

  // get by id
  router.get('/:id', async (req, res, next) => {
    try {
      // Add organization_id filter to ensure data isolation between organizations
      const data = await service.getByIdAndOrgId(req.params.id, req.organization_id);
      if (!data) return res.status(404).json({ 
        status: "Error", 
        statusCode: 404, 
        message: "Message not found", 
        error: 'Not found' 
      });
      
      // For tenants, verify this message is visible to them
      if (req.user.role === 'tenant') {
        const isSender = data.sender_user_id === req.user.id || data.sender_tenant_id === req.user.tenant_id;
        // Use String() to ensure consistent type comparison
        const isRecipient = String(data.to_tenant_id) === String(req.user.tenant_id);
        const isAdminBroadcast = (data.role === 'admin' || data.role === 'clientadmin') && !data.to_tenant_id;
        
        if (!isSender && !isRecipient && !isAdminBroadcast) {
          return res.status(403).json({ 
            status: "Error", 
            statusCode: 403, 
            message: "Unauthorized access", 
            error: 'Not authorized to access this message' 
          });
        }
      }
      
      res.status(200).send(wrappSuccessResult(200, data));
    } catch (e) { next(e); }
  });

  // create
  router.post('/', async (req, res, next) => {
    try {
  logger.info('Message POST received', { body: req.body });
      // Ensure organization_id is set on all created items
      const dataWithOrgId = { ...req.body, organization_id: req.organization_id };
      
      // For tenants, enforce their tenant_id as sender
      if (req.user.role === 'tenant') {
        dataWithOrgId.sender_user_id = req.user.id;
        dataWithOrgId.sender_tenant_id = req.user.tenant_id;
        // Tenants can only message admins, not other tenants
        delete dataWithOrgId.to_tenant_id;
  logger.debug('Tenant message constructed', { data: dataWithOrgId });
      }
      
      // For admins, ensure the tenant_id is valid
      if ((req.user.role === 'admin' || req.user.role === 'clientadmin')) {
  logger.info('Admin sending message', { to_tenant_id: dataWithOrgId.to_tenant_id });
        
        if (dataWithOrgId.to_tenant_id !== undefined && dataWithOrgId.to_tenant_id !== null) {
          logger.debug('Message targeted to specific tenant', { to_tenant_id: dataWithOrgId.to_tenant_id });
        } else {
          logger.debug('Broadcasting message to all tenants');
        }
      }
      
  logger.debug('Final message data', { data: dataWithOrgId });
      const created = await service.create(dataWithOrgId);

      try {
        // Create a notification row for broadcasts/targeted messages
        const Notifications = getModel('notifications');

        // Determine proper recipients so tenant->admin messages are not broadcast to other tenants
        let recipients = null;
        if (created.to_tenant_id) {
          recipients = { tenant_ids: [created.to_tenant_id] };
  } else if (created.role && (created.role === 'admin' || created.role === 'clientadmin')) {
          recipients = 'all';
  } else if (created.role === 'tenant' || created.sender_tenant_id) {
          // Message originated from a tenant and is intended for staff/admins. Target admin users only.
          try {
            const Users = getModel('users');
            const { compareHasRole } = await import('../utils/index.js');
            
            // read the numeric `id` field which the auth token uses (req.user.id)
            // organization_id may be stored as number or string in different records; match both
            const orgVal = created.organization_id;
            const orgStr = String(orgVal);
            const orgNum = !isNaN(Number(orgVal)) ? Number(orgVal) : null;
            const orgQuery = orgNum !== null ? { $in: [orgNum, orgStr] } : orgStr;
            
            // Get all users in the organization and filter for admins by checking hashed roles
            const allUsers = await Users.find({ organization_id: orgQuery }, { id: 1, _id: 1, role: 1 }).lean();
            const adminUsers = [];
            
            for (const user of allUsers) {
              // Check if role is admin or clientadmin (handle both hashed and plain text roles)
              const isAdmin = await compareHasRole('admin', user.role);
              const isClientAdmin = await compareHasRole('clientadmin', user.role);
              
              if (isAdmin || isClientAdmin || user.role === 'admin' || user.role === 'clientadmin') {
                adminUsers.push(user);
              }
            }
            
            if (adminUsers && adminUsers.length) {
              // normalize to string ids to avoid type mismatch when matching against req.user.id
              recipients = { user_ids: adminUsers.map(a => String(a.id || a._id)) };
            } else {
              // No admins found (unexpected) - set an empty user_ids list so this notification isn't broadcast to tenants
              logger.warn('No admin users found to target tenant->admin notification for org', { organization_id: created.organization_id });
              recipients = { user_ids: [] };
            }
            // Debug: print resolved admins and final recipients so we can inspect mismatches
            try { logger.debug('DEBUG: resolved admins', { count: (admins || []).length, sample: (admins || []).slice(0,5).map(a=>a.id||String(a._id)), recipients }); } catch(e){}
            } catch (innerErr) {
            logger.warn('Failed to resolve admin users for notification recipients', innerErr);
            recipients = null;
          }
        }

        // ensure tenant ids are strings for consistent matching
        if (recipients && recipients.tenant_ids) recipients.tenant_ids = recipients.tenant_ids.map(String);
        const notif = await Notifications.create({
          organization_id: created.organization_id,
          type: 'message',
          title: created.subject || created.text || created.message || 'Message',
          body: created.message || created.text || created.body || '',
          created_at: created.created_at || created.createdAt || new Date(),
          source: { collection: 'messages', _id: created._id },
          recipients
        });

        // Publish a lightweight event so frontends (or other services) can react (best-effort)
        if (redisClient && redisClient.isReady) {
          try {
            await redisClient.publish('notifications', JSON.stringify({ type: 'notification.created', record: { id: String(notif._id), organization_id: notif.organization_id, type: notif.type, title: notif.title, created_at: notif.created_at } }));
          } catch (e) { console.warn('Redis publish failed', e); }
        }

        // Mark the notification as read for the creator so they don't see their own notification as unread
        try {
          const NotificationReads = getModel('notification_reads');
            if (req.user && req.user.id) {
            const now = new Date();
            await NotificationReads.updateOne({ notification_id: String(notif._id), user_id: String(req.user.id), organization_id: notif.organization_id }, { $set: { read_at: now } }, { upsert: true });
            // publish read event for realtime subscribers
            if (redisClient && redisClient.isReady) {
              try { await redisClient.publish('notifications', JSON.stringify({ type: 'notification.read', record: { notification_id: String(notif._id), user_id: String(req.user.id), organization_id: notif.organization_id, read_at: now } })); } catch(e){}
            }
          }
        } catch (e) { console.warn('Failed to mark notification read for creator', e); }
          } catch (e) {
        logger.warn('Failed to create notification for message', e);
      }

      res.status(201).send(wrappSuccessResult(201, created));
    } catch (e) { 
      logger.error('Error creating message', e);
      next(e); 
    }
  });

  // update - messages shouldn't be updated after sending
  router.put('/:id', async (req, res, next) => {
    try {
      return res.status(403).json({ 
        status: "Error", 
        statusCode: 403, 
        message: "Operation not allowed", 
        error: 'Messages cannot be modified after sending' 
      });
    } catch (e) {
      logger.error('Error in message update', e);
      next(e);
    }
  });

  // delete - only allow the sender to delete their own message
  router.delete('/:id', async (req, res, next) => {
    try {
      const message = await service.getByIdAndOrgId(req.params.id, req.organization_id);
      if (!message) {
        return res.status(404).json({ 
          status: "Error", 
          statusCode: 404, 
          message: "Message not found", 
          error: 'Message not found' 
        });
      }
      
      // Only the sender or an admin can delete a message
      if (req.user.role !== 'admin' && req.user.role !== 'clientadmin') {
        if (message.sender_user_id !== req.user.id && message.sender_tenant_id !== req.user.tenant_id) {
          return res.status(403).json({ 
            status: "Error", 
            statusCode: 403, 
            message: "Unauthorized action", 
            error: 'Not authorized to delete this message' 
          });
        }
      }
      
      const result = await service.removeWithOrgId(req.params.id, req.organization_id);
      res.status(200).send(wrappSuccessResult("deleted", { ok: true }));
    } catch (e) { 
      logger.error('Error deleting message', e);
      next(e); 
    }
  });

  return router;
}

export default makeMessagesController;
