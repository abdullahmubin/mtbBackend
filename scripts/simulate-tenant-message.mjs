import databaseManager from '../src/config/database.js';
import mongoose from 'mongoose';

(async function(){
  try{
    await databaseManager.connect();
    const db = mongoose.connection.db;
    const orgId = process.argv[2] || 1756056251034;
    const tenantId = process.argv[3] || 'tenant_1756056251034_1756372397937';
    const adminEmail = process.argv[4] || 'adminclient13@gmail.com';

    console.log('Simulating tenant message -> org:', orgId, 'tenant:', tenantId);

    // create a message record
    const msg = {
      organization_id: orgId,
      role: 'tenant',
      sender_tenant_id: tenantId,
      sender_user_id: null,
      subject: 'SIMULATED: tenant message',
      message: 'This is a simulated tenant message for testing tenant->admin notifications',
      created_at: new Date()
    };

    const res = await db.collection('messages').insertOne(msg);
    const created = { ...msg, _id: res.insertedId };
    console.log('Inserted message id', String(created._id));

    // build recipients like controller
    const Users = db.collection('users');
    const orgVal = orgId;
    const orgStr = String(orgVal);
    const orgNum = !isNaN(Number(orgVal)) ? Number(orgVal) : null;
    const orgQuery = orgNum !== null ? { organization_id: { $in: [orgNum, orgStr] } } : { organization_id: orgStr };
    // find admins
    const admins = await Users.find({ $and: [ orgQuery, { role: { $in: ['admin','clientadmin'] } } ] }).toArray();
    console.log('Resolved admins count:', admins.length);
    const recipients = admins && admins.length ? { user_ids: admins.map(a => String(a.id || a._id)) } : { user_ids: [] };

    // create notification
    const Notifications = db.collection('notifications');
    const notif = {
      organization_id: orgId,
      type: 'message',
      title: created.subject || 'Message',
      body: created.message || '',
      created_at: new Date(),
      source: { collection: 'messages', _id: created._id },
      recipients
    };
    const nres = await Notifications.insertOne(notif);
    console.log('Created notification id', String(nres.insertedId), 'recipients:', JSON.stringify(recipients));

    // Show notifications for the admin
    const adminUser = await db.collection('users').findOne({ email: adminEmail });
    if(!adminUser) { console.warn('Admin user not found:', adminEmail); process.exit(0); }
    const userIdCandidates = [ String(adminUser.id || '' ), String(adminUser._id) ].filter(Boolean);
    console.log('Admin user id candidates:', userIdCandidates);

    const q = { $or: [ { recipients: 'all' }, { 'recipients.user_ids': { $in: userIdCandidates } }, { 'recipients.tenant_ids': tenantId } ], organization_id: orgId };
    const found = await Notifications.find(q).sort({ created_at: -1 }).limit(20).toArray();
    console.log('Notifications visible to admin (count):', found.length);
    for(const f of found){ console.log('-', String(f._id), f.title, JSON.stringify(f.recipients)); }

    process.exit(0);
  }catch(e){ console.error('err', e); process.exit(1); }
})();
