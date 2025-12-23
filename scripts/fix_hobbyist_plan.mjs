import dotenv from 'dotenv';
import mongoose from 'mongoose';
import '../src/models/registry.js';

dotenv.config();

mongoose.connect(process.env.connectionString).then(async () => {
  try {
    const PlanSettings = mongoose.model('plan_settings');
    const plans = await PlanSettings.find({}).lean();
    console.log('Available plan settings:');
    plans.forEach(p => console.log('- _id:', p._id, 'tenantDirectoryEnabled:', p.tenantDirectoryEnabled));
    
    // Check if HobbyList plan exists
    const hobbyistPlan = await PlanSettings.findOne({ _id: 'HobbyList' }).lean();
    console.log('\nHobbyist plan exists:', !!hobbyistPlan);
    
    if (!hobbyistPlan) {
      console.log('\nCreating HobbyList plan settings...');
      await PlanSettings.create({
        _id: 'HobbyList',
        name: 'HobbyList',
        tenantDirectoryEnabled: true,
        maxTenants: 50,
        documentsEnabled: true,
        paymentsEnabled: true,
        buildingsEnabled: true
      });
      console.log('✅ HobbyList plan settings created');
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