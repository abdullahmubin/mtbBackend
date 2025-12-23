import bcrypt from 'bcrypt'
import moment from 'moment'
import models from './../models/index.js'
import { hashPassword, comparePasswords, generateToken, sendEmailToUser, generateRefreshToken, hashRole, compareHasRole, hashForgetKey } from '../utils/index.js'
import { verifyRefreshToken, verifyToken } from '../middleware/authMiddleware.js';
import mongoose from 'mongoose';
import { getModel } from '../models/registry.js';
import jwt from 'jsonwebtoken';
import { secretKey, refreshSecretKey } from '../utils/index.js';
import logger from '../utils/logger.js';
// Import models directly to ensure we have the correct references
import TenantsDB from '../models/tenants.js';
import OrganizationDB from '../models/organizations.js';

// Plan name normalization mapping
const PLAN_MAPPING = {
    'Affordable for small landlords': 'starter',
    'Professional': 'pro', 
    'Business': 'business',
    'Best for growing portfolios': 'enterprise',
    'HobbyList': 'HobbyList',
    'Free': 'free',
    'Starter': 'starter',
    'Pro': 'pro',
    'Enterprise': 'enterprise'
};

// Helper function to normalize plan names
function normalizePlanName(planName) {
    return PLAN_MAPPING[planName] || planName || 'free';
}

// Helper function to ensure plan settings exist for a given plan
async function ensurePlanSettingsExist(planName) {
    try {
        // Normalize plan name first
        const normalizedPlan = normalizePlanName(planName);
        
        const PlanSettings = getModel('plan_settings');
        const existing = await PlanSettings.findOne({ _id: normalizedPlan });
        
        if (!existing) {
            logger.warn('Plan settings not found, creating default settings', { plan: normalizedPlan });
            
            // Default plan settings based on common plan tiers
            const defaultSettings = {
                _id: normalizedPlan,
                name: normalizedPlan.charAt(0).toUpperCase() + normalizedPlan.slice(1),
                tenantDirectoryEnabled: normalizedPlan !== 'free', // Enable tenant login for all paid plans
                maxTenants: normalizedPlan === 'free' ? 5 : (normalizedPlan === 'starter' ? 25 : (normalizedPlan === 'pro' ? 50 : 100)),
                documentsEnabled: normalizedPlan !== 'free',
                paymentsEnabled: normalizedPlan !== 'free', 
                buildingsEnabled: normalizedPlan !== 'free',
                floorsEnabled: normalizedPlan !== 'free',
                suitesEnabled: normalizedPlan !== 'free',
                messagingEnabled: true,
                announcementsEnabled: true,
                contractsEnabled: normalizedPlan !== 'free'
            };
            
            await PlanSettings.create(defaultSettings);
            logger.info('Created default plan settings', { plan: normalizedPlan });
        }
        
        return normalizedPlan;
    } catch (error) {
        logger.error('Error ensuring plan settings exist', { plan: planName, error: error.message });
        // Don't throw error to prevent registration from failing
        return normalizePlanName(planName);
    }
}

