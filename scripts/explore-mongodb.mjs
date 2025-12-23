// MongoDB Database Explorer Script
import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

async function exploreAllDatabases() {
  try {
    // MongoDB Atlas connection string
    const uri = "mongodb+srv://amubin19:QZQSWC7ZoM9FZJoS@cluster0.gad2ky6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
    
    console.log('Connecting to MongoDB Atlas...');
    const client = new MongoClient(uri);
    await client.connect();
    console.log('Connected to MongoDB Atlas');
    
    // Get database names
    const dbs = await client.db().admin().listDatabases();
    console.log('Available databases:');
    dbs.databases.forEach(database => {
      console.log(`- ${database.name} (${database.sizeOnDisk} bytes)`);
    });
    
    // Try each non-system database to find tenants
    for (const database of dbs.databases) {
      if (database.name !== 'admin' && database.name !== 'local') {
        console.log(`\nChecking database: ${database.name}`);
        const db = client.db(database.name);
        
        // List collections in this database
        const collections = await db.listCollections().toArray();
        console.log('Collections in this database:');
        collections.forEach(c => {
          console.log(`- ${c.name}`);
        });
        
        // Check if there's a tenants collection
        if (collections.some(c => c.name === 'tenants')) {
          console.log('\nFound tenants collection!');
          const tenantsCollection = db.collection('tenants');
          
          // Count total tenants
          const tenantCount = await tenantsCollection.countDocuments();
          console.log(`Total tenants in collection: ${tenantCount}`);
          
          // Find the specific tenant
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
            
            // Check organization if it exists
            if (collections.some(c => c.name === 'organizations') && tenant.organization_id) {
              const organizationsCollection = db.collection('organizations');
              const organization = await organizationsCollection.findOne({ _id: tenant.organization_id });
              
              if (organization) {
                console.log('\nOrganization found:');
                console.log('- ID:', organization._id);
                console.log('- Name:', organization.name);
                console.log('- Plan:', organization.plan);
                
                // Check plan settings
                if (collections.some(c => c.name === 'plan_settings')) {
                  const planSettingsCollection = db.collection('plan_settings');
                  const planSettings = await planSettingsCollection.findOne({ _id: organization.plan || 'free' });
                  
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
                    }
                  }
                }
              }
            }
          } else {
            console.log('Tenant with email "sarah.williams@example.com" not found');
            
            // List all tenants (limited to first 5 for brevity)
            const tenants = await tenantsCollection.find().limit(5).toArray();
            console.log('\nSample tenants in collection:');
            if (tenants.length === 0) {
              console.log('No tenants found');
            } else {
              tenants.forEach(t => {
                console.log(`- ${t.first_name || 'Unknown'} ${t.last_name || 'Unknown'} (${t.email || 'No email'})`);
              });
            }
          }
        }
      }
    }
    
    // Close the connection
    await client.close();
    console.log('\nDisconnected from MongoDB Atlas');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the function
exploreAllDatabases();
