// Script to insert sample data into the database
import mongoose from 'mongoose';
import OrganizationDB from '../src/models/organizations.js';
import UserDB from '../src/models/user.js';
import TenantsDB from '../src/models/tenants.js';
import AuditLogDB from '../src/models/auditLog.js';
import OrganizationMembershipDB from '../src/models/organizationMembership.js';
// Add other models as needed
import { sampleData } from '../src/models/sampleData.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tcoi';

async function seed() {
  await mongoose.connect(MONGO_URI);
  // Organization
  await OrganizationDB.create(sampleData.organization);
  // User
  await UserDB.create(sampleData.user);
  // Tenant
  await TenantsDB.create(sampleData.tenant);
  // Membership
  await OrganizationMembershipDB.create({
    user_id: sampleData.user._id,
    organization_id: sampleData.organization.organization_id,
    role: sampleData.user.role,
    status: 'active'
  });
  // Lease
  await mongoose.connection.collection('leases').insertOne(sampleData.lease);
  // SMS
  await mongoose.connection.collection('smsmessages').insertOne(sampleData.sms);
  // Email
  await mongoose.connection.collection('emailtemplates').insertOne(sampleData.email);
  // Document
  await mongoose.connection.collection('documents').insertOne(sampleData.document);
  // Payment
  await mongoose.connection.collection('payments').insertOne(sampleData.payment);
  // Ticket
  await mongoose.connection.collection('tickets').insertOne(sampleData.ticket);
  // Audit log example
  await AuditLogDB.create({
    user_id: sampleData.user._id,
    organization_id: sampleData.organization.organization_id,
    action: 'CREATE',
    resource: 'Organization',
    resource_id: sampleData.organization.organization_id,
    details: sampleData.organization
  });
  console.log('Sample data inserted successfully.');
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Error inserting sample data:', err);
  process.exit(1);
});