// Function to seed comprehensive sample data for a new organization
async function seedOrganizationDemoData(organizationId, userName) {
    try {
    const logger = (await import('../utils/logger.js')).default;
    logger.info('Starting to seed demo data for organization', { organizationId });
        
        // 1. Create buildings
        const buildings = [
            {
                id: `building_${organizationId}_001`,
                organization_id: organizationId,
                name: "Parkview Residences",
                address: "123 Park Avenue",
                city: "New York",
                state: "NY",
                country: "USA",
                zip_code: "10001",
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                id: `building_${organizationId}_002`,
                organization_id: organizationId,
                name: "Riverside Apartments",
                address: "456 River Road",
                city: "New York",
                state: "NY",
                country: "USA",
                zip_code: "10002",
                created_at: new Date(),
                updated_at: new Date()
            }
        ];
        await mongoose.connection.collection('buildings').insertMany(buildings);
    logger.info('Buildings created');
        
        // 2. Create floors
        const floors = [
            {
                id: `floor_${organizationId}_001`,
                organization_id: organizationId,
                building_id: `building_${organizationId}_001`,
                name: "1st Floor",
                floor_number: 1,
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                id: `floor_${organizationId}_002`,
                organization_id: organizationId,
                building_id: `building_${organizationId}_001`,
                name: "2nd Floor",
                floor_number: 2,
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                id: `floor_${organizationId}_003`,
                organization_id: organizationId,
                building_id: `building_${organizationId}_002`,
                name: "1st Floor",
                floor_number: 1,
                created_at: new Date(),
                updated_at: new Date()
            }
        ];
        await mongoose.connection.collection('floors').insertMany(floors);
    logger.info('Floors created');
        
        // 3. Create suites
        const suites = [
            {
                id: `suite_${organizationId}_001`,
                organization_id: organizationId,
                building_id: `building_${organizationId}_001`,
                floor_id: `floor_${organizationId}_001`,
                name: "101",
                size_sqft: 850,
                bedrooms: 1,
                bathrooms: 1,
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                id: `suite_${organizationId}_002`,
                organization_id: organizationId,
                building_id: `building_${organizationId}_001`,
                floor_id: `floor_${organizationId}_002`,
                name: "201",
                size_sqft: 1100,
                bedrooms: 2,
                bathrooms: 1,
                created_at: new Date(),
                updated_at: new Date()
            }
        ];
        await mongoose.connection.collection('suites').insertMany(suites);
    logger.info('Suites created');
        
        // 4. Create tenants
        const tenants = [
            {
                id: `tenant_${organizationId}_001`,
                organization_id: organizationId,
                first_name: "Michael",
                last_name: "Johnson",
                email: "michael.johnson@example.com",
                phone: "+1-555-1234",
                building_id: `building_${organizationId}_001`,
                floor_id: `floor_${organizationId}_001`,
                suite_id: `suite_${organizationId}_001`,
                status: "active",
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                id: `tenant_${organizationId}_002`,
                organization_id: organizationId,
                first_name: "Sarah",
                last_name: "Williams",
                email: "sarah.williams@example.com",
                phone: "+1-555-5678",
                building_id: `building_${organizationId}_001`,
                floor_id: `floor_${organizationId}_002`,
                suite_id: `suite_${organizationId}_002`,
                status: "active",
                created_at: new Date(),
                updated_at: new Date()
            }
        ];
        await mongoose.connection.collection('tenants').insertMany(tenants);
    logger.info('Tenants created');
        
        // 5. Create leases
        const leases = [
            {
                id: `lease_${organizationId}_001`,
                organization_id: organizationId,
                tenant_id: `tenant_${organizationId}_001`,
                unit_id: `suite_${organizationId}_001`,
                lease_start: "2025-07-01",
                lease_end: "2026-06-30",
                rent_amount: 1500,
                due_day: 1,
                grace_period_days: 5,
                late_fee_flat: 50,
                late_fee_percent: 0,
                security_deposit_amount: 1500,
                recurring_charges: [],
                status: "Active",
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                id: `lease_${organizationId}_002`,
                organization_id: organizationId,
                tenant_id: `tenant_${organizationId}_002`,
                unit_id: `suite_${organizationId}_002`,
                lease_start: "2025-07-15",
                lease_end: "2026-07-14",
                rent_amount: 1800,
                due_day: 1,
                grace_period_days: 5,
                late_fee_flat: 50,
                late_fee_percent: 0,
                security_deposit_amount: 1800,
                recurring_charges: [],
                status: "Active",
                created_at: new Date(),
                updated_at: new Date()
            }
        ];
        await mongoose.connection.collection('leases').insertMany(leases);
    logger.info('Leases created');
        
        // 6. Create payments
        const payments = [
            {
                id: `payment_${organizationId}_001`,
                organization_id: organizationId,
                tenant_id: `tenant_${organizationId}_001`,
                amount: 1500,
                due_date: "2025-08-01",
                paid_date: "2025-07-31",
                status: "Paid",
                payment_method: "Bank Transfer",
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                id: `payment_${organizationId}_002`,
                organization_id: organizationId,
                tenant_id: `tenant_${organizationId}_002`,
                amount: 1800,
                due_date: "2025-08-01",
                paid_date: "2025-08-01",
                status: "Paid",
                payment_method: "Credit Card",
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                id: `payment_${organizationId}_003`,
                organization_id: organizationId,
                tenant_id: `tenant_${organizationId}_001`,
                amount: 1500,
                due_date: "2025-09-01",
                paid_date: null,
                status: "Pending",
                payment_method: null,
                created_at: new Date(),
                updated_at: new Date()
            }
        ];
        await mongoose.connection.collection('payments').insertMany(payments);
    logger.info('Payments created');
        
        // 7. Create tickets
        const tickets = [
            {
                id: `ticket_${organizationId}_001`,
                organization_id: organizationId,
                tenant_id: `tenant_${organizationId}_001`,
                title: "Leaky faucet in bathroom",
                description: "The bathroom sink faucet is dripping constantly.",
                status: "Open",
                priority: "Medium",
                created_by_user_id: `tenant_${organizationId}_001`,
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                id: `ticket_${organizationId}_002`,
                organization_id: organizationId,
                tenant_id: `tenant_${organizationId}_002`,
                title: "Broken dishwasher",
                description: "Dishwasher isn't draining properly after cycle completes.",
                status: "In Progress",
                priority: "High",
                created_by_user_id: `tenant_${organizationId}_002`,
                created_at: new Date(),
                updated_at: new Date()
            }
        ];
        await mongoose.connection.collection('tickets').insertMany(tickets);
    logger.info('Tickets created');
        
        // 8. Create documents
        const documents = [
            {
                id: `doc_${organizationId}_001`,
                organization_id: organizationId,
                name: "Tenant Handbook.pdf",
                uploadedAt: new Date(),
                uploader: userName
            },
            {
                id: `doc_${organizationId}_002`,
                organization_id: organizationId,
                name: "Building Rules and Regulations.pdf",
                uploadedAt: new Date(),
                uploader: userName
            },
            {
                id: `doc_${organizationId}_003`,
                organization_id: organizationId,
                name: "Maintenance Request Form.docx",
                uploadedAt: new Date(),
                uploader: userName
            }
        ];
        // await mongoose.connection.collection('documents').insertMany(documents);
    logger.info('Documents created');
        
        // 9. Create announcements
        const announcements = [
            {
                id: `announcement_${organizationId}_001`,
                organization_id: organizationId,
                text: "Welcome to your new tenant portal! Explore the features to manage your leases, payments, and maintenance requests.",
                createdAt: new Date(),
                author: userName
            },
            {
                id: `announcement_${organizationId}_002`,
                organization_id: organizationId,
                text: "Building-wide fire alarm testing scheduled for August 30th between 10 AM and 12 PM.",
                createdAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5), // 5 days from now
                author: userName
            },
            {
                id: `announcement_${organizationId}_003`,
                organization_id: organizationId,
                text: "Reminder: Rent payments are due on the 1st of each month. Late fees apply after the 5th.",
                createdAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10), // 10 days from now
                author: userName
            }
        ];
        // await mongoose.connection.collection('announcements').insertMany(announcements);
    logger.info('Announcements created');

        // 10. Create messages
        const messages = [
            {
                id: `msg_${organizationId}_001`,
                organization_id: organizationId,
                text: "Welcome to your tenant portal! How can we help you today?",
                sender: userName,
                role: "admin",
                createdAt: new Date()
            },
            {
                id: `msg_${organizationId}_002`,
                organization_id: organizationId,
                text: "I have a question about my lease agreement.",
                sender: "Michael Johnson",
                role: "tenant",
                createdAt: new Date(Date.now() + 1000 * 60 * 5) // 5 minutes later
            },
            {
                id: `msg_${organizationId}_003`,
                organization_id: organizationId,
                text: "Of course! I've uploaded it to your documents section. Let me know if you need anything clarified.",
                sender: userName,
                role: "admin",
                createdAt: new Date(Date.now() + 1000 * 60 * 10) // 10 minutes later
            },
            {
                id: `msg_${organizationId}_004`,
                organization_id: organizationId,
                text: "Thanks, I'll take a look. Also, when is maintenance scheduled for this month?",
                sender: "Michael Johnson",
                role: "tenant",
                createdAt: new Date(Date.now() + 1000 * 60 * 15) // 15 minutes later
            },
            {
                id: `msg_${organizationId}_005`,
                organization_id: organizationId,
                text: "Maintenance is scheduled for August 30th from 10 AM to 2 PM. We'll be checking all smoke detectors and HVAC systems.",
                sender: userName,
                role: "admin",
                createdAt: new Date(Date.now() + 1000 * 60 * 20) // 20 minutes later
            }
        ];
        // await mongoose.connection.collection('messages').insertMany(messages);
    logger.info('Messages created');

        // 11. Create SMS messages
        const smsMessages = [
            {
                id: `sms_${organizationId}_001`,
                organization_id: organizationId,
                sender_id: `user_${organizationId}_001`,
                recipient_id: `tenant_${organizationId}_001`,
                message: "Reminder: Your rent payment is due in 5 days.",
                is_read: true,
                created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days ago
                updated_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3)
            },
            {
                id: `sms_${organizationId}_002`,
                organization_id: organizationId,
                sender_id: `tenant_${organizationId}_001`,
                recipient_id: `user_${organizationId}_001`,
                message: "Thanks for the reminder. I'll make the payment tomorrow.",
                is_read: true,
                created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
                updated_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2)
            },
            {
                id: `sms_${organizationId}_003`,
                organization_id: organizationId,
                sender_id: `user_${organizationId}_001`,
                recipient_id: `tenant_${organizationId}_001`,
                message: "Building update: Water will be shut off for 1 hour tomorrow from 10-11 AM for maintenance.",
                is_read: false,
                created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1), // 1 day ago
                updated_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1)
            },
            {
                id: `sms_${organizationId}_004`,
                organization_id: organizationId,
                sender_id: `tenant_${organizationId}_001`,
                recipient_id: `user_${organizationId}_001`,
                message: "Got it, thanks for letting me know.",
                is_read: false,
                created_at: new Date(Date.now() - 1000 * 60 * 60 * 23), // 23 hours ago
                updated_at: new Date(Date.now() - 1000 * 60 * 60 * 23)
            }
        ];
        await mongoose.connection.collection('sms_messages').insertMany(smsMessages);
    logger.info('SMS messages created');

        // 12. Add sample email & SMS templates + automations (idempotent upserts)
        try {
            logger.info('Upserting sample email & SMS templates and automations...');

            const emailTemplates = [
                {
                    id: `email_template_${organizationId}_payment_due`,
                    organization_id: organizationId,
                    type: 'payment_due',
                    subject: 'Payment Due Reminder',
                    body: `Dear {{tenant_name}},\n\nWe hope this email finds you well. This is a friendly reminder that your rent payment of {{amount_due}} is due on {{due_date}}.\n\nPlease ensure timely payment to avoid any late fees.\n\nThank you for your attention to this matter.\n\nBest regards,\nYour Property Management Team`,
                    updated_at: new Date(),
                    created_at: new Date()
                },
                {
                    id: `email_template_${organizationId}_payment_late`,
                    organization_id: organizationId,
                    type: 'payment_late',
                    subject: 'Late Payment Notice',
                    body: `Dear {{tenant_name}},\n\nThis is to inform you that your rent payment of {{amount_due}} which was due on {{due_date}} is now {{days_past_due}} days overdue.\n\nPlease make the payment as soon as possible to avoid any additional late fees.\n\nIf you have already made the payment, please disregard this notice.\n\nBest regards,\nYour Property Management Team`,
                    updated_at: new Date(),
                    created_at: new Date()
                },
                {
                    id: `email_template_${organizationId}_lease_renewal`,
                    organization_id: organizationId,
                    type: 'lease_renewal',
                    subject: 'Lease Renewal Opportunity',
                    body: `Dear {{tenant_name}},\n\nWe would like to inform you that your lease for suite {{suite_number}} at {{building_name}} will be expiring in {{days_left}} days on {{lease_end_date}}.\n\nWe value you as a tenant and would like to offer you the opportunity to renew your lease.\n\nPlease contact our office to discuss renewal options at your earliest convenience.\n\nBest regards,\nYour Property Management Team`,
                    updated_at: new Date(),
                    created_at: new Date()
                },
                {
                    id: `email_template_${organizationId}_lease_expiring`,
                    organization_id: organizationId,
                    type: 'lease_expiring',
                    subject: 'Lease Expiration Notice',
                    body: `Dear {{tenant_name}},\n\nThis is a reminder that your lease for suite {{suite_number}} at {{building_name}} will be expiring on {{lease_end_date}}, which is {{days_left}} days from now.\n\nIf you have not already made arrangements for renewal, please contact our office as soon as possible.\n\nThank you for your attention to this matter.\n\nBest regards,\nYour Property Management Team`,
                    updated_at: new Date(),
                    created_at: new Date()
                }
            ];

            const smsTemplates = [
                {
                    id: `sms_template_${organizationId}_payment_due`,
                    organization_id: organizationId,
                    type: 'payment_due',
                    body: `Hi {{tenant_first_name}}, reminder that your rent payment of {{amount_due}} is due on {{due_date}}. Thank you.`,
                    updated_at: new Date(),
                    created_at: new Date()
                },
                {
                    id: `sms_template_${organizationId}_payment_late`,
                    organization_id: organizationId,
                    type: 'payment_late',
                    body: `Hi {{tenant_first_name}}, your rent payment of {{amount_due}} was due on {{due_date}} and is now {{days_past_due}} days late. Please make payment ASAP.`,
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

            // Perform idempotent upserts
            for (const t of emailTemplates) {
                // Legacy collection (kept for compatibility with json-server / tests)
                await mongoose.connection.collection('email_templates').updateOne(
                    { id: t.id },
                    { $set: t },
                    { upsert: true }
                );

                // Also upsert into the canonical `templates` collection so Mongoose Template model
                // (backend/src/models/Template.js) can find them using the standard schema.
                const mapped = {
                    id: t.id,
                    organization_id: t.organization_id,
                    name: t.subject || t.type || 'Email Template',
                    channel: 'email',
                    subject: t.subject || '',
                    bodyText: t.body || '',
                    bodyHtml: '',
                    placeholders: [],
                    isDefault: false,
                    createdAt: t.created_at || new Date(),
                    updatedAt: t.updated_at || new Date()
                };
                await mongoose.connection.collection('templates').updateOne(
                    { id: mapped.id },
                    { $set: mapped },
                    { upsert: true }
                );
            }
            for (const t of smsTemplates) {
                // Legacy collection (kept for compatibility with json-server / tests)
                await mongoose.connection.collection('sms_templates').updateOne(
                    { id: t.id },
                    { $set: t },
                    { upsert: true }
                );

                // Also upsert into the canonical `templates` collection with channel 'sms'
                const mappedSms = {
                    id: t.id,
                    organization_id: t.organization_id,
                    name: t.type ? `${t.type} (SMS)` : 'SMS Template',
                    channel: 'sms',
                    subject: '',
                    bodyText: t.body || '',
                    bodyHtml: '',
                    placeholders: [],
                    isDefault: false,
                    createdAt: t.created_at || new Date(),
                    updatedAt: t.updated_at || new Date()
                };
                await mongoose.connection.collection('templates').updateOne(
                    { id: mappedSms.id },
                    { $set: mappedSms },
                    { upsert: true }
                );
            }
            for (const a of emailAutomations) {
                await mongoose.connection.collection('email_automations').updateOne(
                    { id: a.id },
                    { $set: a },
                    { upsert: true }
                );
            }
            for (const a of smsAutomations) {
                await mongoose.connection.collection('sms_automations').updateOne(
                    { id: a.id },
                    { $set: a },
                    { upsert: true }
                );
            }

            logger.info('Sample templates and automations upserted');
        } catch (tplErr) {
            logger.error('Error upserting sample templates/automations', tplErr);
            // don't throw to avoid breaking registration
        }

    logger.info('Demo data created successfully for organization', { organizationId });
    } catch (error) {
    const logger = (await import('../utils/logger.js')).default;
    logger.error('Error creating demo data', error);
        // Don't throw error to prevent registration from failing
    }
}

