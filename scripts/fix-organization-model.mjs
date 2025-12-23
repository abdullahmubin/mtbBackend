// Fix organization model
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

// Create organization schema with Number type for _id
const organizationSchema = new mongoose.Schema({
  _id: Number, // Changed from ObjectId to Number
  name: String,
  plan: String,
  // other fields...
}, { 
  _id: false // Disable automatic ObjectId generation
});

async function fixOrganizationModel() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.connectionString);
    console.log('Connected to MongoDB');
    
    // Create models with the correct ID type
    const TenantModel = mongoose.model('tenants', new mongoose.Schema({
      email: String,
      organization_id: Number // Make sure this is a Number
    }));
    
    const OrganizationModel = mongoose.model('organizations', organizationSchema);
    
    // Fetch tenant
    console.log('Fetching tenant with email: sarah.williams@example.com');
    const tenant = await TenantModel.findOne({ email: 'sarah.williams@example.com' });
    
    if (tenant) {
      console.log('Tenant found with organization_id:', tenant.organization_id);
      
      // Check if organization exists
      const organization = await OrganizationModel.findOne({ _id: tenant.organization_id });
      
      if (!organization) {
        console.log('Organization not found, creating new organization...');
        
        // Create a new organization with the correct ID
        const newOrganization = new OrganizationModel({
          _id: tenant.organization_id,
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
        });
        
        const savedOrg = await newOrganization.save();
        console.log('Organization created successfully:', savedOrg._id);
        
        // Check plan settings
        const PlanSettingsModel = mongoose.model('plan_settings', new mongoose.Schema({
          _id: String,
          tenantDirectoryEnabled: Boolean
        }));
        
        const planSettings = await PlanSettingsModel.findOne({ _id: 'free' });
        
        if (planSettings) {
          console.log('Plan settings found, updating tenant directory enabled...');
          
          // Enable tenant directory
          planSettings.tenantDirectoryEnabled = true;
          await planSettings.save();
          console.log('Plan settings updated successfully');
        } else {
          console.log('Plan settings not found, creating new plan settings...');
          
          // Create new plan settings
          const newPlanSettings = new PlanSettingsModel({
            _id: 'free',
            name: 'Free',
            tenantDirectoryEnabled: true,
            tenantLimit: 5,
            buildingLimit: 1,
            floorLimit: 10,
            suiteLimit: 50
          });
          
          await newPlanSettings.save();
          console.log('Plan settings created successfully');
        }
      } else {
        console.log('Organization found:', organization._id);
      }
    } else {
      console.log('Tenant not found');
    }
    
    // Disconnect
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the function
fixOrganizationModel();
