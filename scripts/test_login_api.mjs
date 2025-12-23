import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const API_BASE = 'http://localhost:3031';

async function testLogin() {
  try {
    console.log('Testing tenant login...');
    
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: '2assb123tenant@gmail.com',
        password: '123456789'
      })
    });
    
    const result = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(result, null, 2));
    
    if (response.ok && result.token) {
      console.log('✅ Login successful!');
      console.log('User role:', result.userInfo?.role);
      console.log('User name:', result.userInfo?.name);
    } else {
      console.log('❌ Login failed');
    }
    
  } catch (e) {
    console.error('Error testing login:', e.message);
  }
}

testLogin();