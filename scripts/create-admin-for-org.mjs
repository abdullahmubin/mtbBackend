import databaseManager from '../src/config/database.js';
import mongoose from 'mongoose';

(async()=>{
  try{
    await databaseManager.connect();
    const db = mongoose.connection.db;
    const orgId = 1756056251034; // org observed in notifications

    // compute next numeric id (max+1) if numeric ids exist
    const usersColl = db.collection('users');
    const maxDoc = await usersColl.find({ id: { $type: 'number' } }).sort({ id: -1 }).limit(1).toArray();
    const nextId = (maxDoc && maxDoc.length) ? (maxDoc[0].id + 1) : 100;

    const newUser = {
      id: nextId,
      organization_id: orgId,
      role: 'admin',
      email: `admin+${String(orgId).slice(-4)}@example.com`,
      name: `OrgAdmin_${String(orgId).slice(-6)}`,
      created_at: new Date(),
      updated_at: new Date()
    };

    const r = await usersColl.insertOne(newUser);
    console.log('Inserted admin user id:', r.insertedId.toString(), 'payload id:', newUser.id);
    process.exit(0);
  }catch(e){ console.error('Failed', e); process.exit(1); }
})();
