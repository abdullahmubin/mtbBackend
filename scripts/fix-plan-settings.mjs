// Final fix for tenant login - focusing on plan settings
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function fixPlanSettings() {
  let client = null;
  
  try {
    // Connect directly to MongoDB using MongoClient
    const uri = process.env.connectionString;
    console.log('Connecting to MongoDB using connection string:', uri);
    
    client = new MongoClient(uri);
    await client.connect();
    console.log('Connected to MongoDB');
    
    // Use the 'test' database
    const db = client.db('test');
    
    // Fix plan settings for all plans to ensure tenant directory is enabled
    console.log('\nFixing plan settings for all plans...');
    const planSettingsCollection = db.collection('plan_settings');
    
    // 1. Fix free plan
    const freePlan = await planSettingsCollection.findOne({ _id: 'free' });
    if (freePlan) {
      console.log('Free plan found, tenantDirectoryEnabled:', freePlan.tenantDirectoryEnabled);
      
      // Force update to true
      const freeUpdateResult = await planSettingsCollection.updateOne(
        { _id: 'free' },
        { $set: { tenantDirectoryEnabled: true } }
      );
      console.log('Free plan updated:', freeUpdateResult.modifiedCount > 0 ? 'Yes' : 'No');
    } else {
      console.log('Free plan not found, creating it...');
      await planSettingsCollection.insertOne({
        _id: 'free',
        name: 'Free',
        tenantLimit: 5,
        buildingLimit: 1,
        floorLimit: 5,
        suiteLimit: 20,
        tenantDocumentLimit: 1,
        price: 0,
        yearly: null,
        emailQuota: 10,
        smsQuota: 5,
        tenantDirectoryEnabled: true
      });
      console.log('Free plan created');
    }
    
    // 2. Check and update all other plans
    const allPlans = await planSettingsCollection.find({}).toArray();
    console.log(`\nFound ${allPlans.length} plans total`);
    
    for (const plan of allPlans) {
      if (plan._id !== 'free') {
        console.log(`Checking plan: ${plan._id}, tenantDirectoryEnabled:`, plan.tenantDirectoryEnabled);
        
        if (plan.tenantDirectoryEnabled !== true) {
          const updateResult = await planSettingsCollection.updateOne(
            { _id: plan._id },
            { $set: { tenantDirectoryEnabled: true } }
          );
          console.log(`Plan ${plan._id} updated:`, updateResult.modifiedCount > 0 ? 'Yes' : 'No');
        }
      }
    }
    
    // 3. Verify all plans have tenantDirectoryEnabled=true
    const verifyPlans = await planSettingsCollection.find({}).toArray();
    let allEnabled = true;
    
    for (const plan of verifyPlans) {
      if (plan.tenantDirectoryEnabled !== true) {
        console.log(`WARNING: Plan ${plan._id} still has tenantDirectoryEnabled=false!`);
        allEnabled = false;
      }
    }
    
    if (allEnabled) {
      console.log('\n✅ VERIFICATION SUCCESSFUL: All plans have tenantDirectoryEnabled=true');
    } else {
      console.log('\n❌ VERIFICATION FAILED: Some plans still have tenantDirectoryEnabled=false');
    }
    
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
fixPlanSettings();
