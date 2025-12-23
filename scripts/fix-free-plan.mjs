// Fix free plan settings specifically
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function fixFreePlanSettings() {
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
    
    // Update the free plan settings
    const planSettingsCollection = db.collection('plan_settings');
    
    // First check if the free plan exists
    const freePlan = await planSettingsCollection.findOne({ _id: 'free' });
    
    if (freePlan) {
      console.log('Free plan found, tenantDirectoryEnabled:', freePlan.tenantDirectoryEnabled);
      
      // Update the free plan to enable tenant directory
      const result = await planSettingsCollection.updateOne(
        { _id: 'free' },
        { $set: { tenantDirectoryEnabled: true } }
      );
      
      console.log('Free plan updated:', result.modifiedCount > 0 ? 'Yes' : 'No');
    } else {
      console.log('Free plan not found, creating it...');
      
      // Create the free plan settings
      await planSettingsCollection.insertOne({
        _id: 'free',
        name: 'Free',
        tenantDirectoryEnabled: true
      });
      
      console.log('Free plan created with tenant directory enabled');
    }
    
    // Verify the update
    const updatedFreePlan = await planSettingsCollection.findOne({ _id: 'free' });
    console.log('Verification - Free plan tenantDirectoryEnabled:', updatedFreePlan.tenantDirectoryEnabled);
    
    // Also check 'starter' plan which might be used
    const starterPlan = await planSettingsCollection.findOne({ _id: 'starter' });
    if (starterPlan) {
      console.log('Starter plan found, tenantDirectoryEnabled:', starterPlan.tenantDirectoryEnabled);
      
      if (!starterPlan.tenantDirectoryEnabled) {
        const result = await planSettingsCollection.updateOne(
          { _id: 'starter' },
          { $set: { tenantDirectoryEnabled: true } }
        );
        
        console.log('Starter plan updated:', result.modifiedCount > 0 ? 'Yes' : 'No');
      }
    }
    
    // List all plans to make sure they all have tenantDirectoryEnabled=true
    const allPlans = await planSettingsCollection.find({}).toArray();
    console.log(`\nFound ${allPlans.length} plans total`);
    
    let allEnabled = true;
    for (const plan of allPlans) {
      console.log(`- ${plan._id}: tenantDirectoryEnabled=${plan.tenantDirectoryEnabled}`);
      
      if (!plan.tenantDirectoryEnabled) {
        allEnabled = false;
        console.log(`  ⚠️ Updating ${plan._id} plan to enable tenant directory`);
        
        await planSettingsCollection.updateOne(
          { _id: plan._id },
          { $set: { tenantDirectoryEnabled: true } }
        );
      }
    }
    
    console.log(`\n${allEnabled ? '✅' : '⚠️'} VERIFICATION: ${allEnabled ? 'All' : 'Not all'} plans had tenantDirectoryEnabled=true`);
    
    // Final verification
    const allPlansAfterUpdate = await planSettingsCollection.find({}).toArray();
    const allEnabledAfterUpdate = allPlansAfterUpdate.every(plan => plan.tenantDirectoryEnabled === true);
    
    console.log(`\n${allEnabledAfterUpdate ? '✅' : '❌'} VERIFICATION SUCCESSFUL: ${allEnabledAfterUpdate ? 'All' : 'Not all'} plans have tenantDirectoryEnabled=true`);
    
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
fixFreePlanSettings();
