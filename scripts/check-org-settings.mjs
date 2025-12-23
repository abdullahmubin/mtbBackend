// Check and update organization tenant directory settings
import { MongoClient } from 'mongodb';

async function checkAndUpdateOrgSettings() {
  try {
    // MongoDB Atlas connection string
    const uri = "mongodb+srv://amubin19:QZQSWC7ZoM9FZJoS@cluster0.gad2ky6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
    
    console.log('Connecting to MongoDB Atlas...');
    const client = new MongoClient(uri);
    await client.connect();
    console.log('Connected to MongoDB Atlas');
    
    // Use the test database (where we found the tenant)
    const db = client.db('test');
    
    // Get the tenant
    const tenantsCollection = db.collection('tenants');
    const tenant = await tenantsCollection.findOne({ email: 'sarah.williams@example.com' });
    
    if (tenant) {
      console.log('Tenant found:');
      console.log('- ID:', tenant._id);
      console.log('- Name:', tenant.first_name, tenant.last_name);
      console.log('- Email:', tenant.email);
      console.log('- Has portal access:', tenant.has_portal_access);
      console.log('- Has password:', !!tenant.password);
      console.log('- Organization ID:', tenant.organization_id);
      
      // Find the organization
      const organizationsCollection = db.collection('organizations');
      const organization = await organizationsCollection.findOne({ _id: tenant.organization_id });
      
      if (organization) {
        console.log('\nOrganization found:');
        console.log('- ID:', organization._id);
        console.log('- Name:', organization.name);
        console.log('- Plan:', organization.plan);
        
        // Check plan settings
        const planSettingsCollection = db.collection('plan_settings');
        const planId = organization.plan || 'free';
        console.log('Looking for plan settings with ID:', planId);
        
        const planSettings = await planSettingsCollection.findOne({ _id: planId });
        
        if (planSettings) {
          console.log('\nPlan settings found:');
          console.log('- ID:', planSettings._id);
          console.log('- Name:', planSettings.name);
          console.log('- Tenant directory enabled:', planSettings.tenantDirectoryEnabled);
          
          // Enable tenant directory if not already enabled
          if (!planSettings.tenantDirectoryEnabled) {
            const updateResult = await planSettingsCollection.updateOne(
              { _id: planSettings._id },
              { $set: { tenantDirectoryEnabled: true } }
            );
            
            console.log('Plan settings updated:', updateResult.modifiedCount > 0 ? 'Yes' : 'No');
          } else {
            console.log('Tenant directory already enabled - no update needed');
          }
        } else {
          console.log('Plan settings not found for plan ID:', planId);
          
          // Create default plan settings with tenant directory enabled
          const defaultPlanSettings = {
            _id: planId,
            plan: planId,
            name: planId.charAt(0).toUpperCase() + planId.slice(1),
            tenantLimit: 10,
            buildingLimit: 2,
            floorLimit: 10,
            suiteLimit: 50,
            tenantDocumentLimit: 5,
            price: 0,
            yearly: null,
            emailQuota: 25,
            smsQuota: 10,
            tenantDirectoryEnabled: true
          };
          
          const insertResult = await planSettingsCollection.insertOne(defaultPlanSettings);
          console.log('Plan settings created:', insertResult.acknowledged ? 'Yes' : 'No');
        }
      } else {
        console.log('Organization not found for ID:', tenant.organization_id);
      }
    } else {
      console.log('Tenant with email "sarah.williams@example.com" not found');
    }
    
    // List all plan settings
    const planSettingsCollection = db.collection('plan_settings');
    const allPlanSettings = await planSettingsCollection.find().toArray();
    
    console.log('\nAll plan settings in the database:');
    allPlanSettings.forEach(ps => {
      console.log(`- Plan: ${ps._id}, Tenant directory enabled: ${ps.tenantDirectoryEnabled}`);
    });
    
    // Close the connection
    await client.close();
    console.log('\nDisconnected from MongoDB Atlas');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the function
checkAndUpdateOrgSettings();
