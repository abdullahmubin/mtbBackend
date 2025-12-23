import databaseManager from '../src/config/database.js';
import mongoose from 'mongoose';

(async()=>{
  try{
    await databaseManager.connect();
    const db = mongoose.connection.db;
    const notifications = db.collection('notifications');
    const users = db.collection('users');

    // Find ticket notifications with recipients.user_ids empty or missing
    const cursor = notifications.find({ type: 'ticket', $or: [ { 'recipients.user_ids': { $exists: false } }, { 'recipients.user_ids': { $size: 0 } } ] });
    let updated = 0;
    while(await cursor.hasNext()){
      const doc = await cursor.next();
      const orgVal = doc.organization_id;
      const orgStr = String(orgVal);
      const orgNum = !isNaN(Number(orgVal)) ? Number(orgVal) : null;
      const orgQuery = orgNum !== null ? { $in: [orgNum, orgStr] } : orgStr;
      const adminDocs = await users.find({ organization_id: orgQuery, role: { $in: ['admin','clientadmin'] } }).toArray();
      const adminIds = adminDocs.map(a => String(a.id || a._id)).filter(Boolean);
      if(adminIds.length){
        await notifications.updateOne({ _id: doc._id }, { $set: { 'recipients.user_ids': adminIds } });
        updated++;
        console.log('Updated notif', String(doc._id), 'with admins', adminIds);
      }
    }
    console.log('Backfill completed, updated', updated, 'notifications');
    process.exit(0);
  }catch(e){ console.error('Backfill failed', e); process.exit(1); }
})();
