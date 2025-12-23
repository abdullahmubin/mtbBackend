import databaseManager from '../src/config/database.js';
import mongoose from 'mongoose';
(async()=>{
  try{
    await databaseManager.connect();
    const db = mongoose.connection.db;
    const users = await db.collection('users').find({ role: { $in: ['admin','clientadmin'] } }).toArray();
    console.log('total admins:', users.length);
    for(const u of users){
      console.log({ id: u.id, _id: String(u._id), organization_id: u.organization_id, email: u.email, role: u.role });
    }
    process.exit(0);
  }catch(e){ console.error(e); process.exit(1); }
})();
