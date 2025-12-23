import express from 'express';
import Joi from 'joi';
import multer from 'multer';
import models from '../models/index.js';
import { authenticateToken, verifyAdmin } from '../middleware/authMiddleware.js';
import { attachOrganizationContext } from '../middleware/planQuotaMiddleware.js';
import { wrappSuccessResult, processPagination } from '../utils/index.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';
import ACTIONS from '../utils/activityActions.js';
import redisClient from '../utils/redisClient.js';
import { getModel } from '../models/registry.js';
import { validateImageBuffer } from '../utils/imageValidation.js';
import logger from '../utils/logger.js';
import imageQuotaService from '../services/imageQuotaService.js';

// Helper to parse ticket id param: support numeric IDs or strings that contain digits (e.g. 'ticket_12345_001')
function parseTicketIdParam(param){
  if(param == null) return null;
  const raw = String(param);
  const asNum = Number(raw);
  if(!isNaN(asNum)) return asNum;
  const m = raw.match(/(\d+)/);
  if(m && m[1]){
    const p = Number(m[1]);
    if(!isNaN(p)) return p;
  }
  return null;
}

// Flexible finder: attempt numeric lookup, then exact string match on the raw collection,
// then try matching by MongoDB _id. Returns the ticket document or null.
async function findTicketByParam(param, organization_id) {
  if (param == null) return null;
  const rawParam = String(param);
  // try numeric interpretation first
  const numeric = parseTicketIdParam(param);
  if (numeric != null) {
    try {
      const found = await models.TicketsDB.findOne({ id: numeric, organization_id }).lean();
      if (found) return found;
    } catch (e) {
      // ignore and continue to other strategies
    }
  }

  // try exact string match using raw collection to avoid mongoose casting issues
  try {
    const foundRaw = await models.TicketsDB.collection.findOne({ organization_id, id: rawParam });
    if (foundRaw) return foundRaw;
  } catch (e) {
    // noop
  }

  // final attempt: try matching by MongoDB _id
  try {
    // use findOne with _id; mongoose will cast if param is a valid ObjectId string
    const byOid = await models.TicketsDB.findOne({ _id: rawParam, organization_id }).lean();
    if (byOid) return byOid;
  } catch (e) {
    // noop
  }

  return null;
}

const router = express.Router();

// Image upload constants
const MAX_IMAGES_PER_TICKET = 5;
const TICKET_IMAGE_MAX_SIZE = 10 * 1024 * 1024; // 10MB per image

// Multer configuration for ticket images
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: TICKET_IMAGE_MAX_SIZE,
    files: MAX_IMAGES_PER_TICKET
  }
});

const ticketDto = Joi.object({
  id: Joi.number().required(),
  organization_id: Joi.number().required(),
  tenant_id: Joi.string().allow(null).optional(),
  title: Joi.string().required(),
  description: Joi.string().allow('').optional(),
  status: Joi.string().valid('Open', 'In Progress', 'Resolved', 'Closed').optional(),
  priority: Joi.string().valid('Low','Medium','High','Critical').optional(),
  created_by_user_id: Joi.string().required(),
  assigned_to_user_id: Joi.string().optional(),
  created_at: Joi.date().optional(),
  updated_at: Joi.date().optional(),
});

router.get('/', authenticateToken, attachOrganizationContext, async (req, res, next) => {
  try {
  const { skip, limit, sortQuery, queryFilter } = processPagination(req.query);
  const filter = { ...queryFilter, organization_id: req.organization_id };

    // If the requester is a tenant, restrict results to their own tickets only
    const role = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : '';
    if (role === 'tenant') {
      const tenantId = req.user.tenant_id || req.user.tenant || null;
      // If no tenant id is present on the token, force a no-match so tenants don't see others' tickets
      filter.tenant_id = tenantId ? String(tenantId) : '__NO_MATCH__';
    }

    const items = await models.TicketsDB.find(filter).sort(sortQuery).skip(skip).limit(parseInt(limit)).lean();
    res.status(200).send(wrappSuccessResult(200, items));
  } catch (error) { return next(error, req, res); }
});

