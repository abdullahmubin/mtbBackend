import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

mongoose.connect(process.env.connectionString).then(async () => {
  const Users = mongoose.model('users', new mongoose.Schema({}, { strict: false }));
  const orgId = 1759010804484;
  
  console.log('Checking users in organization:', orgId);
  const users = await Users.find({ 
    $or: [{ organization_id: orgId }, { organization_id: String(orgId) }] 
  }).lean();
  
  console.log('Users found:', users.length);
  users.forEach(u => {
    console.log('- Email:', u.email);
    console.log('  Role (raw):', u.role);
    console.log('  ID:', u.id || u._id);
    console.log('  Org ID:', u.organization_id);
    console.log('');
  });
  
  // Test the same query that the message controller uses
  console.log('Testing admin query that message controller uses...');
  const orgVal = orgId;
  const orgStr = String(orgVal);
  const orgNum = !isNaN(Number(orgVal)) ? Number(orgVal) : null;
  const orgQuery = orgNum !== null ? { $in: [orgNum, orgStr] } : orgStr;
  
  console.log('Query being used:', { organization_id: orgQuery, role: { $in: ['admin', 'clientadmin'] } });
  
  const admins = await Users.find({ 
    organization_id: orgQuery, 
    role: { $in: ['admin', 'clientadmin'] } 
  }, { id: 1 }).lean();
  
  console.log('Admins found by controller query:', admins.length);
  
  process.exit(0);
}).catch(e => { 
  console.error('Connection error:', e.message); 
  process.exit(1); 
});