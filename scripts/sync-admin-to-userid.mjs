import databaseManager from '../src/config/database.js';
import mongoose from 'mongoose';

(async function(){
  try{
    await databaseManager.connect();
    const db = mongoose.connection.db;
    const email = process.argv[2] || 'adminclient13@gmail.com';
    const matchId = process.argv[3] || '12';
    console.log('Syncing notifications addressed to ID', matchId, 'to user', email);

    const user = await db.collection('users').findOne({ email });
    if(!user){ console.error('User not found'); process.exit(2); }
    const userIdStr = String(user._id);

    // Find notifications where recipients.user_ids contains matchId
    const q = { 'recipients.user_ids': matchId };
    const docs = await db.collection('notifications').find(q).toArray();
    console.log('Found', docs.length, 'notifications targeting', matchId);

    let updated = 0;
    for(const d of docs){
      const userIds = (d.recipients && d.recipients.user_ids) || [];
      if(!userIds.map(String).includes(userIdStr)){
        userIds.push(userIdStr);
        // dedupe
        const uniq = Array.from(new Set(userIds.map(String)));
        await db.collection('notifications').updateOne({ _id: d._id }, { $set: { 'recipients.user_ids': uniq } });
        updated++;
        console.log('Updated', d._id.toString());
      }
    }

    console.log('Sync complete. Updated count:', updated);
    process.exit(0);
  }catch(e){ console.error('err', e); process.exit(1); }
})();