// Comments for a ticket
// Get ticket detail along with comments (comments sorted newest first)
router.get('/:id', authenticateToken, attachOrganizationContext, async (req, res, next) => {
  try {
  const idParam = req.params.id;
  const ticket = await findTicketByParam(idParam, req.organization_id);
  if(!ticket) return res.status(404).send(wrappSuccessResult(404, null, 'Ticket not found'));

    // If the requester is a tenant, ensure they can only view their own ticket
    if (req.user && String(req.user.role).toLowerCase() === 'tenant') {
      const tenantId = req.user.tenant_id || req.user.tenant;
      if (ticket.tenant_id && String(ticket.tenant_id) !== String(tenantId)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const TicketComments = getModel('ticket_comments');
    const comments = await TicketComments.find({ organization_id: req.organization_id, ticket_id: id }).sort({ created_at: -1 }).lean();

    // Return ticket first, then comments below it
    res.status(200).send(wrappSuccessResult(200, { ticket, comments }));
  } catch (error) { next(error); }
});

// Comments for a ticket (legacy route kept for direct comment listing)
router.get('/:id/comments', authenticateToken, attachOrganizationContext, async (req, res, next) => {
  try {
    const ticketId = parseTicketIdParam(req.params.id);
    if(ticketId == null) return res.status(400).send(wrappSuccessResult(400, null, 'Invalid ticket id'));
    const TicketComments = getModel('ticket_comments');
    // Return comments newest first
    const comments = await TicketComments.find({ organization_id: req.organization_id, ticket_id: ticketId }).sort({ created_at: -1 }).lean();
    res.status(200).send(wrappSuccessResult(200, comments));
  } catch (error) { next(error); }
});

router.post('/:id/comments', authenticateToken, attachOrganizationContext, async (req, res, next) => {
  try {
    const ticketId = parseTicketIdParam(req.params.id);
    if(ticketId == null) return res.status(400).json({ error: 'Invalid ticket id' });
    const body = (req.body && (req.body.body || req.body.text || req.body.comment)) || '';
    if(!body || !String(body).trim()) return res.status(400).json({ error: 'Comment body is required' });
    // ensure ticket exists
  const existingTicket = await findTicketByParam(ticketId, req.organization_id);
  // ensure we have the ticket doc in the same shape as other paths
  // findTicketByParam returns a lean doc for collection finds already
    if(!existingTicket) return res.status(404).json({ error: 'Ticket not found' });

    const TicketComments = getModel('ticket_comments');
    const payload = {
      organization_id: req.organization_id,
      ticket_id: ticketId,
      body: String(body),
      created_by_user_id: req.user && (req.user.id || req.user._id) || null,
      created_at: new Date()
    };
    const created = await TicketComments.create(payload);

    // optional: publish an event for realtime updates
    try{
      if(redisClient && redisClient.isReady) {
        const payload = { type: 'ticket.comment.created', record: { ticket_id: ticketId, comment_id: String(created._id), organization_id: req.organization_id, actor_id: req.user && (req.user.id || req.user._id) } };
        await redisClient.publish('notifications', JSON.stringify(payload));
        // also publish to a more specific channel so clients can subscribe to comment events only
        try{ await redisClient.publish('ticket_comments', JSON.stringify(payload)); }catch(e){}
      }
    }catch(e){}

    // Create notifications so the other party is informed about the new comment
    try{
      const Notifications = getModel('notifications');
      const Users = getModel('users');
      const actorRole = req.user && req.user.role ? String(req.user.role).toLowerCase() : 'tenant';
      // If a tenant commented, notify admin/clientadmin users for this org
      if(actorRole === 'tenant'){
        const { compareHasRole } = await import('../utils/index.js');
        const recipients = { user_ids: [] };
        try{ 
          const orgVal = req.organization_id;
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
          
          if(adminUsers && adminUsers.length) {
            recipients.user_ids = Array.from(new Set(adminUsers.map(a => String(a.id || a._id))));
          }
        }catch(e){ /* noop */ }
        if((recipients.user_ids || []).length){
          const notif = await Notifications.create({
            organization_id: req.organization_id,
            type: 'ticket',
            title: `New comment on ticket #${ticketId}`,
            body: String(body).slice(0,200),
            created_at: new Date(),
            source: { collection: 'tickets', _id: existingTicket?._id, id: ticketId },
            meta: { ticket_id: ticketId, comment_id: String(created._id), status: existingTicket?.status, priority: existingTicket?.priority },
            recipients
          });
          try{ if(redisClient && redisClient.isReady) await redisClient.publish('notifications', JSON.stringify({ type: 'notification.created', record: { id: String(notif._id), organization_id: notif.organization_id, type: notif.type, title: notif.title, created_at: notif.created_at } })); }catch(e){}
          // mark as read for actor so they don't see own notification
          try{ const NotificationReads = getModel('notification_reads'); if(req.user && req.user.id) { const now = new Date(); await NotificationReads.updateOne({ notification_id: String(notif._id), user_id: String(req.user.id), organization_id: notif.organization_id }, { $set: { read_at: now } }, { upsert: true }); } }catch(e){}
        }
      } else if(['admin','clientadmin','manager'].includes(actorRole)){
        // If admin/clientadmin commented, notify the ticket's tenant (if present)
        const tenantId = existingTicket && (existingTicket.tenant_id || existingTicket.tenantId || existingTicket.tenant);
        if(tenantId){
          const recip = { tenant_ids: [ String(tenantId) ] };
            const notif = await Notifications.create({
            organization_id: req.organization_id,
            type: 'ticket',
            title: `Update on ticket #${ticketId}`,
            body: String(body).slice(0,200),
            created_at: new Date(),
            source: { collection: 'tickets', _id: existingTicket?._id, id: ticketId },
            meta: { ticket_id: ticketId, comment_id: String(created._id), status: existingTicket?.status, priority: existingTicket?.priority },
            recipients: recip
          });
          try{ if(redisClient && redisClient.isReady) await redisClient.publish('notifications', JSON.stringify({ type: 'notification.created', record: { id: String(notif._id), organization_id: notif.organization_id, type: notif.type, title: notif.title, created_at: notif.created_at } })); }catch(e){}
        }
      }
    }catch(e){ console.warn('Failed to create notification for comment', e); }

    res.status(201).send(wrappSuccessResult(201, created));
  } catch (error) { next(error); }
});

// Update a comment
router.put('/:id/comments/:cid', authenticateToken, attachOrganizationContext, async (req, res, next) => {
  try {
    const ticketId = parseTicketIdParam(req.params.id);
    if(ticketId == null) return res.status(400).json({ error: 'Invalid ticket id' });
    const cid = req.params.cid;
    const body = (req.body && (req.body.body || req.body.comment || req.body.text)) || '';
    if(!body || !String(body).trim()) return res.status(400).json({ error: 'Comment body is required' });
    const TicketComments = getModel('ticket_comments');
    const existing = await TicketComments.findOne({ _id: cid, organization_id: req.organization_id }).lean();
    if(!existing) return res.status(404).json({ error: 'Comment not found' });

    // permission: owner or admin/manager/clientadmin
    const role = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : '';
    const isOwner = req.user && (req.user.id === existing.created_by_user_id || req.user._id === existing.created_by_user_id);
    if(!isOwner && !['admin','manager','clientadmin'].includes(role)) return res.status(403).json({ error: 'Forbidden' });

    const update = { body: String(body), updated_at: new Date() };
    await TicketComments.updateOne({ _id: cid, organization_id: req.organization_id }, { $set: update });
    const updated = await TicketComments.findOne({ _id: cid, organization_id: req.organization_id }).lean();

    // publish realtime event
    try{
      if(redisClient && redisClient.isReady) {
        const payload = { type: 'ticket.comment.updated', record: { ticket_id: ticketId, comment_id: String(cid), organization_id: req.organization_id, actor_id: req.user && (req.user.id || req.user._id) } };
        await redisClient.publish('notifications', JSON.stringify(payload));
        try{ await redisClient.publish('ticket_comments', JSON.stringify(payload)); }catch(e){}
      }
    }catch(e){}

    res.status(200).send(wrappSuccessResult(200, updated));
  } catch (error) { next(error); }
});

// Delete a comment
router.delete('/:id/comments/:cid', authenticateToken, attachOrganizationContext, async (req, res, next) => {
  try {
    const ticketId = parseTicketIdParam(req.params.id);
    if(ticketId == null) return res.status(400).json({ error: 'Invalid ticket id' });
    const cid = req.params.cid;
    const TicketComments = getModel('ticket_comments');
    const existing = await TicketComments.findOne({ _id: cid, organization_id: req.organization_id }).lean();
    if(!existing) return res.status(404).json({ error: 'Comment not found' });

    const role = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : '';
    const isOwner = req.user && (req.user.id === existing.created_by_user_id || req.user._id === existing.created_by_user_id);
    if(!isOwner && !['admin','manager','clientadmin'].includes(role)) return res.status(403).json({ error: 'Forbidden' });

    await TicketComments.deleteOne({ _id: cid, organization_id: req.organization_id });
    try{
      if(redisClient && redisClient.isReady) {
        const payload = { type: 'ticket.comment.deleted', record: { ticket_id: ticketId, comment_id: String(cid), organization_id: req.organization_id, actor_id: req.user && (req.user.id || req.user._id) } };
        await redisClient.publish('notifications', JSON.stringify(payload));
        try{ await redisClient.publish('ticket_comments', JSON.stringify(payload)); }catch(e){}
      }
    }catch(e){}

    res.status(200).send(wrappSuccessResult(200, { ok: true }));
  } catch (error) { next(error); }
});

router.post('/', authenticateToken, attachOrganizationContext, logActivity(ACTIONS.TICKET_CREATE, 'TICKET', 'Ticket created'), async (req, res, next) => {
  try {
    // Get the user role from the request
    const userRole = req.user.role?.toLowerCase();
    const isAdmin = userRole === 'admin' || userRole === 'clientadmin' || userRole === 'manager';
    
    // Prepare the payload
    let payload = { ...req.body, organization_id: req.organization_id };
    
    // If admin/clientadmin is creating a ticket without a tenant_id, set to null
    if (isAdmin && !payload.tenant_id) {
      payload.tenant_id = null;
    }
    
    // Validate the payload
    const { error, value } = ticketDto.validate(payload, { abortEarly: false });
    if (error) return res.status(400).json({ error: error.details.map(d=>d.message) });
    
    // Create or update the ticket
    await models.TicketsDB.updateOne(
      { id: value.id, organization_id: req.organization_id }, 
      { $set: value }, 
      { upsert: true }
    );
    
    // Return the created ticket
    const created = await models.TicketsDB.findOne({ id: value.id, organization_id: req.organization_id }).lean();
    // If a tenant created this ticket, create a notification targeted to admin and clientadmin users
    try {
      if (req.user && req.user.role === 'tenant') {
        const Notifications = getModel('notifications');
        // lookup admin/clientadmin users for this org (handle hashed roles)
        const Users = getModel('users');
        const { compareHasRole } = await import('../utils/index.js');
        let recipients = { user_ids: [] };
        try {
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
            recipients.user_ids = Array.from(new Set(adminUsers.map(a => String(a.id || a._id))));
          } else {
            console.warn('No admin or clientadmin users found to target tenant->admin notification for org:', created.organization_id);
            recipients.user_ids = [];
          }
        } catch (err) {
          console.warn('Failed to resolve admin/clientadmin recipients for ticket notification:', err);
          recipients.user_ids = [];
        }

        const notif = await Notifications.create({
          organization_id: created.organization_id,
          type: 'ticket',
          title: created.title || `New ticket #${created.id}`,
          body: created.description || '',
          created_at: created.created_at || created.createdAt || new Date(),
          // include both DB _id and numeric ticket id for frontend routing
          source: { collection: 'tickets', _id: created._id, id: created.id },
          // include ticket metadata for quick UI display
          meta: { ticket_id: created.id, status: created.status, priority: created.priority },
          recipients
        });

        if (redisClient && redisClient.isReady) {
          try { await redisClient.publish('notifications', JSON.stringify({ type: 'notification.created', record: { id: String(notif._id), organization_id: notif.organization_id, type: notif.type, title: notif.title, created_at: notif.created_at } })); } catch(e){ console.warn('Redis publish failed', e); }
        }

        // mark as read for creator so they don't get an unread notification for their own action
        try {
          const NotificationReads = getModel('notification_reads');
          if (req.user && req.user.id) {
            const now = new Date();
            await NotificationReads.updateOne({ notification_id: String(notif._id), user_id: String(req.user.id), organization_id: notif.organization_id }, { $set: { read_at: now } }, { upsert: true });
              if (redisClient && redisClient.isReady) {
                try{ await redisClient.publish('notifications', JSON.stringify({ type: 'notification.read', record: { notification_id: String(notif._id), user_id: String(req.user.id), organization_id: notif.organization_id, read_at: now } })); }catch(e){}
              }
          }
        } catch (e) { console.warn('Failed to mark notification read for ticket creator', e); }
      }
    } catch (e) { console.warn('Failed to create notification for ticket:', e); }
    res.status(201).send(wrappSuccessResult(201, created));
  } catch (error) { return next(error, req, res); }
});

router.put('/:id', authenticateToken, attachOrganizationContext, logActivity(ACTIONS.TICKET_UPDATE, 'TICKET', 'Ticket updated'), async (req, res, next) => {
  try {
  const idParam = req.params.id;
  const ticketExists = await findTicketByParam(idParam, req.organization_id);
  if(!ticketExists) return res.status(400).json({ message: 'Invalid ticket id' });
    
    // Clean the payload to remove MongoDB-specific fields
    const cleanPayload = { ...req.body, id, organization_id: req.organization_id };
    delete cleanPayload._id;
    delete cleanPayload.__v;
    
  // Ensure id is a number when possible
  const parsed = parseTicketIdParam(cleanPayload.id);
  if(parsed != null) cleanPayload.id = Number(parsed);
    
    const { error, value } = ticketDto.fork(['id'], (s)=>s.optional()).validate(cleanPayload, { abortEarly: false });
    if (error) return res.status(400).json({ error: error.details.map(d=>d.message) });
    
  // If user is a tenant, ensure they can only update their own tickets
  if (req.user.role === 'tenant') {
    const existingTicket = await models.TicketsDB.findOne({ id, organization_id: req.organization_id }).lean();
    if (!existingTicket || existingTicket.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({ message: "Forbidden: You can only update your own tickets" });
    }
  }
  await models.TicketsDB.updateOne({ id, organization_id: req.organization_id }, { $set: value });
  const updated = await models.TicketsDB.findOne({ id, organization_id: req.organization_id }).lean();
    // If updated by an admin/clientadmin and the ticket belongs to a tenant, send a notification to that tenant
    try {
      const userRole = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : '';
      if (userRole === 'admin' || userRole === 'clientadmin' || userRole === 'manager') {
        const Notifications = getModel('notifications');
        const tenantId = updated && (updated.tenant_id || updated.tenantId || updated.tenant); // various possible shapes
    if (tenantId) {
          // Notify the specific tenant id (backend notifications use tenant_ids array)
          const notif = await Notifications.create({
            organization_id: updated.organization_id,
            type: 'ticket',
            title: `Update on ticket #${updated.id}`,
            body: updated.description || updated.title || '',
            created_at: new Date(),
            source: { collection: 'tickets', _id: updated._id, id: updated.id },
      recipients: { tenant_ids: [ String(tenantId) ] },
            // include ticket metadata so frontend can show status/priority without extra fetch
            meta: { ticket_id: updated.id, status: updated.status, priority: updated.priority, icon: 'ticket' }
          });

          if (redisClient && redisClient.isReady) {
            try { await redisClient.publish('notifications', JSON.stringify({ type: 'notification.created', record: { id: String(notif._id), organization_id: notif.organization_id, type: notif.type, title: notif.title, created_at: notif.created_at } })); } catch(e){ console.warn('Redis publish failed', e); }
          }
        }
      }
    } catch (e) { console.warn('Failed to create tenant notification for ticket update:', e); }

    // If updated by a tenant, notify all admin/clientadmin users for this org
    try {
      const userRole2 = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : '';
      if (userRole2 === 'tenant') {
        const Notifications = getModel('notifications');
        const Users = getModel('users');
        const { compareHasRole } = await import('../utils/index.js');
        const recipients = { user_ids: [] };
        try {
          const orgVal = updated.organization_id;
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
            recipients.user_ids = Array.from(new Set(adminUsers.map(a => String(a.id || a._id))));
          }
        } catch (err) { /* noop - leave recipients empty */ }

        if ((recipients.user_ids || []).length) {
          const notif = await Notifications.create({
            organization_id: updated.organization_id,
            type: 'ticket',
            title: `Update on ticket #${updated.id}`,
            body: updated.description || updated.title || '',
            created_at: new Date(),
            source: { collection: 'tickets', _id: updated._id, id: updated.id },
            recipients,
            meta: { ticket_id: updated.id, status: updated.status, priority: updated.priority, icon: 'ticket' }
          });

          if (redisClient && redisClient.isReady) {
            try { await redisClient.publish('notifications', JSON.stringify({ type: 'notification.created', record: { id: String(notif._id), organization_id: notif.organization_id, type: notif.type, title: notif.title, created_at: notif.created_at } })); } catch(e){}
          }

          // mark as read for the tenant actor so they don't see their own notification
          try {
            const NotificationReads = getModel('notification_reads');
            if (req.user && req.user.id) {
              const now = new Date();
              await NotificationReads.updateOne({ notification_id: String(notif._id), user_id: String(req.user.id), organization_id: notif.organization_id }, { $set: { read_at: now } }, { upsert: true });
            }
          } catch (e) { /* noop */ }
        }
      }
    } catch (e) { console.warn('Failed to create admin notification for tenant ticket update:', e); }

    res.status(200).send(wrappSuccessResult(200, updated));
  } catch (error) { return next(error, req, res); }
});

