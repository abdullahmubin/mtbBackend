import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const orgSchema = new mongoose.Schema({}, { strict: false });
const planSchema = new mongoose.Schema({}, { strict: false });

mongoose.connect(process.env.connectionString).then(async () => {
  try {
    console.log('🔍 Checking for organizations with missing plan settings...');
    
    const OrganizationDB = mongoose.model('organizations', orgSchema);
    const PlanSettings = mongoose.model('plan_settings', planSchema);
    
    const organizations = await OrganizationDB.find({}).lean();
    const planSettings = await PlanSettings.find({}).lean();
    const existingPlans = new Set(planSettings.map(p => p._id));
    
    console.log(`Found ${organizations.length} organizations`);
    console.log(`Found ${planSettings.length} plan settings`);
    
    const missingPlans = new Set();
    const organizationsWithMissingPlans = [];
    
    for (const org of organizations) {
      const plan = org.plan || 'free';
      if (!existingPlans.has(plan)) {
        missingPlans.add(plan);
        organizationsWithMissingPlans.push({
          organization_id: org.organization_id,
          name: org.name,
          plan: plan
        });
      }
    }
    
    if (missingPlans.size === 0) {
      console.log('✅ All organizations have valid plan settings');
    } else {
      console.log(`❌ Found ${missingPlans.size} missing plan settings:`, Array.from(missingPlans));
      console.log(`🏢 Affected organizations:`, organizationsWithMissingPlans);
      
      // Create missing plan settings
      for (const planName of missingPlans) {
        // Normalize plan name for _id (remove spaces, special chars, make lowercase)
        const normalizedId = planName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        
        const defaultSettings = {
          _id: normalizedId,
          name: planName,
          tenantDirectoryEnabled: planName !== 'free',
          maxTenants: planName === 'free' ? 5 : (planName === 'starter' ? 25 : 100),
          documentsEnabled: planName !== 'free',
          paymentsEnabled: planName !== 'free', 
          buildingsEnabled: planName !== 'free',
          floorsEnabled: planName !== 'free',
          suitesEnabled: planName !== 'free',
          messagingEnabled: true,
          announcementsEnabled: true,
          contractsEnabled: planName !== 'free'
        };
        
        await PlanSettings.create(defaultSettings);
        console.log(`✅ Created plan settings for: ${planName}`);
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