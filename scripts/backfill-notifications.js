#!/usr/bin/env node
import mongoose from 'mongoose';
import 'dotenv/config';
import { getModel } from '../src/models/registry.js';
import redisClient from '../src/utils/redisClient.js';

async function main(){
  const mongo = process.env.MONGO_URI || 'mongodb://localhost:27017/tenant-portal';
  await mongoose.connect(mongo, { dbName: process.env.MONGO_DB || undefined });
  const Notifications = getModel('notifications');
  const NotificationReads = getModel('notification_reads');
  const Messages = getModel('messages');
  const SmsMessages = getModel('sms_messages');
  const Announcements = getModel('announcements');

  console.log('Starting backfill of notifications...');

  const docs = [];
  const msgs = await Messages.find({}).lean().limit(10000);
  const sms = await SmsMessages.find({}).lean().limit(10000);
  const ann = await Announcements.find({}).lean().limit(10000);

  for(const m of msgs){
    docs.push({
      organization_id: m.organization_id,
      type: 'message',
      title: m.subject || m.text || m.message || 'Message',
      body: m.message || m.text || m.body || '',
      created_at: m.created_at || m.createdAt || new Date(),
      source: { collection: 'messages', _id: m._id },
      recipients: (m.to_tenant_id ? { tenant_ids: [m.to_tenant_id] } : (m.role && (m.role === 'admin' || m.role === 'clientadmin') ? 'all' : null))
    });
  }

  for(const s of sms){
    docs.push({
      organization_id: s.organization_id,
      type: 'sms',
      title: (s.text || s.message || '').slice(0,80) || 'SMS',
      body: s.text || s.message || '',
      created_at: s.created_at || s.createdAt || new Date(),
      source: { collection: 'sms_messages', _id: s._id },
      recipients: (s.to_tenant_id ? { tenant_ids: [s.to_tenant_id] } : (s.role && (s.role === 'admin' || s.role === 'clientadmin') ? 'all' : null))
    });
  }

  for(const a of ann){
    docs.push({
      organization_id: a.organization_id,
      type: 'announcement',
      title: a.title || a.subject || (a.body||'').slice(0,80),
      body: a.body || '',
      created_at: a.created_at || a.createdAt || new Date(),
      source: { collection: 'announcements', _id: a._id },
      recipients: a.recipients || 'all'
    });
  }

  console.log('Prepared', docs.length, 'notification docs to insert');
  for(const d of docs){
    const existing = await Notifications.findOne({ 'source.collection': d.source?.collection, 'source._id': d.source?._id, organization_id: d.organization_id }).lean();
    if(existing) continue;
    const created = await Notifications.create(d);
    // backfill read rows if original had is_read flags (best-effort)
    if(d.source && d.source.collection === 'sms_messages'){
      const orig = await SmsMessages.findById(d.source._id).lean();
      if(orig?.is_read && orig?.recipient_user_id){
        await NotificationReads.updateOne({ notification_id: created._id, user_id: orig.recipient_user_id, organization_id: created.organization_id }, { $set: { read_at: new Date() } }, { upsert: true });
      }
    }
  }

  console.log('Backfill complete');
  await mongoose.disconnect();
  try{ if(redisClient) await redisClient.quit(); }catch(e){}
}

main().catch(err=>{ console.error(err); process.exit(1); });