router.delete('/:id', authenticateToken, attachOrganizationContext, logActivity(ACTIONS.TICKET_DELETE, 'TICKET', 'Ticket deleted'), async (req, res, next) => {
  try {
    const idParam = req.params.id;
    const id = parseTicketIdParam(idParam);
    const idStr = String(idParam);

    // First try numeric id lookup (Mongoose casting safe)
    let existingTicket = null;
    if (id != null) {
      existingTicket = await models.TicketsDB.findOne({ id, organization_id: req.organization_id }).lean();
    }

    // If not found, try exact string match using the raw collection to avoid Mongoose casting on number schema
    if (!existingTicket) {
      try {
        existingTicket = await models.TicketsDB.collection.findOne({ organization_id: req.organization_id, id: idParam });
      } catch (e) {
        // fallback noop
        existingTicket = null;
      }
    }

    if (!existingTicket) return res.status(404).send(wrappSuccessResult(404, null, 'Ticket not found'));

    // If user is a tenant, ensure they can only delete their own tickets
    if (req.user.role === 'tenant') {
      if (existingTicket.tenant_id !== req.user.tenant_id) {
        return res.status(403).json({ message: "Forbidden: You can only delete your own tickets" });
      }
    }

    // Delete by _id to ensure we remove the exact document we found
    await models.TicketsDB.deleteOne({ _id: existingTicket._id });
    res.status(200).send(wrappSuccessResult(200, { ok: true }));
  } catch (error) { return next(error, req, res); }
});

