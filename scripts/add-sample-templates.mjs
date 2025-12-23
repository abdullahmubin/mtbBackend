/**
 * Script to add sample email and SMS templates to the database
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

console.log('Connecting to MongoDB...');
await mongoose.connect(MONGODB_URI);
console.log('Connected to MongoDB');

// Define generic schema for templates
const templateSchema = new mongoose.Schema(
  {
    id: { type: String },
    organization_id: { type: Number },
    type: { type: String },
    subject: { type: String },
    body: { type: String },
    updated_at: { type: Date },
    created_at: { type: Date }
  },
  { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    strict: false 
  }
);

// Create models
const EmailTemplates = mongoose.model('EmailTemplates', templateSchema, 'email_templates');
const SmsTemplates = mongoose.model('SmsTemplates', templateSchema, 'sms_templates');

// Define automation schema
const automationSchema = new mongoose.Schema(
  {
    id: { type: String },
    organization_id: { type: Number },
    category: { type: String },
    name: { type: String },
    send_on: { type: Array },
    updated_at: { type: Date },
    created_at: { type: Date }
  },
  { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    strict: false 
  }
);

// Create automation models
const EmailAutomations = mongoose.model('EmailAutomations', automationSchema, 'email_automations');
const SmsAutomations = mongoose.model('SmsAutomations', automationSchema, 'sms_automations');

// Get the current organization ID from the tenants collection
const organizationsCollection = mongoose.connection.db.collection('organizations');
const organizations = await organizationsCollection.find({}).toArray();
const organizationId = organizations.length > 0 ? organizations[0].id : 1;
console.log(`Using organization ID: ${organizationId}`);

// Sample email templates
const emailTemplates = [
  {
    id: `email_template_${organizationId}_payment_due`,
    organization_id: organizationId,
    type: 'payment_due',
    subject: 'Payment Due Reminder',
    body: `Dear {{tenant_name}},

We hope this email finds you well. This is a friendly reminder that your rent payment of ${{amount_due}} is due on {{due_date}}.

Please ensure timely payment to avoid any late fees.

Thank you for your attention to this matter.

Best regards,
Your Property Management Team`,
    updated_at: new Date(),
    created_at: new Date()
  },
  {
    id: `email_template_${organizationId}_payment_late`,
    organization_id: organizationId,
    type: 'payment_late',
    subject: 'Late Payment Notice',
    body: `Dear {{tenant_name}},

This is to inform you that your rent payment of ${{amount_due}} which was due on {{due_date}} is now {{days_past_due}} days overdue.

Please make the payment as soon as possible to avoid any additional late fees.

If you have already made the payment, please disregard this notice.

Best regards,
Your Property Management Team`,
    updated_at: new Date(),
    created_at: new Date()
  },
  {
    id: `email_template_${organizationId}_lease_renewal`,
    organization_id: organizationId,
    type: 'lease_renewal',
    subject: 'Lease Renewal Opportunity',
    body: `Dear {{tenant_name}},

We would like to inform you that your lease for suite {{suite_number}} at {{building_name}} will be expiring in {{days_left}} days on {{lease_end_date}}.

We value you as a tenant and would like to offer you the opportunity to renew your lease.

Please contact our office to discuss renewal options at your earliest convenience.

Best regards,
Your Property Management Team`,
    updated_at: new Date(),
    created_at: new Date()
  },
  {
    id: `email_template_${organizationId}_lease_expiring`,
    organization_id: organizationId,
    type: 'lease_expiring',
    subject: 'Lease Expiration Notice',
    body: `Dear {{tenant_name}},

This is a reminder that your lease for suite {{suite_number}} at {{building_name}} will be expiring on {{lease_end_date}}, which is {{days_left}} days from now.

If you have not already made arrangements for renewal, please contact our office as soon as possible.

Thank you for your attention to this matter.

Best regards,
Your Property Management Team`,
    updated_at: new Date(),
    created_at: new Date()
  }
];

// Sample SMS templates
const smsTemplates = [
  {
    id: `sms_template_${organizationId}_payment_due`,
    organization_id: organizationId,
    type: 'payment_due',
    body: `Hi {{tenant_first_name}}, reminder that your rent payment of ${{amount_due}} is due on {{due_date}}. Thank you.`,
    updated_at: new Date(),
    created_at: new Date()
  },
  {
    id: `sms_template_${organizationId}_payment_late`,
    organization_id: organizationId,
    type: 'payment_late',
    body: `Hi {{tenant_first_name}}, your rent payment of ${{amount_due}} was due on {{due_date}} and is now {{days_past_due}} days late. Please make payment ASAP.`,
    updated_at: new Date(),
    created_at: new Date()
  },
  {
    id: `sms_template_${organizationId}_lease_renewal`,
    organization_id: organizationId,
    type: 'lease_renewal',
    body: `Hi {{tenant_first_name}}, your lease at {{building_name}} suite {{suite_number}} expires in {{days_left}} days. Contact us to discuss renewal options.`,
    updated_at: new Date(),
    created_at: new Date()
  }
];

// Sample email automations
const emailAutomations = [
  {
    id: `email_automation_${organizationId}_payment`,
    organization_id: organizationId,
    category: 'payment_notices',
    name: 'Payment Reminder Sequence',
    send_on: [
      { offset: 3, unit: 'days', label: '3 days before due', template_type: 'payment_due' },
      { offset: 0, unit: 'days', label: 'On due date', template_type: 'payment_due' },
      { offset: 3, unit: 'days', label: '3 days after due', template_type: 'payment_late' }
    ],
    updated_at: new Date(),
    created_at: new Date()
  },
  {
    id: `email_automation_${organizationId}_renewal`,
    organization_id: organizationId,
    category: 'lease_renewals',
    name: 'Lease Renewal Sequence',
    send_on: [
      { offset: 30, unit: 'days', label: '30 days before expiry', template_type: 'lease_renewal' },
      { offset: 14, unit: 'days', label: '14 days before expiry', template_type: 'lease_expiring' }
    ],
    updated_at: new Date(),
    created_at: new Date()
  }
];

// Sample SMS automations
const smsAutomations = [
  {
    id: `sms_automation_${organizationId}_payment`,
    organization_id: organizationId,
    category: 'payment_notices',
    name: 'SMS Payment Reminders',
    send_on: [
      { offset: 1, unit: 'days', label: '1 day before due', template_type: 'payment_due' },
      { offset: 5, unit: 'days', label: '5 days after due', template_type: 'payment_late' }
    ],
    updated_at: new Date(),
    created_at: new Date()
  },
  {
    id: `sms_automation_${organizationId}_renewal`,
    organization_id: organizationId,
    category: 'lease_renewals',
    name: 'SMS Lease Renewal Notices',
    send_on: [
      { offset: 21, unit: 'days', label: '21 days before expiry', template_type: 'lease_renewal' }
    ],
    updated_at: new Date(),
    created_at: new Date()
  }
];

// Insert or update sample data
try {
  // Insert email templates
  console.log('Adding/updating email templates...');
  for (const template of emailTemplates) {
    await EmailTemplates.findOneAndUpdate(
      { id: template.id },
      template,
      { upsert: true, new: true }
    );
  }
  
  // Insert SMS templates
  console.log('Adding/updating SMS templates...');
  for (const template of smsTemplates) {
    await SmsTemplates.findOneAndUpdate(
      { id: template.id },
      template,
      { upsert: true, new: true }
    );
  }
  
  // Insert email automations
  console.log('Adding/updating email automations...');
  for (const automation of emailAutomations) {
    await EmailAutomations.findOneAndUpdate(
      { id: automation.id },
      automation,
      { upsert: true, new: true }
    );
  }
  
  // Insert SMS automations
  console.log('Adding/updating SMS automations...');
  for (const automation of smsAutomations) {
    await SmsAutomations.findOneAndUpdate(
      { id: automation.id },
      automation,
      { upsert: true, new: true }
    );
  }
  
  // Count and report
  const emailTemplateCount = await EmailTemplates.countDocuments({ organization_id: organizationId });
  const smsTemplateCount = await SmsTemplates.countDocuments({ organization_id: organizationId });
  const emailAutomationCount = await EmailAutomations.countDocuments({ organization_id: organizationId });
  const smsAutomationCount = await SmsAutomations.countDocuments({ organization_id: organizationId });
  
  console.log(`Sample data added successfully!`);
  console.log(`Email Templates: ${emailTemplateCount}`);
  console.log(`SMS Templates: ${smsTemplateCount}`);
  console.log(`Email Automations: ${emailAutomationCount}`);
  console.log(`SMS Automations: ${smsAutomationCount}`);
  
} catch (error) {
  console.error('Error adding sample data:', error);
} finally {
  // Close the connection
  await mongoose.connection.close();
  console.log('Database connection closed');
}
