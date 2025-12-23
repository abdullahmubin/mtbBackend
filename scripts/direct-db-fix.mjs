// Direct database update script for tenant login
import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

async function fixTenantLogin() {
  let client = null;
  
  try {
    // Connect directly to MongoDB using MongoClient
    const uri = process.env.connectionString;
    console.log('Connecting to MongoDB using connection string:', uri);
    
    client = new MongoClient(uri);
    await client.connect();
    console.log('Connected to MongoDB');
    
    // Use the 'test' database (where we found our data previously)
    const db = client.db('test');
    
    // 1. Fix tenant
    console.log('\nFixing tenant...');
    const tenantCollection = db.collection('tenants');
    const tenant = await tenantCollection.findOne({ email: 'sarah.williams@example.com' });
    
    if (!tenant) {
      console.log('Tenant not found. Creating tenant...');
      // Create a new tenant
      const newTenant = {
        first_name: "Sarah",
        last_name: "Williams",
        email: "sarah.williams@example.com",
        phone: "+1-555-5678",
        organization_id: 1756056251034,
        has_portal_access: true,
        status: "active",
        created_at: new Date(),
        updated_at: new Date()
      };
      
      // Hash the password (using email as password)
      const hashedPassword = await hashPassword('sarah.williams@example.com');
      newTenant.password = hashedPassword;
      newTenant.password_set = true;
      
      const result = await tenantCollection.insertOne(newTenant);
      console.log('Tenant created with ID:', result.insertedId);
    } else {
      console.log('Tenant found with ID:', tenant._id);
      console.log('- Email:', tenant.email);
      console.log('- Organization ID:', tenant.organization_id);
      console.log('- Has portal access:', tenant.has_portal_access);
      console.log('- Has password:', !!tenant.password);
      
      // Update tenant if needed
      let updates = {};
      
      if (!tenant.has_portal_access) {
        updates.has_portal_access = true;
      }
      
      if (!tenant.password) {
        updates.password = await hashPassword('sarah.williams@example.com');
        updates.password_set = true;
      }
      
      if (Object.keys(updates).length > 0) {
        const updateResult = await tenantCollection.updateOne(
          { _id: tenant._id },
          { $set: updates }
        );
        console.log('Tenant updated:', updateResult.modifiedCount > 0 ? 'Yes' : 'No');
      } else {
        console.log('No tenant updates needed');
      }
    }
    
    // 2. Fix organization
    console.log('\nFixing organization...');
    const tenant2 = await tenantCollection.findOne({ email: 'sarah.williams@example.com' });
    const orgId = tenant2.organization_id;
    
    const organizationsCollection = db.collection('organizations');
    const organization = await organizationsCollection.findOne({ 
      $or: [
        { _id: orgId },
        { organization_id: orgId }
      ]
    });
    
    if (!organization) {
      console.log('Organization not found. Creating organization...');
      // Create a new organization
      const newOrganization = {
        _id: orgId,
        organization_id: orgId,
        name: "Demo Property Management",
        plan: "free",
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
        address: "123 Main Street",
        city: "New York",
        state: "NY",
        zip: "10001",
        phone: "+1-555-1234",
        email: "admin@demoproperty.com"
      };
      
      const result = await organizationsCollection.insertOne(newOrganization);
      console.log('Organization created');
    } else {
      console.log('Organization found');
      console.log('- ID:', organization._id);
      console.log('- Name:', organization.name);
      console.log('- Plan:', organization.plan);
    }
    
    // 3. Fix plan settings
    console.log('\nFixing plan settings...');
    const planSettingsCollection = db.collection('plan_settings');
    const planSettings = await planSettingsCollection.findOne({ _id: 'free' });
    
    if (!planSettings) {
      console.log('Free plan settings not found. Creating plan settings...');
      // Create plan settings
      const newPlanSettings = {
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
      };
      
      const result = await planSettingsCollection.insertOne(newPlanSettings);
      console.log('Plan settings created');
    } else {
      console.log('Plan settings found');
      console.log('- ID:', planSettings._id);
      console.log('- Tenant directory enabled:', planSettings.tenantDirectoryEnabled);
      
      // Update tenant directory enabled if needed
      if (planSettings.tenantDirectoryEnabled !== true) {
        const updateResult = await planSettingsCollection.updateOne(
          { _id: 'free' },
          { $set: { tenantDirectoryEnabled: true } }
        );
        console.log('Plan settings updated:', updateResult.modifiedCount > 0 ? 'Yes' : 'No');
      } else {
        console.log('No plan settings updates needed');
      }
    }
    
    console.log('\nAll fixes applied! The tenant should now be able to log in with:');
    console.log('- Email: sarah.williams@example.com');
    console.log('- Password: sarah.williams@example.com');
    
    console.log('\nImportant code changes to apply:');
    console.log('1. Update organization model in src/models/organizations.js to use Mixed type for _id');
    console.log('2. Update organization lookup in authService.js to check both _id and organization_id fields');
    
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
fixTenantLogin();