// Image upload routes for tickets
router.post('/:id/upload-images', 
  authenticateToken, 
  attachOrganizationContext, 
  upload.array('ticket_images', MAX_IMAGES_PER_TICKET), 
  async (req, res) => {
    try {
      logger.info('[ticketsController] POST /:id/upload-images called', { 
        user: req.user?.id, 
        role: req.user?.role, 
        params: req.params,
        fileCount: req.files?.length || 0,
        fileSizes: req.files?.map(f => f.size) || [],
        fileMimes: req.files?.map(f => f.mimetype) || [],
        captions: req.body.captions
      });
      
      const { id } = req.params;
      const captions = req.body.captions || []; // Array of captions corresponding to each image
      const files = req.files;

      // Validate ticket ID - handle both string and numeric IDs
      if (!id || id === 'null' || id === 'undefined') {
        return res.status(400).json({ success: false, message: 'Invalid ticket ID' });
      }
      
      // Try to parse as number first, but also allow string IDs for flexibility
      let ticketId = parseInt(id, 10);
      if (isNaN(ticketId)) {
        // If it's not a number, use the string ID directly
        ticketId = id;
      }

      if (!files || files.length === 0) {
        return res.status(400).json({ success: false, message: 'No images provided' });
      }

      if (files.length > MAX_IMAGES_PER_TICKET) {
        return res.status(400).json({ success: false, message: `Too many images. Maximum ${MAX_IMAGES_PER_TICKET} images allowed` });
      }

      // Find the ticket by ID and organization
  const ticket = await findTicketByParam(ticketId, req.organization_id);
      if (!ticket) {
        return res.status(404).json({ success: false, message: 'Ticket not found' });
      }

      // Check if user can upload images to this ticket
      if (req.user.role === 'tenant' && ticket.tenant_id !== req.user.tenant_id) {
        return res.status(403).json({ success: false, message: 'Forbidden: You can only upload images to your own tickets' });
      }

      // Enforce org-level ticket image quota
      const ticketQuota = await imageQuotaService.checkTicketLimit(req.organization_id, validatedImages.length);
      if (!ticketQuota.ok) {
        return res.status(403).json({ success: false, code: 'image_limit_exceeded', field: 'ticketImageLimit', message: `Ticket images limit exceeded (${ticketQuota.used}/${ticketQuota.limit})` });
      }

      // Validate all images
      const validatedImages = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const validation = validateImageBuffer({ 
          buffer: file?.buffer, 
          mimetype: file?.mimetype, 
          size: file?.size, 
          maxSize: TICKET_IMAGE_MAX_SIZE 
        });
        if (!validation.ok) {
          logger.warn('[ticketsController] File validation failed', { 
            validation, 
            fileIndex: i,
            fileName: file?.originalname,
            fileSize: file?.size, 
            maxSize: TICKET_IMAGE_MAX_SIZE,
            mimetype: file?.mimetype 
          });
          return res.status(400).json({ success: false, message: `Image ${i + 1}: ${validation.message}` });
        }
        validatedImages.push({
          data: file.buffer,
          contentType: file.mimetype,
          size: file.size,
          originalName: file.originalname,
          caption: captions[i] || '', // Use corresponding caption or empty string
          uploaded_at: new Date()
        });
      }

      // Update ticket with new images (append to existing images)
      const existingImages = ticket.images || [];
      const updatedImages = [...existingImages, ...validatedImages];
      
      logger.info('[ticketsController] Updating ticket with images', {
        ticketId: ticketId,
        orgId: req.organization_id,
        existingImagesCount: existingImages.length,
        newImagesCount: validatedImages.length,
        totalImagesAfter: updatedImages.length,
        updateQuery: { id: ticketId, organization_id: req.organization_id }
      });
      
      const updateResult = await models.TicketsDB.updateOne(
        { id: ticketId, organization_id: req.organization_id },
        { $set: { images: updatedImages, updated_at: new Date() } }
      );
      
      logger.info('[ticketsController] Update result', {
        acknowledged: updateResult.acknowledged,
        modifiedCount: updateResult.modifiedCount,
        matchedCount: updateResult.matchedCount
      });
      
      // Verify the update by fetching the ticket again
      const updatedTicket = await models.TicketsDB.findOne({ id: ticketId, organization_id: req.organization_id });
      logger.info('[ticketsController] Verification - updated ticket images', {
        imagesCount: updatedTicket?.images?.length || 0,
        hasImages: !!(updatedTicket?.images && updatedTicket.images.length > 0)
      });

      res.status(200).json({ 
        success: true, 
        message: `${validatedImages.length} image(s) uploaded successfully`,
        uploadedCount: validatedImages.length,
        totalImages: updatedImages.length,
        debug: {
          updateResult: updateResult,
          verificationImagesCount: updatedTicket?.images?.length || 0
        }
      });
    } catch (error) {
      logger.error('Error uploading ticket images', error);
      res.status(500).json({ success: false, message: 'Failed to upload ticket images' });
    }
  }
);

