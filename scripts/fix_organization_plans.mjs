import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const orgSchema = new mongoose.Schema({}, { strict: false });

// Plan name mapping from descriptive names to proper plan IDs
const PLAN_MAPPING = {
  'Affordable for small landlords': 'starter',
  'Professional': 'pro', 
  'Business': 'business',
  'Best for growing portfolios': 'enterprise',
  'HobbyList': 'HobbyList', // Keep as is
  'Free': 'free',
  'Starter': 'starter',
  'Pro': 'pro',
  'Enterprise': 'enterprise'
};

mongoose.connect(process.env.connectionString).then(async () => {
  try {
    console.log('🔧 Fixing organization plan names...');
    
    const OrganizationDB = mongoose.model('organizations', orgSchema);
    
    const organizations = await OrganizationDB.find({}).lean();
    let updated = 0;
    
    for (const org of organizations) {
      const currentPlan = org.plan;
      const correctPlan = PLAN_MAPPING[currentPlan] || currentPlan;
      
      if (currentPlan !== correctPlan) {
        console.log(`📝 Updating org ${org.organization_id}: "${currentPlan}" → "${correctPlan}"`);
        await OrganizationDB.updateOne(
          { organization_id: org.organization_id },
          { $set: { plan: correctPlan } }
        );
        updated++;
      }
    }
    
    console.log(`✅ Updated ${updated} organizations with correct plan names`);
    
    // Now check if we need to create any missing plan settings
    const planSchema = new mongoose.Schema({
      _id: { type: String },
      name: String,
      tenantDirectoryEnabled: Boolean,
      maxTenants: Number,
      documentsEnabled: Boolean,
      paymentsEnabled: Boolean,
      buildingsEnabled: Boolean
    }, { _id: false });
    
    const PlanSettings = mongoose.model('plan_settings', planSchema);
    const requiredPlans = ['free', 'starter', 'pro', 'business', 'enterprise', 'HobbyList'];
    
    for (const planId of requiredPlans) {
      const exists = await PlanSettings.findOne({ _id: planId });
      if (!exists) {
        const settings = {
          _id: planId,
          name: planId.charAt(0).toUpperCase() + planId.slice(1),
          tenantDirectoryEnabled: planId !== 'free',
          maxTenants: planId === 'free' ? 5 : (planId === 'starter' ? 25 : (planId === 'pro' ? 50 : 100)),
          documentsEnabled: planId !== 'free',
          paymentsEnabled: planId !== 'free', 
          buildingsEnabled: planId !== 'free',
          messagingEnabled: true,
          announcementsEnabled: true,
          contractsEnabled: planId !== 'free'
        };
        
        await PlanSettings.create(settings);
        console.log(`✅ Created plan settings for: ${planId}`);
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