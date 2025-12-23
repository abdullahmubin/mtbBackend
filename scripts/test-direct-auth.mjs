// Direct test for tenant authentication logic
import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testTenantAuth() {
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
    
    // Test authentication logic for sarah.williams@example.com
    const email = 'sarah.williams@example.com';
    const password = 'sarah.williams@example.com';
    
    console.log(`\nTesting authentication for ${email} with password '${password}'`);
    
    // 1. Find the tenant
    const tenantsCollection = db.collection('tenants');
    const tenant = await tenantsCollection.findOne({ email });
    
    if (!tenant) {
      console.log('❌ Tenant not found');
      return;
    }
    
    console.log('✅ Tenant found:');
    console.log('- ID:', tenant._id);
    console.log('- Name:', tenant.first_name, tenant.last_name);
    console.log('- Email:', tenant.email);
    console.log('- Has portal access:', tenant.has_portal_access);
    console.log('- Has password:', !!tenant.password);
    console.log('- Organization ID:', tenant.organization_id);
    
    // 2. Check if tenant has portal access
    if (!tenant.has_portal_access) {
      console.log('❌ Tenant does not have portal access');
      
      // Update tenant to have portal access
      await tenantsCollection.updateOne(
        { _id: tenant._id },
        { $set: { has_portal_access: true } }
      );
      
      console.log('✅ Updated tenant to have portal access');
    } else {
      console.log('✅ Tenant has portal access');
    }
    
    // 3. Check if tenant has a password
    let validPassword = false;
    
    if (tenant.password) {
      // Verify password
      validPassword = await bcrypt.compare(password, tenant.password);
      console.log('Password verification result:', validPassword ? 'Valid' : 'Invalid');
    } else {
      console.log('❌ Tenant does not have a password');
      
      // Set a password
      const hashedPassword = await bcrypt.hash(password, 10);
      await tenantsCollection.updateOne(
        { _id: tenant._id },
        { 
          $set: { 
            password: hashedPassword,
            password_set: true 
          } 
        }
      );
      
      console.log('✅ Set password for tenant');
      validPassword = true;
    }
    
    // 4. Check if organization exists
    const organizationsCollection = db.collection('organizations');
    const organization = await organizationsCollection.findOne({ 
      $or: [
        { _id: tenant.organization_id },
        { organization_id: tenant.organization_id }
      ]
    });
    
    if (!organization) {
      console.log('❌ Organization not found, creating it...');
      
      // Create the organization
      const newOrganization = {
        _id: tenant.organization_id,
        organization_id: tenant.organization_id,
        name: "Demo Property Management",
        plan: "free",
        created_at: new Date(),
        updated_at: new Date(),
        status: "active"
      };
      
      await organizationsCollection.insertOne(newOrganization);
      console.log('✅ Organization created');
    } else {
      console.log('✅ Organization found:');
      console.log('- ID:', organization._id);
      console.log('- Name:', organization.name);
      console.log('- Plan:', organization.plan);
    }
    
    // 5. Check if plan settings enable tenant directory
    const planSettingsCollection = db.collection('plan_settings');
    const planId = organization ? organization.plan : 'free';
    const planSettings = await planSettingsCollection.findOne({ _id: planId });
    
    if (!planSettings) {
      console.log(`❌ Plan settings for '${planId}' not found, creating them...`);
      
      // Create plan settings
      const newPlanSettings = {
        _id: planId,
        name: planId.charAt(0).toUpperCase() + planId.slice(1),
        tenantDirectoryEnabled: true
      };
      
      await planSettingsCollection.insertOne(newPlanSettings);
      console.log('✅ Plan settings created with tenant directory enabled');
    } else {
      console.log(`✅ Plan settings for '${planId}' found:`);
      console.log('- Tenant directory enabled:', planSettings.tenantDirectoryEnabled);
      
      if (!planSettings.tenantDirectoryEnabled) {
        await planSettingsCollection.updateOne(
          { _id: planId },
          { $set: { tenantDirectoryEnabled: true } }
        );
        
        console.log('✅ Updated plan settings to enable tenant directory');
      }
    }
    
    // Final authentication result
    if (tenant && tenant.has_portal_access && validPassword && planSettings?.tenantDirectoryEnabled) {
      console.log('\n✅ AUTHENTICATION SUCCESSFUL: All conditions met for tenant login');
    } else {
      console.log('\n❌ AUTHENTICATION FAILED: One or more conditions not met');
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
testTenantAuth();