// Get ticket image by index
router.get('/:id/images/:imageIndex', authenticateToken, attachOrganizationContext, async (req, res) => {
  try {
    const { id, imageIndex } = req.params;
    
    // Validate ticket ID - handle both string and numeric IDs
    if (!id || id === 'null' || id === 'undefined') {
      return res.status(400).json({ success: false, message: 'Invalid ticket ID' });
    }
    
    // Try to parse as number first, but also allow string IDs for flexibility
    let ticketId = parseInt(id, 10);
    if (isNaN(ticketId)) {
      // If it's not a number, use the string ID directly
      ticketId = id;
    }
    
    // Validate image index
    const index = parseInt(imageIndex, 10);
    if (isNaN(index) || index < 0) {
      return res.status(400).json({ success: false, message: 'Invalid image index' });
    }

  const ticket = await findTicketByParam(ticketId, req.organization_id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Check if user can view images from this ticket
    if (req.user.role === 'tenant' && ticket.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({ success: false, message: 'Forbidden: You can only view images from your own tickets' });
    }

    const images = ticket.images || [];
    if (index >= images.length) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }

    const image = images[index];
    if (!image || !image.data) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }

    // Normalize different stored shapes:
    // - Buffer (Node Buffer)
    // - Mongoose Buffer-like: { type: 'Buffer', data: [...] } or object with .buffer
    // - base64 string
    let payloadBuffer = null;
    try {
      if (Buffer.isBuffer(image.data)) {
        payloadBuffer = image.data;
      } else if (image.data && image.data.buffer && Buffer.isBuffer(image.data.buffer)) {
        // Mongoose Binary type may expose .buffer
        payloadBuffer = image.data.buffer;
      } else if (image.data && typeof image.data === 'object' && Array.isArray(image.data.data)) {
        // Plain JS representation of Buffer: { type: 'Buffer', data: [...] }
        payloadBuffer = Buffer.from(image.data.data);
      } else if (typeof image.data === 'string') {
        // Assume base64-encoded string
        try {
          payloadBuffer = Buffer.from(image.data, 'base64');
        } catch (e) {
          // Fallback to raw string bytes
          payloadBuffer = Buffer.from(String(image.data));
        }
      } else {
        // Last resort: stringify and send
        payloadBuffer = Buffer.from(String(image.data || ''));
      }
    } catch (err) {
      logger.error('Failed to normalize ticket image data', { err });
      return res.status(500).json({ success: false, message: 'Failed to retrieve ticket image' });
    }

    res.set({
      'Content-Type': image.contentType || 'application/octet-stream',
      'Content-Length': payloadBuffer.length,
      'Cache-Control': 'public, max-age=31536000'
    });
    return res.status(200).send(payloadBuffer);
  } catch (error) {
    logger.error('Error retrieving ticket image', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve ticket image' });
  }
});