export const registerUser = async (user) => {

    const hashedPassword = await hashPassword(user.password);
    // Default to clientadmin for plan-based signups (pricing page)
    const rawRole = user.role || (user.plan ? 'clientadmin' : 'customer');
    const hashedRole = await hashRole(rawRole);

    let organizationId = user.organization_id;
    let saveData;
    // Auto-create organization for clientadmin users
    if (rawRole === 'clientadmin') {
        organizationId = Date.now();
        
        // Ensure plan settings exist for this organization's plan and get normalized plan
        const normalizedPlan = await ensurePlanSettingsExist(user.plan || 'starter');
        
        // First, create user so we have _id for ownerUserId
        const model = new models.UserDB({
            userName: user.userName,
            email: user.email,
            password: hashedPassword,
            role: hashedRole, // store hashed role
            plan: user.plan,
            organization_id: organizationId
        });
        saveData = await model.save();
        // Now create organization with ownerUserId set
        const org = new models.OrganizationDB({
            organization_id: organizationId,
            name: user.userName || user.email,
            ownerUserId: saveData._id.toString(),
            plan: normalizedPlan,
            status: 'active'
        });
        await org.save();
        
        // Seed demo data for the new organization
        await seedOrganizationDemoData(organizationId, user.userName || user.email);
    } else {
        const model = new models.UserDB({
            userName: user.userName,
            email: user.email,
            password: hashedPassword,
            role: hashedRole, // store hashed role
            plan: user.plan,
            organization_id: organizationId
        });
        saveData = await model.save();
        
        // If user is joining an existing organization, check if it has data
        // If not, seed sample data for it
        if (organizationId) {
            try {
                // Check if there are any messages for this organization
                const existingMessages = await mongoose.connection.collection('messages')
                    .countDocuments({ organization_id: organizationId });
                
                if (existingMessages === 0) {
                    console.log(`No data found for organization ${organizationId}, seeding demo data...`);
                    // Seed demo data for the organization
                    await seedOrganizationDemoData(organizationId, user.userName || user.email);
                }
            } catch (error) {
                console.error(`Error checking or seeding data for organization ${organizationId}:`, error);
                // Don't throw error to prevent registration from failing
            }
        }
    }
    const messageSent = sendEmailToUser({ email: user.email, username: user.userName, emailType: "activationEmail", plan: user.plan });
    return saveData;

}

