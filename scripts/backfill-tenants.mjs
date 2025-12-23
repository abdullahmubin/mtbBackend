import mongoose from 'mongoose';
import models from '../src/models/index.js';

(async ()=>{
  try{
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tenant-portal';
    console.log('Connecting to', MONGO_URI);
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

    const Tenants = models.TenantsDB;
    // Find a few tenants to update; if none present, create sample tenants
    let tenants = await Tenants.find({}).limit(10).lean();
    if(!tenants || !tenants.length){
      console.log('No tenants found, creating 3 sample tenants');
      const now = new Date().toISOString();
      const sample = [
        { id:`tenant_sample_1_${Date.now()}`, organization_id: 1001, first_name:'Aisha', last_name:'Khan', email:'aisha.khan+sample1@example.com', created_at: now, updated_at: now },
        { id:`tenant_sample_2_${Date.now()}`, organization_id: 1001, first_name:'Bilal', last_name:'Ahmed', email:'bilal.ahmed+sample2@example.com', created_at: now, updated_at: now },
        { id:`tenant_sample_3_${Date.now()}`, organization_id: 1001, first_name:'Chen', last_name:'Lee', email:'chen.lee+sample3@example.com', created_at: now, updated_at: now }
      ];
      await Tenants.insertMany(sample);
      tenants = await Tenants.find({}).limit(10).lean();
    }

    // Update first 5 tenants with sample data in new fields
    const updates = tenants.slice(0,5).map((t,i)=>{
      const patch = {
        billing_address: `${100+i} Example St, Apt ${i+1}`,
        secondary_email: `${t.first_name?.toLowerCase()||'user'}.${t.last_name?.toLowerCase()||'sample'}+sec@example.com`,
        occupants_count: (i%3)+1,
        guarantor_name: i%2===0 ? 'Farah Ali' : 'Samuel Ortiz',
        guarantor_phone: i%2===0 ? '+1-555-999-0000' : '+1-555-888-1111',
        parking_spot: `P-${100+i}`,
        tags: ['sample','auto-backfill', i%2? 'corporate':'personal'],
        custom_metadata: { note: `Backfilled sample ${i+1}`, prefers_contact: i%2? 'phone':'email' },
        updated_at: new Date()
      };
      return Tenants.updateOne({ _id: t._id }, { $set: patch });
    });

    const res = await Promise.all(updates);
    console.log('Backfill applied to', res.length, 'tenants');
    await mongoose.disconnect();
    process.exit(0);
  }catch(e){ console.error('Backfill error', e); process.exit(1); }
})();
