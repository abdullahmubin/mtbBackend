import databaseManager from '../src/config/database.js';
import mongoose from 'mongoose';
(async()=>{
  try{
    await databaseManager.connect();
    const db = mongoose.connection.db;
    const docs = await db.collection('organizations').find({}).limit(20).toArray();
    console.log('found orgs', docs.length);
    docs.forEach(d=>console.log({ _id: String(d._id), id: d.id, organization_id: d.organization_id, name: d.name }));
    process.exit(0);
  }catch(e){ console.error(e); process.exit(1); }
})();
