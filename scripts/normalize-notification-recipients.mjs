import databaseManager from '../src/config/database.js';
import mongoose from 'mongoose';

// This script normalizes notification recipient IDs to strings for consistency.
// Usage: node scripts/normalize-notification-recipients.mjs

async function run(){
  try{
    await databaseManager.connect();
    const db = mongoose.connection.db;
    console.log('Connected to DB, starting normalization');

    const notifications = db.collection('notifications');
    const reads = db.collection('notification_reads');

    // Normalize recipients.user_ids and recipients.tenant_ids to string arrays
    const cursor = notifications.find({});
    let count = 0;
    while(await cursor.hasNext()){
      const doc = await cursor.next();
      const update = {};
      if(doc.recipients){
        if(Array.isArray(doc.recipients.user_ids)){
          const normalized = Array.from(new Set(doc.recipients.user_ids.map(x => String(x))));
          if(JSON.stringify(normalized) !== JSON.stringify(doc.recipients.user_ids)) update['recipients.user_ids'] = normalized;
        }
        if(Array.isArray(doc.recipients.tenant_ids)){
          const normalized = Array.from(new Set(doc.recipients.tenant_ids.map(x => String(x))));
          if(JSON.stringify(normalized) !== JSON.stringify(doc.recipients.tenant_ids)) update['recipients.tenant_ids'] = normalized;
        }
      }
      if(Object.keys(update).length){
        await notifications.updateOne({ _id: doc._id }, { $set: update });
        count++;
      }
    }
    console.log('Normalized recipients for', count, 'notifications');

    // Normalize notification_reads.user_id to string
    const cursor2 = reads.find({});
    let rcount = 0;
    while(await cursor2.hasNext()){
      const doc = await cursor2.next();
      if(doc.user_id !== undefined && doc.user_id !== null){
        const s = String(doc.user_id);
        if(doc.user_id !== s){
          await reads.updateOne({ _id: doc._id }, { $set: { user_id: s } });
          rcount++;
        }
      }
    }
    console.log('Normalized user_id for', rcount, 'notification_reads');

    console.log('Done.');
    process.exit(0);
  }catch(e){ console.error('Failed', e); process.exit(1); }
}

run();
