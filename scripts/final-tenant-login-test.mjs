// Tenant authentication test with recreated login function
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Our recreated login function
async function testTenantLogin(email, password) {
  try {
    console.log(`Attempting to login tenant: ${email}`);
    
    // Connect to the database
    const uri = process.env.connectionString;
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
    
    // Get the collections we need
    const TenantsCollection = mongoose.connection.collection('tenants');
    const OrganizationsCollection = mongoose.connection.collection('organizations');
    const PlanSettingsCollection = mongoose.connection.collection('plan_settings');
    
    // 1. First, check if this is a tenant
    const tenant = await TenantsCollection.findOne({ email });
    console.log("Tenant found:", tenant ? "Yes" : "No");
    
    // 2. If we found a tenant with matching email and portal access is enabled
    if (tenant && tenant.has_portal_access) {
      console.log("Tenant has portal access:", tenant.has_portal_access);
      console.log("Organization ID:", tenant.organization_id, "Type:", typeof tenant.organization_id);
      
      // 3. Use $or operator to avoid type casting issues
      const organization = await OrganizationsCollection.findOne({ 
        $or: [
          { _id: tenant.organization_id },
          { organization_id: tenant.organization_id }
        ]
      });
      
      console.log("Organization found:", organization ? "Yes" : "No");
      
      if (organization) {
        // 4. Get plan settings
        const planSettings = await PlanSettingsCollection.findOne({ 
          _id: organization.plan || 'free' 
        });
        
        console.log("Plan settings found:", planSettings ? "Yes" : "No");
        console.log("Tenant directory enabled:", planSettings?.tenantDirectoryEnabled);
        
        // 5. If tenant directory is enabled for this organization
        if (planSettings && planSettings.tenantDirectoryEnabled) {
          console.log("Tenant has password:", !!tenant.password);
          
          // 6. Verify tenant password
          if (tenant.password) {
            // Use bcrypt to compare the provided password with the stored hash
            const passwordMatch = await bcrypt.compare(password, tenant.password);
            console.log("Password match:", passwordMatch);
            
            if (!passwordMatch) {
              throw new Error("Invalid email or password. Please check your credentials and try again.");
            }
          } else {
            // 7. If password hasn't been set yet but portal access is enabled, allow login with any non-empty password
            if (!password || password.trim().length === 0) {
              throw new Error("Password is required. Please enter a valid password.");
            }
            
            // 8. Set this password as the tenant's initial password
            const hashedPassword = await bcrypt.hash(password, 10);
            await TenantsCollection.updateOne(
              { _id: tenant._id },
              { 
                $set: { 
                  password: hashedPassword,
                  password_set: true
                }
              }
            );
            
            console.log("Password set for tenant");
          }
          
          // 9. Create a session for this tenant
          const tenantSession = {
            id: tenant._id.toString(),
            email: tenant.email,
            name: `${tenant.first_name} ${tenant.last_name}`,
            role: "tenant",
            organization_id: tenant.organization_id,
            tenant_id: tenant._id.toString()
          };
          
          // 10. Create tokens for this tenant (using dummy secret keys for testing)
          const secretKey = process.env.JWT_SECRET || 'test_secret_key';
          const refreshSecretKey = process.env.REFRESH_JWT_SECRET || 'test_refresh_secret_key';
          
          const token = jwt.sign(tenantSession, secretKey, { expiresIn: '24h' });
          const refreshToken = jwt.sign(tenantSession, refreshSecretKey, { expiresIn: '7d' });
          
          console.log('\n✅ AUTHENTICATION SUCCESSFUL: Login function worked correctly');
          console.log('Generated JWT token for tenant');
          
          return {
            token,
            refreshToken,
            userInfo: {
              ...tenantSession,
              isTenant: true
            }
          };
        } else {
          throw new Error("Tenant directory is not enabled for this organization.");
        }
      } else {
        throw new Error("Organization not found for this tenant.");
      }
    } else {
      throw new Error("No tenant found with this email or portal access is not enabled.");
    }
  } catch (error) {
    console.error('\n❌ AUTHENTICATION FAILED:', error.message);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB connection closed');
  }
}

// Run the test
async function runTest() {
  try {
    const email = 'sarah.williams@example.com';
    const password = 'sarah.williams@example.com';
    
    console.log(`\nTesting login for ${email} with password '${password}'`);
    
    const result = await testTenantLogin(email, password);
    console.log('Login successful!');
    console.log('- Token:', result.token ? 'Generated' : 'None');
    console.log('- User:', result.userInfo ? `${result.userInfo.name}` : 'None');
    console.log('- User Type:', result.userInfo.isTenant ? 'Tenant' : 'Regular User');
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

runTest();
