// Permanently fix plan settings and modify them to persist changes
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function permanentlyFixPlanSettings() {
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
    
    // First, we'll completely drop and recreate the 'free' plan to ensure it's clean
    await planSettingsCollection.deleteOne({ _id: 'free' });
    console.log('Deleted existing free plan');
    
    // Create a fresh 'free' plan with tenant directory enabled
    await planSettingsCollection.insertOne({
      _id: 'free',
      name: 'Free',
      tenantDirectoryEnabled: true,
      features: {
        tenant_directory: true,
        messaging: true,
        basic_reports: true
      },
      description: "Free plan with basic features",
      created_at: new Date(),
      updated_at: new Date()
    });
    console.log('Created new free plan with tenantDirectoryEnabled=true');
    
    // Let's create an index on the tenantDirectoryEnabled field to make queries faster
    await planSettingsCollection.createIndex({ tenantDirectoryEnabled: 1 });
    console.log('Created index on tenantDirectoryEnabled field');
    
    // Update all organizations to ensure they have a valid plan
    const organizationsCollection = db.collection('organizations');
    const organizations = await organizationsCollection.find({}).toArray();
    
    console.log(`\nFound ${organizations.length} organizations`);
    
    for (const org of organizations) {
      const orgId = org._id;
      const planId = org.plan || 'free';
      
      console.log(`- Organization ${orgId}: Plan=${planId}`);
      
      // Make sure the plan exists
      const plan = await planSettingsCollection.findOne({ _id: planId });
      
      if (!plan) {
        console.log(`  ⚠️ Plan ${planId} not found, setting to free`);
        
        await organizationsCollection.updateOne(
          { _id: orgId },
          { $set: { plan: 'free' } }
        );
      }
    }
    
    // Double check all plan settings
    const allPlans = await planSettingsCollection.find({}).toArray();
    console.log(`\nFinal verification: ${allPlans.length} plans total`);
    
    for (const plan of allPlans) {
      console.log(`- ${plan._id}: tenantDirectoryEnabled=${plan.tenantDirectoryEnabled}`);
      
      if (plan.tenantDirectoryEnabled !== true) {
        console.log(`  ⚠️ Fixing plan ${plan._id}`);
        
        // Drop and recreate this plan
        await planSettingsCollection.deleteOne({ _id: plan._id });
        
        await planSettingsCollection.insertOne({
          _id: plan._id,
          name: plan.name || plan._id.charAt(0).toUpperCase() + plan._id.slice(1),
          tenantDirectoryEnabled: true,
          features: plan.features || {
            tenant_directory: true,
            messaging: true,
            basic_reports: true
          },
          description: plan.description || `${plan._id.charAt(0).toUpperCase() + plan._id.slice(1)} plan`,
          created_at: new Date(),
          updated_at: new Date()
        });
        
        console.log(`  ✅ Recreated plan ${plan._id} with tenantDirectoryEnabled=true`);
      }
    }
    
    // Final verification
    const finalPlans = await planSettingsCollection.find({}).toArray();
    console.log(`\nFinal verification: ${finalPlans.length} plans total`);
    
    let allEnabled = true;
    for (const plan of finalPlans) {
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
permanentlyFixPlanSettings();
