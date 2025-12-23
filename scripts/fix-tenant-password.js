// Debugging script for tenant password
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tcoi';

// Connect to the database
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Define tenant model
const tenantSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true, required: true },
  organization_id: { type: Number, index: true, required: true },
  first_name: { type: String, required: true, trim: true },
  last_name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  building_id: { type: String },
  floor_id: { type: String },
  suite_id: { type: String },
  lease_start_date: { type: Date },
  lease_end_date: { type: Date },
  status: { type: String, enum: ['Active', 'Pending', 'Vacated', 'Expiring Soon'], default: 'Active' },
  rent_due: { type: Number, default: 0 },
  rent_paid: { type: Number, default: 0 },
  last_payment_date: { type: Date },
  balance: { type: Number, default: 0 },
  created_at: { type: Date },
  updated_at: { type: Date },
  emergency_contact_name: { type: String },
  emergency_contact_phone: { type: String },
  preferred_contact: { type: String },
  sms_opt_in: { type: Boolean, default: false },
  has_portal_access: { type: Boolean, default: false },
  password: { type: String },
  password_set: { type: Boolean, default: false }
}, { collection: 'tenants' });

const TenantsDB = mongoose.model('Tenants', tenantSchema);

// Define plan settings model
const planSettingsSchema = new mongoose.Schema({
  _id: { type: String },
  plan: { type: String },
  name: { type: String },
  tenantLimit: { type: Number },
  buildingLimit: { type: Number },
  floorLimit: { type: Number },
  suiteLimit: { type: Number },
  tenantDocumentLimit: { type: Number },
  price: { type: Number },
  yearly: { type: Number },
  emailQuota: { type: Number },
  smsQuota: { type: Number },
  tenantDirectoryEnabled: { type: Boolean, default: false }
}, { collection: 'plan_settings' });

const PlanSettingsDB = mongoose.model('PlanSettings', planSettingsSchema);

// Define organizations model
const orgSchema = new mongoose.Schema({}, { strict: false, collection: 'organizations' });
const OrganizationsDB = mongoose.model('Organizations', orgSchema);

// Function to hash password
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

async function checkAndFixTenant() {
  try {
    // Check if the tenant exists
    const email = 'sarah.williams@example.com';
    const tenant = await TenantsDB.findOne({ email });
    
    console.log('Tenant found:', tenant ? 'Yes' : 'No');
    
    if (!tenant) {
      console.log('Tenant not found in database');
      return;
    }
    
    console.log('Tenant details:');
    console.log('- Name:', tenant.first_name, tenant.last_name);
    console.log('- Has portal access:', tenant.has_portal_access);
    console.log('- Has password:', !!tenant.password);
    console.log('- Password set:', tenant.password_set);
    console.log('- Organization ID:', tenant.organization_id);
    
    // Check organization
    const organization = await OrganizationsDB.findOne({ _id: tenant.organization_id });
    console.log('Organization found:', organization ? 'Yes' : 'No');
    
    if (organization) {
      console.log('- Organization plan:', organization.plan);
      
      // Check plan settings
      const planSettings = await PlanSettingsDB.findOne({ _id: organization.plan || 'free' });
      console.log('Plan settings found:', planSettings ? 'Yes' : 'No');
      
      if (planSettings) {
        console.log('- Tenant directory enabled:', planSettings.tenantDirectoryEnabled);
        
        // Enable tenant directory if needed
        if (!planSettings.tenantDirectoryEnabled) {
          console.log('Enabling tenant directory for plan:', planSettings._id);
          await PlanSettingsDB.updateOne(
            { _id: planSettings._id },
            { $set: { tenantDirectoryEnabled: true } }
          );
          console.log('Tenant directory enabled successfully');
        }
      }
    }
    
    // Check if the tenant has portal access
    if (!tenant.has_portal_access) {
      console.log('Enabling portal access for tenant');
      await TenantsDB.updateOne(
        { _id: tenant._id },
        { $set: { has_portal_access: true } }
      );
      console.log('Portal access enabled successfully');
    }
    
    // Set or update the tenant's password
    const password = email; // Use email as password for simplicity
    const hashedPassword = await hashPassword(password);
    
    await TenantsDB.updateOne(
      { _id: tenant._id },
      { 
        $set: { 
          password: hashedPassword,
          password_set: true
        }
      }
    );
    
    console.log('Password updated successfully');
    console.log('Tenant can now log in with:');
    console.log('- Email:', email);
    console.log('- Password:', password);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
}

// Run the function
checkAndFixTenant();