export const forgetPassword = async (data) => {
    let { email, password, loginMode } = data;

    const existingUser = await models.UserDB.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    // let model = await db.findById(id).select("-password");

    if (!existingUser) {
        throw new Error("Email not found");
    }

    // const hashedPassword = await hashPassword(user.password);

    const messageSent = await sendEmailToUser({ email: email, emailType: "forgetPassword", plan: await hashForgetKey(process.env.FORGET_PASSWORD_KEY) });



    if (messageSent && messageSent.data.id)
        return messageSent;
    else
        throw new Error("Something went wrong. Contact with support.");
}

export const resetPass = async (data) => {
    let { email, password } = data;
    const existingUser = await models.UserDB.findOne({ email });

    if (!existingUser) {
        throw new Error("User not found");
    }

    if (!password) {
        throw new Error("Password is required.");
    }

    const hashedPassword = await hashPassword(password);
    let readyToSave = {
        password: hashedPassword
    }

    const result = await models.UserDB.findOneAndUpdate({ _id: existingUser.id }, { $set: readyToSave }, { new: true, runValidators: true }).select("-password");

    return result;
}

export const login = async (data) => {

    let { email, password, loginMode } = data;
    
    // First, check if this is a tenant
    const logger = (await import('../utils/logger.js')).default;
    logger.debug('Models available', { models: Object.keys(models) });
    
        // Use the directly imported model to ensure it exists
        // Allow login with either email or userName (case-insensitive)
        const tenant = await TenantsDB.findOne({
            $or: [
                { email: { $regex: new RegExp(`^${email}$`, 'i') } },
                { userName: { $regex: new RegExp(`^${email}$`, 'i') } }
            ]
        });
        logger.debug('Tenant login attempt', { email });
        logger.debug('Tenant found', { found: Boolean(tenant) });
    
    // If we found a tenant with matching email and portal access is enabled
    if (tenant && tenant.has_portal_access) {
    logger.debug('Tenant portal access', { has_portal_access: tenant.has_portal_access, organization_id: tenant.organization_id });
        
        // Only query by organization_id, not _id to avoid type casting issues
        const organization = await OrganizationDB.findOne({ organization_id: tenant.organization_id });
        
    logger.debug('Organization found', { found: Boolean(organization) });
        
        if (organization) {
            // Ensure plan settings exist and get normalized plan name
            const normalizedPlan = await ensurePlanSettingsExist(organization.plan || 'free');
            const planSettings = await getModel('plan_settings').findOne({ _id: normalizedPlan });
            logger.debug('Plan settings found', { found: Boolean(planSettings) });
            logger.debug('Tenant directory enabled', { enabled: planSettings?.tenantDirectoryEnabled });
            
            // If plan settings not found, log warning and default to enabled for non-free plans
            if (!planSettings) {
                logger.warn('Plan settings not found for plan', { plan: organization.plan });
                // Allow tenant login if organization has a non-free plan (assume tenant directory is enabled)
                const shouldAllowTenantLogin = organization.plan && organization.plan !== 'free';
                if (!shouldAllowTenantLogin) {
                    logger.debug('Tenant login not allowed - no plan settings and free plan');
                    // Continue to regular user login
                } else {
                    logger.debug('Allowing tenant login despite missing plan settings (non-free plan)');
                }
            }
            
            // If tenant directory is enabled for this organization (or missing plan settings for non-free plan)
            const tenantDirectoryEnabled = planSettings ? planSettings.tenantDirectoryEnabled : 
                (organization.plan && organization.plan !== 'free'); // Default to enabled for paid plans
            
            if (tenantDirectoryEnabled) {
                logger.debug('Tenant has password', { has_password: !!tenant.password });
                
                // Verify tenant password
                if (tenant.password) {
                    // Use bcrypt to compare the provided password with the stored hash
                    const passwordMatch = await bcrypt.compare(password, tenant.password);
                    logger.debug('Password match result', { match: passwordMatch });
                    
                    if (!passwordMatch) {
                        throw new Error("Invalid email or password. Please check your credentials and try again.");
                    }
                } else {
                    // If password hasn't been set yet but portal access is enabled, allow login with any non-empty password
                    // This is a temporary fallback for existing tenants without passwords
                    if (!password || password.trim().length === 0) {
                        throw new Error("Password is required. Please enter a valid password.");
                    }
                    
                    // Set this password as the tenant's initial password
                    const hashedPassword = await hashPassword(password);
                    await models.TenantsDB.findByIdAndUpdate(
                        tenant._id,
                        { 
                            password: hashedPassword,
                            password_set: true
                        }
                    );
                }
                
                // Create a session for this tenant
                const tenantSession = {
                    id: tenant.id,
                    email: tenant.email,
                    name: `${tenant.first_name} ${tenant.last_name}`,
                    role: "tenant",
                    organization_id: tenant.organization_id,
                    tenant_id: tenant.id,
                    // Include the organization's plan for tenants
                    plan: organization.plan || 'free'
                };
                
                // Create tokens for this tenant
                const token = jwt.sign(tenantSession, secretKey, { expiresIn: '24h' });
                const refreshToken = jwt.sign(tenantSession, refreshSecretKey, { expiresIn: '7d' });
                
                return {
                    token,
                    refreshToken,
                    userInfo: {
                        ...tenantSession,
                        isTenant: true,
                        // Also include plan in userInfo
                        plan: organization.plan || 'free'
                    }
                };
            }
        }
    }
    
    // If not a tenant or tenant login failed, continue with regular user login
    const existingUser = await models.UserDB.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    // let model = await db.findById(id).select("-password");

    if (existingUser && existingUser.isDeleted) {
        // return res.status(401).json({ message: 'Account not found or has been deleted.' });
        throw new Error("You have deleted your account. Please contact support for assistance.");
    }

    if (!existingUser) {
        throw new Error("Invalid email or password. Please check your credentials and try again. or password you entered does not match any account. Please check and try again..");

    }

    // const isPasswordValid = bcrypt.compare(password, existingUser.password);
    const match = await comparePasswords(password, existingUser.password);

    if (!match) {

        if (loginMode == 'afterRegistration') {
            throw new Error("Username/Email already taken. Please choose a different one.")
        }

        throw new Error("Invalid email or password. Please check your credentials and try again. or password you entered does not match any account. Please check and try again..");
    }

    let userObj = existingUser.toObject(); // Convert Mongoose document to plain object

    const isAdmin = await compareHasRole("sUp&perA#min", userObj.role);

    if (isAdmin) {
        userObj.permission = "admin";
    }

    if (loginMode != 'afterRegistration' && userObj.plan == "single-plan") {
        const findGeneratedReceipt = await models.ReceiptByUserDB.findOne({ userId: userObj._id });
        if (findGeneratedReceipt) {
            userObj.planExpired = true;
        }

        // const hasCompletedSubscription = await models.SubscriptionsDB.findOne({ userId: userObj._id });

        // if (!hasCompletedSubscription) {
        //     throw new Error("Incorrect password.");
        // }
    }
    if (loginMode != 'afterRegistration') {
        // Require an active subscription for normal logins unless the user is a super-admin.
        const hasCompletedSubscription = await models.SubscriptionsDB.findOne({ userId: userObj._id, isActive: true });
        const isAdmin = await compareHasRole("sUp&perA#min", userObj.role);
        if (!isAdmin && !hasCompletedSubscription) {
            throw new Error("Your account doesn't have an active subscription. Please subscribe to continue.");
        }
        if (hasCompletedSubscription) {
            const isPlanExpired = moment().isAfter(moment(hasCompletedSubscription.planEndDate));
            userObj.isPlanExpired = isPlanExpired;
        }
    }


    let needVeryShortTokenLife = false;
    if (userObj.plan == "single-plan") {
        needVeryShortTokenLife = true
    }


    // Normalize role for tokens/UI using central helper (handles hashed roles and subscription mapping)
    try {
        const { normalizeRoleForToken } = await import('./../utils/index.js');
        userObj.role = await normalizeRoleForToken(userObj, models);
    } catch (err) {
        // Fallback to previous behavior if helper import fails
        if (!isAdmin) {
            const activeSub = await models.SubscriptionsDB.findOne({ userId: userObj._id, isActive: true });
            if (activeSub || userObj.plan) {
                userObj.role = 'clientadmin';
            } else {
                userObj.role = userObj.role && typeof userObj.role === 'string' && userObj.role.length < 40 ? userObj.role : 'tenant';
            }
        }
    }
    
    // If the user has an organization_id, make sure to get the plan from the organization
    if (userObj.organization_id) {
        try {
            const org = await models.OrganizationDB.findOne({ organization_id: userObj.organization_id });
            if (org && org.plan) {
                // Make sure the plan from organization is used in the token and user object
                userObj.plan = org.plan;
            }
        } catch (error) {
            console.error("Error getting organization plan:", error);
        }
    }

    const token = generateToken(userObj, needVeryShortTokenLife);
    const refreshToken = generateRefreshToken(userObj);
    if (userObj.planExpired)
        delete userObj.planExpired;

    delete userObj.password; // Now delete works
    delete userObj.permission; // Now delete works

    return { token, userInfo: userObj, refreshToken: refreshToken };
}

