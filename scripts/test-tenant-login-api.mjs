// Script to test tenant login without starting the full server
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testTenantLogin() {
  try {
    console.log('Starting tenant login test...');
    
    // First, make sure the backend server is running
    // You can start it with: npm start (in the backend directory)
    
    // Determine the API URL (assuming default port 3001)
    const API_URL = process.env.API_URL || 'http://localhost:3001';
    console.log(`Using API URL: ${API_URL}`);
    
    // Attempt to log in as the tenant
    const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'sarah.williams@example.com',
        password: 'sarah.williams@example.com'
      })
    });
    
    const loginData = await loginResponse.json();
    
    if (loginResponse.ok) {
      console.log('✅ Tenant login successful!');
      console.log('Token received:', loginData.token ? 'Yes' : 'No');
      console.log('User Info:', loginData.userInfo);
      
      // Use the token to test fetching tenant data
      if (loginData.token) {
        console.log('\nTesting token with tenant profile endpoint...');
        const profileResponse = await fetch(`${API_URL}/api/tenants/profile`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${loginData.token}`
          }
        });
        
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          console.log('✅ Profile fetch successful!');
          console.log('Profile data:', profileData);
        } else {
          console.log('❌ Profile fetch failed:', profileResponse.status);
          try {
            const errorData = await profileResponse.json();
            console.log('Error details:', errorData);
          } catch (e) {
            console.log('Could not parse error response');
          }
        }
      }
    } else {
      console.log('❌ Tenant login failed:', loginResponse.status);
      console.log('Error details:', loginData);
    }
    
  } catch (error) {
    console.error('Error during test:', error.message);
  }
}

// Run the test
testTenantLogin();