// Get all ticket images metadata
router.get('/:id/images', authenticateToken, attachOrganizationContext, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate the ID parameter - handle both string and numeric IDs  
    if (!id || id === 'null' || id === 'undefined') {
      logger.warn('[ticketsController] GET images metadata - invalid ID parameter', { id, rawId: req.params.id });
      return res.status(400).json({ success: false, message: 'Invalid ticket ID' });
    }
    
    // Try to parse as number first, but also allow string IDs for flexibility
    let ticketId = parseInt(id, 10);
    if (isNaN(ticketId)) {
      // If it's not a number, use the string ID directly
      ticketId = id;
    }
    
    logger.info('[ticketsController] GET images metadata - searching for ticket', {
      rawId: id,
      ticketId: ticketId,
      orgId: req.organization_id,
      userRole: req.user?.role,
      userTenantId: req.user?.tenant_id
    });
    
  const ticket = await findTicketByParam(ticketId, req.organization_id);
    if (!ticket) {
      logger.warn('[ticketsController] GET images metadata - ticket not found', {
        ticketId: parseInt(id),
        orgId: req.organization_id
      });
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    logger.info('[ticketsController] GET images metadata - found ticket', {
      ticketId: ticket.id,
      ticketOrgId: ticket.organization_id,
      ticketTenantId: ticket.tenant_id,
      imagesCount: ticket.images?.length || 0,
      hasImagesField: ticket.hasOwnProperty('images'),
      imagesType: typeof ticket.images,
      ticketTitle: ticket.title
    });

    // Check if user can view images from this ticket
    if (req.user.role === 'tenant' && ticket.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({ success: false, message: 'Forbidden: You can only view images from your own tickets' });
    }

    const images = ticket.images || [];
    const imageMetadata = images.map((img, index) => ({
      index,
      contentType: img.contentType,
      size: img.size,
      originalName: img.originalName,
      caption: img.caption || '',
      uploaded_at: img.uploaded_at,
      url: `/api/tickets/${id}/images/${index}`
    }));

    res.status(200).json({ 
      success: true, 
      images: imageMetadata,
      count: images.length
    });
  } catch (error) {
    logger.error('Error getting ticket images metadata', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve ticket images' });
  }
});

