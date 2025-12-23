import databaseManager from '../src/config/database.js';
import mongoose from 'mongoose';
(async()=>{
  try{
    await databaseManager.connect();
    const db = mongoose.connection.db;
    const tenantId = 'tenant_1756056251034_1756372397937';
    const tenant = await db.collection('tenants').findOne({ id: tenantId });
    console.log('tenant doc:', tenant);
    const users = await db.collection('users').find({ tenant_id: tenantId }).toArray();
    console.log('users for tenant:', users.length);
    for(const u of users) console.log({ id: u.id, _id: String(u._id), email: u.email, role: u.role, organization_id: u.organization_id });
    process.exit(0);
  }catch(e){ console.error(e); process.exit(1); }
})();
