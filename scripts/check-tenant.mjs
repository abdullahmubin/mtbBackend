// MongoDB Tenant Check Script
import { MongoClient } from 'mongodb';

async function checkTenant() {
  try {
    // Connect to MongoDB
    const uri = process.env.connectionString || 'mongodb://localhost:27017/tcoi';
    const client = new MongoClient(uri);
    await client.connect();
    console.log('Connected to MongoDB');
    
    // Get the database and collection
    const db = client.db();
    console.log('Database name:', db.databaseName);
    
    // Check if tenants collection exists
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name).join(', '));
    
    // Check for the tenant
    const tenantsCollection = db.collection('tenants');
    const tenant = await tenantsCollection.findOne({ email: 'sarah.williams@example.com' });
    
    if (tenant) {
      console.log('Tenant found:');
      console.log('- Name:', tenant.first_name, tenant.last_name);
      console.log('- Email:', tenant.email);
      console.log('- Has portal access:', tenant.has_portal_access);
      console.log('- Has password:', !!tenant.password);
      console.log('- Organization ID:', tenant.organization_id);
      
      // Update the tenant to enable portal access and set a password
      if (!tenant.has_portal_access || !tenant.password) {
        const bcrypt = await import('bcrypt');
        const password = tenant.email; // Use email as password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const result = await tenantsCollection.updateOne(
          { _id: tenant._id },
          { 
            $set: { 
              has_portal_access: true,
              password: hashedPassword,
              password_set: true
            }
          }
        );
        
        console.log('Tenant updated:', result.modifiedCount > 0 ? 'Yes' : 'No');
        console.log('New login credentials:');
        console.log('- Email:', tenant.email);
        console.log('- Password:', password);
      }
      
      // Check organization
      const organizationsCollection = db.collection('organizations');
      const organization = await organizationsCollection.findOne({ _id: tenant.organization_id });
      
      if (organization) {
        console.log('Organization found:');
        console.log('- Name:', organization.name);
        console.log('- Plan:', organization.plan);
        
        // Check plan settings
        const planSettingsCollection = db.collection('plan_settings');
        const planSettings = await planSettingsCollection.findOne({ _id: organization.plan || 'free' });
        
        if (planSettings) {
          console.log('Plan settings found:');
          console.log('- Tenant directory enabled:', planSettings.tenantDirectoryEnabled);
          
          // Enable tenant directory if needed
          if (!planSettings.tenantDirectoryEnabled) {
            const updateResult = await planSettingsCollection.updateOne(
              { _id: planSettings._id },
              { $set: { tenantDirectoryEnabled: true } }
            );
            
            console.log('Plan settings updated:', updateResult.modifiedCount > 0 ? 'Yes' : 'No');
          }
        } else {
          console.log('Plan settings not found, creating default settings');
          
          // Create default plan settings with tenant directory enabled
          const defaultPlanSettings = {
            _id: organization.plan || 'free',
            plan: organization.plan || 'free',
            name: organization.plan ? organization.plan.charAt(0).toUpperCase() + organization.plan.slice(1) : 'Free',
            tenantLimit: 5,
            buildingLimit: 1,
            floorLimit: 10,
            suiteLimit: 50,
            tenantDocumentLimit: 1,
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
        console.log('Organization not found');
      }
    } else {
      console.log('Tenant not found');
    }
    
    // Close the connection
    await client.close();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the function
checkTenant();
