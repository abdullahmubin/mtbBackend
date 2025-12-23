import databaseManager from '../src/config/database.js';
import mongoose from 'mongoose';
(async()=>{
  try{
    await databaseManager.connect();
    const db = mongoose.connection.db;
    const org = 1756056251034;
    const users = await db.collection('users').find({ organization_id: { $in: [org, String(org)] }, role: { $in: ['admin','clientadmin'] } }).toArray();
    console.log('admins count', users.length);
    for(const u of users) console.log({ id: u.id, _id: u._id.toString(), role: u.role });
    process.exit(0);
  }catch(e){ console.error(e); process.exit(1);} })();
