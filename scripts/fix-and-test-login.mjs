// Test tenant login with improved error handling
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Helper function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fixOrganizationAndTestLogin() {
  let mongoClient = null;
  
  try {
    // 1. Fix the organization model issue
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.connectionString);
    console.log('Connected to MongoDB');

    // Define schemas with correct types
    const TenantSchema = new mongoose.Schema({
      email: String,
      password: String,
      has_portal_access: Boolean,
      organization_id: Number // Number type for organization_id
    });

    const OrganizationSchema = new mongoose.Schema({
      _id: Number, // Number type for _id
      name: String,
      plan: String
    }, { _id: false });  // Disable auto ObjectId
    
    const PlanSettingsSchema = new mongoose.Schema({
      _id: String,
      tenantDirectoryEnabled: Boolean
    });

    // Create models
    const TenantModel = mongoose.model('tenants', TenantSchema, 'tenants');
    const OrganizationModel = mongoose.model('organizations', OrganizationSchema, 'organizations');
    const PlanSettingsModel = mongoose.model('plan_settings', PlanSettingsSchema, 'plan_settings');

    // 2. Get the tenant
    console.log('Fetching tenant with email: sarah.williams@example.com');
    const tenant = await TenantModel.findOne({ email: 'sarah.williams@example.com' });
    
    if (!tenant) {
      throw new Error('Tenant not found. Please check if the tenant exists in the database.');
    }
    
    console.log('Tenant found:');
    console.log('- ID:', tenant._id);
    console.log('- Email:', tenant.email);
    console.log('- Has portal access:', tenant.has_portal_access);
    console.log('- Has password:', !!tenant.password);
    console.log('- Organization ID:', tenant.organization_id, '(Type:', typeof tenant.organization_id, ')');

    // 3. Ensure the tenant has portal access
    if (!tenant.has_portal_access) {
      console.log('Enabling portal access for tenant...');
      tenant.has_portal_access = true;
      await tenant.save();
      console.log('Portal access enabled');
    }

    // 4. Ensure the tenant has a password
    if (!tenant.password) {
      console.log('Setting password for tenant...');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(tenant.email, salt);
      tenant.password = hashedPassword;
      await tenant.save();
      console.log('Password set to the tenant email');
    }

    // 5. Check if the organization exists
    console.log('Checking organization with ID:', tenant.organization_id);
    const organization = await OrganizationModel.findOne({ _id: tenant.organization_id });
    
    if (!organization) {
      console.log('Organization not found, creating new organization...');
      const newOrganization = new OrganizationModel({
        _id: tenant.organization_id,
        name: "Demo Property Management",
        plan: "free",
        status: "active"
      });
      await newOrganization.save();
      console.log('Organization created with ID:', tenant.organization_id);
    } else {
      console.log('Organization found:', organization._id);
      console.log('- Plan:', organization.plan);
    }

    // 6. Ensure plan settings has tenant directory enabled
    const planId = organization ? organization.plan : 'free';
    console.log('Checking plan settings for plan:', planId);
    const planSettings = await PlanSettingsModel.findOne({ _id: planId });
    
    if (!planSettings) {
      console.log('Plan settings not found, creating with tenant directory enabled...');
      const newPlanSettings = new PlanSettingsModel({
        _id: planId,
        name: planId.charAt(0).toUpperCase() + planId.slice(1),
        tenantDirectoryEnabled: true
      });
      await newPlanSettings.save();
      console.log('Plan settings created with tenant directory enabled');
    } else if (!planSettings.tenantDirectoryEnabled) {
      console.log('Enabling tenant directory in plan settings...');
      planSettings.tenantDirectoryEnabled = true;
      await planSettings.save();
      console.log('Tenant directory enabled in plan settings');
    } else {
      console.log('Plan settings already have tenant directory enabled');
    }

    // Close mongoose connection
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

    // 7. Test the login
    console.log('\nWaiting 5 seconds for server to be ready...');
    await wait(5000);
    
    console.log('Testing tenant login...');
    
    try {
      const response = await axios.post('http://localhost:3031/api/auth/login', {
        email: 'sarah.williams@example.com',
        password: 'sarah.williams@example.com'
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Response status:', response.status);
      console.log('Response data:', JSON.stringify(response.data, null, 2));
      
      if (response.status === 200 && response.data.data?.token) {
        console.log('✅ Login successful!');
        if (response.data.data.userInfo) {
          console.log('User info:');
          console.log('- Name:', response.data.data.userInfo.name);
          console.log('- Email:', response.data.data.userInfo.email);
          console.log('- Role:', response.data.data.userInfo.role);
        }
      } else {
        console.log('❌ Login response received but not successful');
      }
    } catch (error) {
      console.error('Login request failed:');
      if (error.response) {
        // The request was made and the server responded with a status code
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      } else if (error.request) {
        // The request was made but no response was received
        console.error('No response received from server');
      } else {
        // Something happened in setting up the request
        console.error('Error message:', error.message);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Make sure to close connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('Mongoose connection closed');
    }
  }
}

// Run the function
fixOrganizationAndTestLogin();
