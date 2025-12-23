import express from 'express';
import { getModel } from '../models/registry.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { attachOrganizationContext } from '../middleware/planQuotaMiddleware.js';
import { wrappSuccessResult } from '../utils/index.js';
import redisClient from '../utils/redisClient.js';

// Clean notifications controller (single module)
export default function makeNotificationsController(){
  const router = express.Router();
  router.use(authenticateToken);
  router.use(attachOrganizationContext);

  const Notifications = getModel('notifications');
  const NotificationReads = getModel('notification_reads');

  // GET / - list notifications
  router.get('/', async (req, res, next) => {
    try{
      const orgId = req.organization_id;
      const limit = Number(req.query.limit) || 20;
  const filter = { organization_id: orgId };
  const tenantIdStr = req.user && (req.user.tenant_id !== undefined && req.user.tenant_id !== null) ? String(req.user.tenant_id) : null;
  const userIdStr = req.user && (req.user.id !== undefined && req.user.id !== null) ? String(req.user.id) : null;
  const userObjectIdStr = req.user && (req.user._id !== undefined && req.user._id !== null) ? String(req.user._id) : null;
  // build candidate user id list (covers numeric id, string id, and objectId string)
  const userIdCandidates = [];
  if(userIdStr) userIdCandidates.push(userIdStr);
  if(userObjectIdStr && !userIdCandidates.includes(userObjectIdStr)) userIdCandidates.push(userObjectIdStr);
  const userIdNum = userIdStr && !isNaN(Number(userIdStr)) ? Number(userIdStr) : null;
  const isOrgAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'clientadmin' || req.user.role === 'manager');
  filter.$or = [ { recipients: 'all' }, { recipients: { $exists: false } }, { recipients: null } ];
  if(tenantIdStr){ filter.$or.push({ 'recipients.tenant_ids': tenantIdStr }); const tenantNum = !isNaN(Number(req.user.tenant_id)) ? Number(req.user.tenant_id) : null; if(tenantNum !== null) filter.$or.push({ 'recipients.tenant_ids': tenantNum }); }
  else if(isOrgAdmin){ filter.$or.push({ 'recipients.tenant_ids': { $exists: true } }); }
  if(userIdCandidates.length){
    // match any of the candidate ids for user (covers _id and id shapes)
    filter.$or.push({ 'recipients.user_ids': { $in: userIdCandidates } });
    if(userIdNum !== null) filter.$or.push({ 'recipients.user_ids': userIdNum });
  }

      const items = await Notifications.find(filter).sort({ created_at: -1 }).limit(limit).lean();
  const ids = items.map(i => String(i._id));

  // Query reads for any of the candidate user ids
  const readQueryUser = userIdCandidates.length ? { $in: userIdCandidates } : String(req.user.id);
  const readRows = await NotificationReads.find({ notification_id: { $in: ids }, user_id: readQueryUser }).lean();
      const readSet = new Set(readRows.map(r => String(r.notification_id)));

      // best-effort sender_name resolution (lightweight per-item lookup)
      const Users = getModel('users');
      const out = [];
      for(const i of items){
        let sender_name = i.sender_name || i.created_by_name || i.created_by || i.author || null;
        if(!sender_name && i.source && i.source.collection && i.source._id){
          try{
            const Model = getModel(i.source.collection);
            const rec = await Model.findOne({ _id: i.source._id }).lean();
            if(rec){
              sender_name = rec.sender_name || rec.sender || null;
              if(!sender_name && (rec.sender_user_id || rec.sender_id)){
                const uid = rec.sender_user_id || rec.sender_id;
                try{ const u = await Users.findOne({ _id: uid }).lean(); if(u) sender_name = u.name || ((u.first_name||'') + ' ' + (u.last_name||'')).trim(); }catch(e){}
              }
            }
          }catch(e){}
        }

        out.push({ id: String(i._id), type: i.type, title: i.title || i.subject || (i.body||'').slice(0,80), body: i.body || i.message || i.text || '', created_at: i.created_at || i.createdAt || new Date(), is_read: readSet.has(String(i._id)), source: i.source || null, sender_name });
      }

      res.status(200).send(wrappSuccessResult(200, out));
    }catch(e){ next(e); }
  });

  // POST /:id/read - mark single notification read
  router.post('/:id/read', async (req, res, next) => {
    try{
      const nid = req.params.id; const orgId = req.organization_id;
      const note = await Notifications.findOne({ _id: nid, organization_id: orgId }).lean();
      if(!note) return res.status(404).send({ status:'Error', statusCode:404, message:'Notification not found' });
      const now = new Date();
      const userIdStr = req.user && (req.user.id !== undefined && req.user.id !== null) ? String(req.user.id) : null;
      // store as string normalized id for reads
  await NotificationReads.updateOne({ notification_id: String(nid), user_id: userIdStr, organization_id: orgId }, { $set: { read_at: now } }, { upsert: true });
      if(redisClient && redisClient.isReady){
        try{
          const publishUserId = userIdCandidates.length ? userIdCandidates[0] : (req.user && (req.user.id || req.user._id));
          await redisClient.publish('notifications', JSON.stringify({ type:'notification.read', record:{ notification_id: String(nid), user_id: publishUserId, organization_id: orgId, read_at: now } }));
        }catch(e){}
      }
      res.status(200).send(wrappSuccessResult(200, { ok:true, read_at: now }));
    }catch(e){ next(e); }
  });

  // GET /unread-count
  router.get('/unread-count', async (req, res, next) => {
    try{
      const orgId = req.organization_id;
  const baseFilter = { organization_id: orgId };
  const tenantIdStr2 = req.user && (req.user.tenant_id !== undefined && req.user.tenant_id !== null) ? String(req.user.tenant_id) : null;
  const userIdStr2 = req.user && (req.user.id !== undefined && req.user.id !== null) ? String(req.user.id) : null;
  const userObjectIdStr2 = req.user && (req.user._id !== undefined && req.user._id !== null) ? String(req.user._id) : null;
  const userIdCandidates2 = [];
  if(userIdStr2) userIdCandidates2.push(userIdStr2);
  if(userObjectIdStr2 && !userIdCandidates2.includes(userObjectIdStr2)) userIdCandidates2.push(userObjectIdStr2);
  const userIdNum2 = userIdStr2 && !isNaN(Number(userIdStr2)) ? Number(userIdStr2) : null;
  const isOrgAdmin2 = req.user && (req.user.role === 'admin' || req.user.role === 'clientadmin' || req.user.role === 'manager');
  baseFilter.$or = [ { recipients: 'all' }, { recipients: { $exists: false } }, { recipients: null } ];
  if(tenantIdStr2){ baseFilter.$or.push({ 'recipients.tenant_ids': tenantIdStr2 }); const tenantNum2 = !isNaN(Number(req.user.tenant_id)) ? Number(req.user.tenant_id) : null; if(tenantNum2 !== null) baseFilter.$or.push({ 'recipients.tenant_ids': tenantNum2 }); }
  else if(isOrgAdmin2){ baseFilter.$or.push({ 'recipients.tenant_ids': { $exists: true } }); }
  if(userIdCandidates2.length){ baseFilter.$or.push({ 'recipients.user_ids': { $in: userIdCandidates2 } }); if(userIdNum2 !== null) baseFilter.$or.push({ 'recipients.user_ids': userIdNum2 }); }
  const notifications = await Notifications.find(baseFilter).select('_id type').lean();
  const ids = notifications.map(n => String(n._id));
  const readQueryUser2 = userIdCandidates2.length ? { $in: userIdCandidates2 } : String(req.user.id);
  const reads = await NotificationReads.find({ notification_id: { $in: ids }, user_id: readQueryUser2 }).select('notification_id').lean();
      const readSet = new Set(reads.map(r => String(r.notification_id)));
      const byType = {};
      let total = 0;
      for(const n of notifications){ const key = n.type || 'other'; if(!byType[key]) byType[key] = 0; if(!readSet.has(String(n._id))){ byType[key] += 1; total += 1; } }
      res.status(200).send(wrappSuccessResult(200, { total, byType }));
    }catch(e){ next(e); }
  });
  // POST /mark-all-read - mark all visible notifications read for current user
  router.post('/mark-all-read', async (req, res, next) => {
    try{
      const orgId = req.organization_id;
  const baseFilter = { organization_id: orgId };
  const tenantIdStr3 = req.user && (req.user.tenant_id !== undefined && req.user.tenant_id !== null) ? String(req.user.tenant_id) : null;
  const userIdStr3 = req.user && (req.user.id !== undefined && req.user.id !== null) ? String(req.user.id) : null;
  const userObjectIdStr3 = req.user && (req.user._id !== undefined && req.user._id !== null) ? String(req.user._id) : null;
  const userIdCandidates3 = [];
  if(userIdStr3) userIdCandidates3.push(userIdStr3);
  if(userObjectIdStr3 && !userIdCandidates3.includes(userObjectIdStr3)) userIdCandidates3.push(userObjectIdStr3);
  const userIdNum3 = req.user && !isNaN(Number(req.user.id)) ? Number(req.user.id) : null;
  const isOrgAdmin3 = req.user && (req.user.role === 'admin' || req.user.role === 'clientadmin' || req.user.role === 'manager');
  baseFilter.$or = [ { recipients: 'all' }, { recipients: { $exists: false } }, { recipients: null } ];
  if(tenantIdStr3){ baseFilter.$or.push({ 'recipients.tenant_ids': tenantIdStr3 }); const tenantNum3 = !isNaN(Number(req.user.tenant_id)) ? Number(req.user.tenant_id) : null; if(tenantNum3 !== null) baseFilter.$or.push({ 'recipients.tenant_ids': tenantNum3 }); }
  else if(isOrgAdmin3){ baseFilter.$or.push({ 'recipients.tenant_ids': { $exists: true } }); }
  if(userIdCandidates3.length){ baseFilter.$or.push({ 'recipients.user_ids': { $in: userIdCandidates3 } }); if(userIdNum3 !== null) baseFilter.$or.push({ 'recipients.user_ids': userIdNum3 }); }
  const notifications = await Notifications.find(baseFilter).select('_id').lean();
  const now = new Date();
  const writeUserId = userIdCandidates3.length ? userIdCandidates3[0] : userIdStr3;
  const ops = notifications.map(n => ({ updateOne: { filter: { notification_id: String(n._id), user_id: writeUserId, organization_id: orgId }, update: { $set: { read_at: now } }, upsert: true } }));
      if(ops.length) await NotificationReads.bulkWrite(ops);
      if(redisClient && redisClient.isReady){
        try{
          await redisClient.publish('notifications', JSON.stringify({ type:'notification.read_bulk', record:{ user_id: req.user.id, organization_id: orgId, count: ops.length } }));
        }catch(e){ console.warn('Redis publish failed for mark-all-read', e); }
      }
      res.status(200).send(wrappSuccessResult(200, { ok:true, count: ops.length }));
    }catch(e){ console.warn('mark-all-read failed', e); next(e); }
  });

  return router;
}