export const checkAlreadyExistUsernameEmail = async (data) => {

    let conditions = [];

    if (data.userName) {
        conditions.push({ userName: data.userName });
    }
    if (data.email) {
        conditions.push({ email: { $regex: new RegExp(`^${data.email}$`, 'i') } });
    }

    // Only use $or if there are conditions
    const query = conditions.length > 0 ? { $or: conditions } : {};

    const existingUser = await models.UserDB.findOne(query);

    return existingUser;
}


// userName: user.userName,
//         email: user.email,


export const refreshtoken = async (oldToken) => {
    try {
        const decodedToken = verifyRefreshToken(oldToken);
    logger.debug('Refresh token for user', { email: decodedToken.email });
        
        // Check if this is a tenant token (it will have tenant_id)
        if (decodedToken.tenant_id) {
            logger.debug('Processing tenant refresh token');
            
            // Find the tenant by ID
            const tenant = await models.TenantsDB.findById(decodedToken.tenant_id);
            if (!tenant) {
                logger.warn('Tenant not found with ID', { tenant_id: decodedToken.tenant_id });
                throw new Error("Tenant not found.");
            }
            
            // Find their organization
            const organization = await models.OrganizationDB.findOne({ 
                organization_id: decodedToken.organization_id 
            });
            
            if (!organization) {
                logger.warn('Organization not found for tenant');
                throw new Error("Organization not found for tenant.");
            }
            
            // Create a new tenant session with updated information
            const tenantSession = {
                id: tenant.id,
                email: tenant.email,
                name: `${tenant.first_name} ${tenant.last_name}`,
                role: "tenant",
                organization_id: tenant.organization_id,
                tenant_id: tenant.id,
                // Always include the organization's plan for tenants
                plan: organization.plan || 'free',
                isTenant: true
            };
            
            // Generate new tokens
            const newToken = jwt.sign(tenantSession, secretKey, { expiresIn: '24h' });
            const newRefreshToken = jwt.sign(tenantSession, refreshSecretKey, { expiresIn: '7d' });
            
            logger.info('Tenant refresh successful', { plan: tenantSession.plan });
            return { token: newToken, refreshToken: newRefreshToken };
        }
        
        // Regular user flow
        let findUser = await models.UserDB.findById(decodedToken.id);

        if (!findUser) {
            throw new Error("User not found.");
        }

        let result = findUser.toObject(); // Convert Mongoose document to plain object

        if (result.plan == "single-plan") {
            const findGeneratedReceipt = await models.ReceiptByUserDB.findOne({ userId: decodedToken.id });
            if (findGeneratedReceipt) {
                result.planExpired = true;
            }
        }

        const hasCompletedSubscription = await models.SubscriptionsDB.findOne({ userId: decodedToken.id });

        if (!hasCompletedSubscription) {
            throw new Error("Invalid email or password. Please check your credentials and try again. or password you entered does not match any account. Please check and try again..");
        }
        const isPlanExpired = moment().isAfter(moment(hasCompletedSubscription.planEndDate));

        delete result.password;
        result.isPlanExpired = isPlanExpired;

        const isAdmin = await compareHasRole("sUp&perA#min", result.role);

        if (isAdmin) {
            result.permission = "admin";
        }
        
        // Check if user has an organization and update the plan from there if possible
        if (result.organization_id) {
            try {
                const org = await models.OrganizationDB.findOne({ organization_id: result.organization_id });
                if (org && org.plan) {
                    // Update the plan from organization to ensure consistency
                    result.plan = org.plan;
                }
            } catch (error) {
                console.error("Error getting organization plan during token refresh:", error);
            }
        }
        
        // Also get the plan from the original refresh token if available
        if (!result.plan && decodedToken.plan) {
            result.plan = decodedToken.plan;
        }

        // Ensure role is normalized (human readable) before generating new tokens.
        try {
            const { normalizeRoleForToken } = await import('./../utils/index.js');
            result.role = await normalizeRoleForToken(result, models);
        } catch (err) {
            // If normalization fails, fall back to existing role value (best-effort)
            logger.warn('Role normalization failed during token refresh, falling back to stored role', { err: err && err.message });
        }

        const newToken = generateToken(result);
        const newRefreshToken = generateRefreshToken(result);
        return { token: newToken, refreshToken: newRefreshToken };
    } catch (error) {
        console.log('Token refresh error:');
        console.log(error);
        throw new Error("Invalid Token");
    }
}

export const activateUserInDB = async (email, userName, plan) => {
    const db = models.UserDB;
    const data = await db.findOne({ email, userName })

    if (!data)
        throw new NotFound('Invalid user ')

    const updatedUser = await db.findByIdAndUpdate(
        data._id,
        { $set: { isActive: true } },
        { new: true, runValidators: true } // `new: true` returns the updated document
    );

    try {
        const { normalizeRoleForToken } = await import('./../utils/index.js');
        const userObj = updatedUser.toObject ? updatedUser.toObject() : { ...updatedUser };
        userObj.role = await normalizeRoleForToken(userObj, models);
        const token = generateToken(userObj);
        return token;
    } catch (err) {
        // On any error, fallback to generating token from the DB document (best effort)
        const token = generateToken(updatedUser);
        return token;
    }
}