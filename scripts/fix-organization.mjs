// Fix organization and plan settings
import { MongoClient } from 'mongodb';

async function fixOrganizationAndPlanSettings() {
  try {
    // MongoDB Atlas connection string
    const uri = "mongodb+srv://amubin19:QZQSWC7ZoM9FZJoS@cluster0.gad2ky6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
    
    console.log('Connecting to MongoDB Atlas...');
    const client = new MongoClient(uri);
    await client.connect();
    console.log('Connected to MongoDB Atlas');
    
    // Use the test database
    const db = client.db('test');
    
    // Get the tenant
    const tenantsCollection = db.collection('tenants');
    const tenant = await tenantsCollection.findOne({ email: 'sarah.williams@example.com' });
    
    if (tenant) {
      console.log('Tenant found:');
      console.log('- ID:', tenant._id);
      console.log('- Organization ID:', tenant.organization_id);
      
      // Check if organization exists
      const organizationsCollection = db.collection('organizations');
      const organization = await organizationsCollection.findOne({ _id: tenant.organization_id });
      
      if (!organization) {
        console.log('Organization not found, creating a new one...');
        
        // Create a new organization
        const newOrganization = {
          _id: tenant.organization_id,
          id: `org_${tenant.organization_id}`,
          name: "Demo Property Management",
          plan: "free",
          created_at: new Date(),
          updated_at: new Date(),
          status: "active",
          address: "123 Main Street",
          city: "New York",
          state: "NY",
          zip: "10001",
          phone: "+1-555-1234",
          email: "admin@demoproperty.com",
          website: "https://demoproperty.com",
          logo: null
        };
        
        const insertResult = await organizationsCollection.insertOne(newOrganization);
        console.log('Organization created:', insertResult.acknowledged ? 'Yes' : 'No');
      } else {
        console.log('Organization already exists');
      }
      
      // Update the "free" plan to enable tenant directory
      const planSettingsCollection = db.collection('plan_settings');
      const freePlan = await planSettingsCollection.findOne({ _id: "free" });
      
      if (freePlan) {
        console.log('Free plan settings found, updating...');
        
        const updateResult = await planSettingsCollection.updateOne(
          { _id: "free" },
          { $set: { tenantDirectoryEnabled: true } }
        );
        
        console.log('Free plan updated:', updateResult.modifiedCount > 0 ? 'Yes' : 'No');
      } else {
        console.log('Free plan settings not found, creating...');
        
        // Create free plan settings
        const newFreePlan = {
          _id: "free",
          plan: "free",
          name: "Free",
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
        };
        
        const insertResult = await planSettingsCollection.insertOne(newFreePlan);
        console.log('Free plan created:', insertResult.acknowledged ? 'Yes' : 'No');
      }
      
      // Verify final state
      const updatedFreePlan = await planSettingsCollection.findOne({ _id: "free" });
      console.log('\nFinal free plan state:');
      console.log('- Tenant directory enabled:', updatedFreePlan.tenantDirectoryEnabled);
      
      // Verify organization
      const updatedOrganization = await organizationsCollection.findOne({ _id: tenant.organization_id });
      if (updatedOrganization) {
        console.log('\nFinal organization state:');
        console.log('- ID:', updatedOrganization._id);
        console.log('- Name:', updatedOrganization.name);
        console.log('- Plan:', updatedOrganization.plan);
      }
    } else {
      console.log('Tenant not found');
    }
    
    // Close the connection
    await client.close();
    console.log('\nDisconnected from MongoDB Atlas');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the function
fixOrganizationAndPlanSettings();
