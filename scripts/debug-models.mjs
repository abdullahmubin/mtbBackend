// Debug MongoDB models
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Create Tenant model manually for testing
const tenantSchema = new mongoose.Schema({
  email: String,
  password: String,
  has_portal_access: Boolean,
  organization_id: mongoose.Schema.Types.Mixed, // Can be a string or number
  first_name: String,
  last_name: String
});

// Create Organization model
const organizationSchema = new mongoose.Schema({
  name: String,
  plan: String
});

async function debugModels() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    console.log('Connection string:', process.env.connectionString);
    
    await mongoose.connect(process.env.connectionString);
    console.log('Connected to MongoDB');
    
    // Create models
    const TenantModel = mongoose.model('tenants', tenantSchema);
    const OrganizationModel = mongoose.model('organizations', organizationSchema);
    
    // Fetch tenant
    console.log('Fetching tenant with email: sarah.williams@example.com');
    const tenant = await TenantModel.findOne({ email: 'sarah.williams@example.com' });
    console.log('Tenant found:', tenant ? 'Yes' : 'No');
    
    if (tenant) {
      console.log('Tenant details:');
      console.log('- ID:', tenant._id);
      console.log('- Name:', tenant.first_name, tenant.last_name);
      console.log('- Email:', tenant.email);
      console.log('- Has portal access:', tenant.has_portal_access);
      console.log('- Has password:', !!tenant.password);
      console.log('- Organization ID:', tenant.organization_id);
      
      // Fetch organization
      const organization = await OrganizationModel.findOne({ _id: tenant.organization_id });
      console.log('Organization found:', organization ? 'Yes' : 'No');
      
      if (organization) {
        console.log('Organization details:');
        console.log('- ID:', organization._id);
        console.log('- Name:', organization.name);
        console.log('- Plan:', organization.plan);
      }
      
      // Check for plan settings
      const PlanSettingsModel = mongoose.model('plan_settings', new mongoose.Schema({
        _id: String,
        tenantDirectoryEnabled: Boolean
      }));
      
      const planId = organization ? organization.plan : 'free';
      const planSettings = await PlanSettingsModel.findOne({ _id: planId });
      
      console.log('Plan settings found:', planSettings ? 'Yes' : 'No');
      if (planSettings) {
        console.log('- Tenant directory enabled:', planSettings.tenantDirectoryEnabled);
      }
    }
    
    // Disconnect
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the function
debugModels();