// Delete a specific ticket image by index
router.delete('/:id/images/:imageIndex', authenticateToken, attachOrganizationContext, async (req, res) => {
  try {
    const { id, imageIndex } = req.params;
    const index = parseInt(imageIndex, 10);

    if (isNaN(index) || index < 0) {
      return res.status(400).json({ success: false, message: 'Invalid image index' });
    }

      // Fetch ticket to verify operation
      const ticket = await models.TicketsDB.findOne({ 
        id: ticketId, 
        organization_id: req.organization_id 
      });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Check if user can delete images from this ticket
    if (req.user.role === 'tenant' && ticket.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({ success: false, message: 'Forbidden: You can only delete images from your own tickets' });
    }

    const images = ticket.images || [];
    if (index >= images.length) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }

    // Remove the image at the specified index
    images.splice(index, 1);
    
    await models.TicketsDB.updateOne(
      { id: parseInt(id), organization_id: req.organization_id },
      { $set: { images, updated_at: new Date() } }
    );

    res.status(200).json({ 
      success: true, 
      message: 'Image deleted successfully',
      remainingCount: images.length
    });
  } catch (error) {
    logger.error('Error deleting ticket image', error);
    res.status(500).json({ success: false, message: 'Failed to delete ticket image' });
  }
});

// Update caption for a specific ticket image
router.patch('/:id/images/:imageIndex/caption', authenticateToken, attachOrganizationContext, async (req, res) => {
  try {
    const { id, imageIndex } = req.params;
    const { caption } = req.body;
    const index = parseInt(imageIndex, 10);

    if (isNaN(index) || index < 0) {
      return res.status(400).json({ success: false, message: 'Invalid image index' });
    }

  const ticket = await findTicketByParam(id, req.organization_id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Check if user can edit images from this ticket
    if (req.user.role === 'tenant' && ticket.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({ success: false, message: 'Forbidden: You can only edit images from your own tickets' });
    }

    const images = ticket.images || [];
    if (index >= images.length) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }

    // Update the caption
    images[index].caption = caption || '';
    
    await models.TicketsDB.updateOne(
      { id: parseInt(id), organization_id: req.organization_id },
      { $set: { images, updated_at: new Date() } }
    );

    res.status(200).json({ 
      success: true, 
      message: 'Image caption updated successfully',
      caption: images[index].caption
    });
  } catch (error) {
    logger.error('Error updating ticket image caption', error);
    res.status(500).json({ success: false, message: 'Failed to update image caption' });
  }
});

const configure = (app) => {
  app.use('/tickets', router);
  app.use('/api/tickets', router);
};

export default configure;
