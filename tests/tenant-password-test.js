import fetch from 'node-fetch';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { hashPassword } from '../src/utils/index.js';

// Load environment variables
dotenv.config({ path: '.env.development' });

console.log('Starting tenant password test...');
console.log('MongoDB URI:', process.env.MONGODB_URI || 'mongodb://localhost:27017/tenant-portal');

// Connect to MongoDB
try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tenant-portal';
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
} catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
}

// API endpoint for login
const API_URL = 'http://localhost:3031/api';
const LOGIN_URL = `${API_URL}/auth/login`;

async function testTenantPasswordLogin() {
    try {
        console.log('======= TENANT PASSWORD LOGIN TEST =======');
        
        // 1. Find an existing tenant
        const tenantsCollection = mongoose.connection.collection('tenants');
        const tenant = await tenantsCollection.findOne({ email: { $exists: true } });
        
        if (!tenant) {
            console.error('No tenants found in the database');
            return;
        }
        
        console.log(`Found tenant: ${tenant.first_name} ${tenant.last_name} (${tenant.email})`);
        
        // 2. Enable portal access for this tenant
        await tenantsCollection.updateOne(
            { _id: tenant._id },
            { $set: { has_portal_access: true } }
        );
        console.log('Enabled portal access for tenant');
        
        // 3. Set a test password for the tenant
        const testPassword = 'Test123!';
        const hashedPassword = await bcrypt.hash(testPassword, 10);
        
        await tenantsCollection.updateOne(
            { _id: tenant._id },
            { $set: { password: hashedPassword, password_set: true } }
        );
        console.log('Set test password for tenant');
        
        // 4. Enable tenant directory in plan settings
        const organization = await mongoose.connection.collection('organizations').findOne(
            { organization_id: tenant.organization_id }
        );
        
        if (!organization) {
            console.error('Organization not found. Organization ID:', tenant.organization_id);
            // List all organizations to debug
            const allOrgs = await mongoose.connection.collection('organizations').find({}).toArray();
            console.log('Available organizations:', allOrgs);
            return;
        }
        
        const planId = organization.plan || 'free';
        await mongoose.connection.collection('plan_settings').updateOne(
            { _id: planId },
            { $set: { tenantDirectoryEnabled: true } },
            { upsert: true }
        );
        console.log(`Enabled tenant directory for plan: ${planId}`);
        
        // 5. Try to login with correct password
        console.log('\nAttempting login with correct password...');
        console.log('Login URL:', LOGIN_URL);
        console.log('Login data:', { email: tenant.email, password: testPassword });
        
        try {
            const correctLoginResponse = await fetch(LOGIN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: tenant.email,
                    password: testPassword
                })
            });
            
            const correctLoginResult = await correctLoginResponse.json();
            console.log('Login response:', correctLoginResult);
            console.log('Login result:', correctLoginResult.token ? 'SUCCESS' : 'FAILED');
            
            // 6. Try to login with incorrect password
            console.log('\nAttempting login with incorrect password...');
            const incorrectLoginResponse = await fetch(LOGIN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: tenant.email,
                    password: 'WrongPassword123!'
                })
            });
            
            const incorrectLoginResult = await incorrectLoginResponse.json();
            console.log('Login response (should fail):', incorrectLoginResult);
            console.log('Login result (should fail):', !incorrectLoginResult.token ? 'CORRECTLY FAILED' : 'INCORRECTLY SUCCEEDED');
        } catch (error) {
            console.error('Error during login test:', error);
        }
        
        // Clean up
        console.log('\nTest completed. Closing database connection...');
    } catch (error) {
        console.error('Error during test:', error);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed');
    }
}

// Run the test
try {
    await testTenantPasswordLogin();
    console.log('Test completed successfully');
} catch (error) {
    console.error('Test failed:', error);
} finally {
    process.exit(0);
}
