import databaseManager from '../src/config/database.js';
import mongoose from 'mongoose';

(async function(){
  try{
    await databaseManager.connect();
    const db = mongoose.connection.db;
    const email = process.argv[2] || 'adminclient13@gmail.com';
    const newRole = process.argv[3] || 'clientadmin';
    console.log('Setting role for', email, 'to', newRole);
    const res = await db.collection('users').updateOne({ email }, { $set: { role: newRole } });
    console.log('Matched:', res.matchedCount, 'Modified:', res.modifiedCount);
    if(res.matchedCount){ const u = await db.collection('users').findOne({ email }); console.log('User now:', u); }
    process.exit(0);
  }catch(e){ console.error('err', e); process.exit(1); }
})();
