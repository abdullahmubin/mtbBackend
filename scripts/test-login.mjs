// Test tenant login
import fetch from 'node-fetch';

// Helper function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testTenantLogin() {
  try {
    console.log('Waiting for server to be ready...');
    await wait(5000); // Wait 5 seconds for server to be fully ready
    
    console.log('Testing tenant login...');
    
    // Try port 3031 which the server is running on
    const response = await fetch('http://localhost:3031/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'sarah.williams@example.com',
        password: 'sarah.williams@example.com'
      })
    });
    
    const result = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(result, null, 2));
    
    if (response.status === 200 && result.data?.token) {
      console.log('✅ Login successful!');
      console.log('Token:', result.data.token.substring(0, 20) + '...');
      
      if (result.data.userInfo) {
        console.log('User info:');
        console.log('- Name:', result.data.userInfo.name);
        console.log('- Email:', result.data.userInfo.email);
        console.log('- Role:', result.data.userInfo.role);
        console.log('- Organization ID:', result.data.userInfo.organization_id);
      }
    } else {
      console.log('❌ Login failed');
    }
  } catch (error) {
    console.error('Error testing login:', error);
  }
}

testTenantLogin();
