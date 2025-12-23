/**
 * Script to add sample tenant data with expiring/late status for testing
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Initialize path for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file if present
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Get MongoDB connection string from environment or use a default
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tenantapp';

// Load models
console.log('Connecting to MongoDB...');
await mongoose.connect(MONGODB_URI);
console.log('Connected to MongoDB');

// Define tenant schema to match the model
const tenantSchema = new mongoose.Schema({
  id: String,
  organization_id: Number,
  first_name: String,
  last_name: String,
  email: String,
  phone: String,
  building_id: String,
  floor_id: String,
  suite_id: String,
  lease_start_date: Date,
  lease_end_date: Date,
  status: String,
  rent_due: Number,
  rent_paid: Number,
  last_payment_date: Date,
  balance: Number,
  created_at: Date,
  updated_at: Date
}, { 
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

// Create the model
const TenantsDB = mongoose.model('Tenants', tenantSchema);

// Get the current organization ID
const orgCounts = await mongoose.connection.db.collection('tenants').distinct('organization_id');
const organizationId = orgCounts.length > 0 ? orgCounts[0] : 1;
console.log(`Using organization ID: ${organizationId}`);

// Generate current date and dates for lease ranges
const now = new Date();
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(now.getDate() - 30);
const thirtyDaysFromNow = new Date();
thirtyDaysFromNow.setDate(now.getDate() + 30);
const sixtyDaysFromNow = new Date();
sixtyDaysFromNow.setDate(now.getDate() + 60);

// Sample tenant data with expiring/late statuses
const sampleTenants = [
  {
    id: `tenant_${organizationId}_exp_soon_1`,
    organization_id: organizationId,
    first_name: 'John',
    last_name: 'Expiring',
    email: 'john.expiring@example.com',
    phone: '555-123-4567',
    building_id: 'building_1',
    floor_id: 'floor_1',
    suite_id: 'suite_101',
    lease_start_date: thirtyDaysAgo,
    lease_end_date: thirtyDaysFromNow,
    status: 'Expiring Soon',
    rent_due: 1500,
    rent_paid: 1500,
    last_payment_date: now,
    balance: 0,
    created_at: thirtyDaysAgo,
    updated_at: now
  },
  {
    id: `tenant_${organizationId}_exp_soon_2`,
    organization_id: organizationId,
    first_name: 'Mary',
    last_name: 'Ending',
    email: 'mary.ending@example.com',
    phone: '555-987-6543',
    building_id: 'building_1',
    floor_id: 'floor_2',
    suite_id: 'suite_202',
    lease_start_date: thirtyDaysAgo,
    lease_end_date: thirtyDaysFromNow,
    status: 'Active', // Should still show in table based on lease_end_date
    rent_due: 1700,
    rent_paid: 1700,
    last_payment_date: now,
    balance: 0,
    created_at: thirtyDaysAgo,
    updated_at: now
  },
  {
    id: `tenant_${organizationId}_late_1`,
    organization_id: organizationId,
    first_name: 'Bob',
    last_name: 'Overdue',
    email: 'bob.overdue@example.com',
    phone: '555-456-7890',
    building_id: 'building_2',
    floor_id: 'floor_1',
    suite_id: 'suite_301',
    lease_start_date: thirtyDaysAgo,
    lease_end_date: sixtyDaysFromNow,
    status: 'Active',
    rent_due: 1800,
    rent_paid: 1300,
    last_payment_date: thirtyDaysAgo,
    balance: 500, // Has balance > 0
    created_at: thirtyDaysAgo,
    updated_at: now
  },
  {
    id: `tenant_${organizationId}_pending_1`,
    organization_id: organizationId,
    first_name: 'Alice',
    last_name: 'Pending',
    email: 'alice.pending@example.com',
    phone: '555-789-0123',
    building_id: 'building_2',
    floor_id: 'floor_2',
    suite_id: 'suite_402',
    lease_start_date: now,
    lease_end_date: sixtyDaysFromNow,
    status: 'Pending', // Will show in dashboard due to 'Pending' status
    rent_due: 1600,
    rent_paid: 1600,
    last_payment_date: now,
    balance: 0,
    created_at: now,
    updated_at: now
  },
  {
    id: `tenant_${organizationId}_vacated_1`,
    organization_id: organizationId,
    first_name: 'Tom',
    last_name: 'Vacated',
    email: 'tom.vacated@example.com',
    phone: '555-234-5678',
    building_id: 'building_3',
    floor_id: 'floor_1',
    suite_id: 'suite_501',
    lease_start_date: thirtyDaysAgo,
    lease_end_date: thirtyDaysAgo,
    status: 'Vacated', // Will show in dashboard due to 'Vacated' status
    rent_due: 1400,
    rent_paid: 1400,
    last_payment_date: thirtyDaysAgo,
    balance: 0,
    created_at: thirtyDaysAgo,
    updated_at: now
  }
];

// Insert sample tenants
try {
  // First, check if sample tenants already exist
  const existingTenants = await TenantsDB.find({ 
    id: { $in: sampleTenants.map(t => t.id) } 
  });

  if (existingTenants.length > 0) {
    console.log(`${existingTenants.length} sample tenants already exist. Updating them...`);
    
    for (const tenant of sampleTenants) {
      await TenantsDB.findOneAndUpdate(
        { id: tenant.id }, 
        tenant, 
        { upsert: true, new: true }
      );
    }
  } else {
    console.log('Adding sample tenants...');
    await TenantsDB.insertMany(sampleTenants);
  }
  
  console.log('Sample tenants added/updated successfully!');
  
  // Verify tenant count
  const totalCount = await TenantsDB.countDocuments({ organization_id: organizationId });
  console.log(`Total tenants for organization ${organizationId}: ${totalCount}`);
  
  // Show tenants that should appear in dashboard table
  const dashboardTableTenants = await TenantsDB.find({
    organization_id: organizationId,
    $or: [
      { status: { $in: ['Expiring Soon', 'Pending', 'Vacated'] } },
      { balance: { $gt: 0 } },
      { 
        lease_end_date: { 
          $gte: now,
          $lte: thirtyDaysFromNow
        } 
      }
    ]
  });
  
  console.log(`Found ${dashboardTableTenants.length} tenants that should appear in dashboard table:`);
  dashboardTableTenants.forEach(t => {
    console.log(`- ${t.first_name} ${t.last_name}: ${t.status}, Balance: ${t.balance}, Lease End: ${t.lease_end_date}`);
  });
  
} catch (error) {
  console.error('Error adding sample tenants:', error);
} finally {
  // Close the connection
  await mongoose.connection.close();
  console.log('Database connection closed');
}
