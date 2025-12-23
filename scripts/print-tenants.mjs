import mongoose from 'mongoose';
import models from '../src/models/index.js';
import dotenv from 'dotenv';
dotenv.config();

(async ()=>{
  try{
    const conn = process.env.connectionString || process.env.MONGO_URI || 'mongodb://localhost:27017/tenant-portal';
    console.log('Connecting to', conn);
    await mongoose.connect(conn);
    const Tenants = models.TenantsDB;
    const rows = await Tenants.find({}).limit(5).lean();
    for(const r of rows){
      console.log('TENANT', r.id || r._id, 'name:', r.first_name, r.last_name, 'billing:', r.billing_address, 'tags:', r.tags, 'occupants:', r.occupants_count);
    }
    await mongoose.disconnect();
    process.exit(0);
  }catch(e){ console.error('print error', e); process.exit(1); }
})();
