import databaseManager from '../src/config/database.js';
import mongoose from 'mongoose';

(async function(){
  try{
    await databaseManager.connect();
    const db = mongoose.connection.db;
    const email = process.argv[2] || 'adminclient13@gmail.com';
    console.log('Inspecting notifications for user email:', email);

    const user = await db.collection('users').findOne({ email });
    if(!user){
      console.error('No user found with that email');
      process.exit(2);
    }

    console.log('User:');
    console.log('  _id:', user._id && String(user._id));
    console.log('  id:', user.id !== undefined ? String(user.id) : '(none)');
    console.log('  email:', user.email);
    console.log('  organization_id:', user.organization_id || user.organization || user.org || '(none)');
    console.log('  tenant_id:', user.tenant_id || user.tenant || '(none)');
    console.log('  roles:', user.roles || user.role || '(none)');

    // Build candidate id shapes
    const userIdCandidates = new Set();
    if(user.id !== undefined) userIdCandidates.add(String(user.id));
    if(user._id) userIdCandidates.add(String(user._id));
    if(user._id && user._id.toString) userIdCandidates.add(user._id.toString());

    const tenantId = user.tenant_id || user.tenant || null;

    const qOr = [];
    // notifications explicitly addressed to this user
    qOr.push({ 'recipients.user_ids': { $in: Array.from(userIdCandidates) } });
    // notifications addressed to this tenant
    if(tenantId) qOr.push({ 'recipients.tenant_ids': tenantId });
    // notifications addressed to all
    qOr.push({ recipients: 'all' });

    const q = { $or: qOr };
    console.log('Querying notifications with:', JSON.stringify(q));

    const notifications = await db.collection('notifications').find(q).sort({ created_at: -1 }).limit(200).toArray();
    console.log('Found', notifications.length, 'matching notifications');
    for(const n of notifications){
      console.log('---');
      console.log('id:', n._id.toString());
      console.log('created_at:', n.created_at);
      console.log('title:', n.title);
      console.log('body:', n.body);
      console.log('recipients:', JSON.stringify(n.recipients));
      console.log('meta:', JSON.stringify(n.meta || {}));
    }

    // Check notification_reads for this user
    const userIdForReads = Array.from(userIdCandidates)[0] || (user._id && String(user._id));
    if(userIdForReads){
      const reads = await db.collection('notification_reads').find({ user_id: userIdForReads }).sort({ read_at: -1 }).limit(50).toArray();
      console.log('Found', reads.length, 'notification_reads for user id', userIdForReads);
      for(const r of reads){
        console.log('-', String(r.notification_id || r.notification), 'read_at:', r.read_at);
      }
    } else {
      console.log('No user id candidate available to query notification_reads');
    }

    process.exit(0);
  }catch(e){ console.error('err', e); process.exit(1); }
})();
