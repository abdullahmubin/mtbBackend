import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const userSchema = new mongoose.Schema({}, { strict: false });
const orgSchema = new mongoose.Schema({}, { strict: false });

mongoose.connect(process.env.connectionString).then(async () => {
  try {
    const Users = mongoose.model('users', userSchema);
    const Organizations = mongoose.model('organizations', orgSchema);
    
    const tenantOrg = 1759010804484;
    console.log('Looking for admins in organization:', tenantOrg);
    
    // Find users in the tenant's organization
    const users = await Users.find({ 
      $or: [
        { organization_id: tenantOrg },
        { organization_id: String(tenantOrg) }
      ]
    }).lean();
    
    console.log('Users in organization:');
    users.forEach(u => {
      console.log('- Email:', u.email, 'Role:', u.role, 'Org:', u.organization_id);
    });
    
    if (users.length === 0) {
      console.log('❌ No admin users found in this organization');
      console.log('🔍 Checking if any admins exist in other organizations...');
      
      const sampleAdmins = await Users.find({ 
        role: { $regex: /admin/i } 
      }).limit(5).lean();
      
      console.log('Sample admin users in system:');
      sampleAdmins.forEach(u => {
        console.log('- Email:', u.email, 'Role:', u.role, 'Org:', u.organization_id);
      });
    }
    
    // Also check organization details
    const org = await Organizations.findOne({ organization_id: tenantOrg });
    console.log('Organization details:', {
      name: org?.name,
      owner: org?.ownerUserId,
      plan: org?.plan
    });
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}).catch(e => { 
  console.error('Connection error:', e.message); 
  process.exit(1); 
});