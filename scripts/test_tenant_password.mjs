import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

dotenv.config();

const tenantSchema = new mongoose.Schema({}, { strict: false });

mongoose.connect(process.env.connectionString).then(async () => {
  try {
    const TenantsDB = mongoose.model('tenants', tenantSchema);
    
    const tenant = await TenantsDB.findOne({ email: '2assb123tenant@gmail.com' });
    
    if (!tenant) {
      console.log('❌ Tenant not found');
      process.exit(1);
    }
    
    console.log('✅ Tenant found');
    console.log('- Has password:', !!tenant.password);
    console.log('- Password set:', tenant.password_set);
    
    const testPassword = '123456789';
    if (tenant.password) {
      const passwordMatch = await bcrypt.compare(testPassword, tenant.password);
      console.log('- Password match for "123456789":', passwordMatch);
      
      // Test a few common passwords
      const commonPasswords = ['123456789', 'password', 'admin', '123456'];
      for (const pwd of commonPasswords) {
        const match = await bcrypt.compare(pwd, tenant.password);
        if (match) {
          console.log(`✅ Password "${pwd}" matches!`);
          break;
        }
      }
    }
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}).catch(e => { 
  console.error('Connection error:', e.message); 
  process.exit(1); 
});