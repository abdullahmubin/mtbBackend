/**
 * Script to check tenant data for dashboard display
 * Verifies if tenants with 'Expiring Soon', 'Pending', or 'Vacated' status exist
 * or tenants with balance > 0 exist
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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

// Get all tenant counts
const totalCount = await TenantsDB.countDocuments();
console.log(`Total tenants in database: ${totalCount}`);

// Get counts by status
const statusCounts = await TenantsDB.aggregate([
  { $group: { _id: '$status', count: { $sum: 1 } } }
]);

console.log('Tenant counts by status:');
statusCounts.forEach(status => {
  console.log(`- ${status._id || 'null'}: ${status.count}`);
});

// Check for tenants that would appear in the dashboard table
const dashboardTableTenants = await TenantsDB.find({
  $or: [
    { status: { $in: ['Expiring Soon', 'Pending', 'Vacated'] } },
    { balance: { $gt: 0 } }
  ]
});

console.log(`\nTenants that would appear in dashboard table: ${dashboardTableTenants.length}`);
if (dashboardTableTenants.length > 0) {
  console.log('\nSample tenant that should appear in dashboard:');
  const sample = dashboardTableTenants[0];
  console.log({
    id: sample.id,
    name: `${sample.first_name} ${sample.last_name}`,
    status: sample.status,
    balance: sample.balance,
    lease_end_date: sample.lease_end_date
  });
} else {
  console.log('No tenants found that match dashboard table criteria');
}

// Check for organization count
const orgCounts = await TenantsDB.aggregate([
  { $group: { _id: '$organization_id', count: { $sum: 1 } } }
]);

console.log('\nTenant counts by organization:');
orgCounts.forEach(org => {
  console.log(`- Organization ${org._id || 'null'}: ${org.count}`);
});

// Close the connection
await mongoose.connection.close();
console.log('Database connection closed');
