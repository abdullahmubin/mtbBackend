// MongoDB Tenant Check Script
import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

async function checkTenant() {
  try {
    // MongoDB Atlas connection string
    const uri = "mongodb+srv://amubin19:QZQSWC7ZoM9FZJoS@cluster0.gad2ky6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
    
    console.log('Connecting to MongoDB Atlas...');
    const client = new MongoClient(uri);
    await client.connect();
    console.log('Connected to MongoDB Atlas');
    
    // List all databases
    const dbs = await client.db().admin().listDatabases();
    console.log('Available databases:');
    dbs.databases.forEach(database => {
      console.log(`- ${database.name} (${database.sizeOnDisk} bytes)`);
    });
    
    // Get the database
    const db = client.db('tcoi');
    console.log('Using database:', db.databaseName);
    
    // Get collections
    const collections = await db.listCollections().toArray();
    console.log('Available collections:');
    collections.forEach(c => {
      console.log(`- ${c.name}`);
    });
    
    // Check for the tenant
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
      
      // Enable portal access and set a new password
      const password = tenant.email; // Use email as password
      const hashedPassword = await hashPassword(password);
      
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
      
      // Check organization
      const organizationsCollection = db.collection('organizations');
      const organization = await organizationsCollection.findOne({ _id: tenant.organization_id });
      
      if (organization) {
        console.log('Organization found:');
        console.log('- ID:', organization._id);
        console.log('- Name:', organization.name);
        console.log('- Plan:', organization.plan);
        
        // Check plan settings
        const planSettingsCollection = db.collection('plan_settings');
        const planSettings = await planSettingsCollection.findOne({ _id: organization.plan || 'free' });
        
        if (planSettings) {
          console.log('Plan settings found:');
          console.log('- ID:', planSettings._id);
          console.log('- Name:', planSettings.name);
          console.log('- Tenant directory enabled:', planSettings.tenantDirectoryEnabled);
          
          // Enable tenant directory
          const updateResult = await planSettingsCollection.updateOne(
            { _id: planSettings._id },
            { $set: { tenantDirectoryEnabled: true } }
          );
          
          console.log('Plan settings updated:', updateResult.modifiedCount > 0 ? 'Yes' : 'No');
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
      
      // List all tenants to help identify the correct one
      const tenants = await tenantsCollection.find({}).limit(10).toArray();
      console.log('Available tenants:');
      if (tenants.length === 0) {
        console.log('No tenants found in the database');
      } else {
        tenants.forEach(t => {
          console.log(`- ${t.first_name || 'Unknown'} ${t.last_name || 'Unknown'} (${t.email || 'No email'}) - Has password: ${!!t.password}, Has portal access: ${!!t.has_portal_access}`);
        });
      }
    }
    
    // Close the connection
    await client.close();
    console.log('Disconnected from MongoDB Atlas');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the function
checkTenant();
