// Check the free plan settings in the database
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function checkAndFixPlanSettings() {
  let client = null;
  
  try {
    // Connect directly to MongoDB using MongoClient
    const uri = process.env.connectionString;
    console.log('Connecting to MongoDB...');
    
    client = new MongoClient(uri);
    await client.connect();
    console.log('Connected to MongoDB');
    
    // Use the 'test' database
    const db = client.db('test');
    
    // Get the plan settings collection
    const planSettingsCollection = db.collection('plan_settings');
    
    // Find all plan settings
    const planSettings = await planSettingsCollection.find({}).toArray();
    console.log(`Found ${planSettings.length} plan settings`);
    
    // Check each plan setting
    for (const plan of planSettings) {
      console.log(`- ${plan._id}: tenantDirectoryEnabled=${plan.tenantDirectoryEnabled}`);
      
      // Fix any plan settings without tenantDirectoryEnabled
      if (plan.tenantDirectoryEnabled !== true) {
        console.log(`  ⚠️ Fixing plan ${plan._id}`);
        
        await planSettingsCollection.updateOne(
          { _id: plan._id },
          { $set: { tenantDirectoryEnabled: true } }
        );
        
        // Verify the update
        const updatedPlan = await planSettingsCollection.findOne({ _id: plan._id });
        console.log(`  ✅ Plan ${plan._id} updated: tenantDirectoryEnabled=${updatedPlan.tenantDirectoryEnabled}`);
      }
    }
    
    // Check for specific plan used by our test tenant
    const organization = await db.collection('organizations').findOne({ 
      $or: [
        { _id: 1756056251034 },
        { organization_id: 1756056251034 }
      ]
    });
    
    if (organization) {
      console.log(`\nOrganization found: ${organization.name}`);
      console.log(`Plan: ${organization.plan}`);
      
      // Get the plan settings for this organization
      const orgPlanId = organization.plan || 'free';
      const orgPlan = await planSettingsCollection.findOne({ _id: orgPlanId });
      
      if (orgPlan) {
        console.log(`Plan settings for ${orgPlanId}: tenantDirectoryEnabled=${orgPlan.tenantDirectoryEnabled}`);
        
        // Ensure this plan has tenant directory enabled
        if (orgPlan.tenantDirectoryEnabled !== true) {
          console.log(`⚠️ Fixing plan ${orgPlanId} for organization`);
          
          await planSettingsCollection.updateOne(
            { _id: orgPlanId },
            { $set: { tenantDirectoryEnabled: true } }
          );
          
          // Verify the update
          const updatedOrgPlan = await planSettingsCollection.findOne({ _id: orgPlanId });
          console.log(`✅ Plan ${orgPlanId} updated: tenantDirectoryEnabled=${updatedOrgPlan.tenantDirectoryEnabled}`);
        }
      } else {
        console.log(`⚠️ No plan settings found for ${orgPlanId}, creating...`);
        
        await planSettingsCollection.insertOne({
          _id: orgPlanId,
          name: orgPlanId.charAt(0).toUpperCase() + orgPlanId.slice(1),
          tenantDirectoryEnabled: true,
          created_at: new Date(),
          updated_at: new Date()
        });
        
        console.log(`✅ Created plan settings for ${orgPlanId} with tenantDirectoryEnabled=true`);
      }
    } else {
      console.log(`\n⚠️ Organization with ID 1756056251034 not found`);
    }
    
    // Final verification
    const allPlans = await planSettingsCollection.find({}).toArray();
    console.log(`\nFinal verification: ${allPlans.length} plans total`);
    
    let allEnabled = true;
    for (const plan of allPlans) {
      console.log(`- ${plan._id}: tenantDirectoryEnabled=${plan.tenantDirectoryEnabled}`);
      if (plan.tenantDirectoryEnabled !== true) {
        allEnabled = false;
      }
    }
    
    console.log(`\n${allEnabled ? '✅' : '❌'} VERIFICATION: ${allEnabled ? 'All' : 'Not all'} plans have tenantDirectoryEnabled=true`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (client) {
      await client.close();
      console.log('MongoDB connection closed');
    }
  }
}

// Run the function
checkAndFixPlanSettings();
