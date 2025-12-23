import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const API_BASE = 'http://localhost:3031';

async function testTenantMessage() {
  try {
    console.log('🔐 Logging in as tenant...');
    
    // Login as tenant first
    const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: '2assb123tenant@gmail.com',
        password: '123456789'
      })
    });
    
    const loginResult = await loginResponse.json();
    if (!loginResponse.ok) {
      console.error('❌ Login failed:', loginResult);
      return;
    }
    
    const token = loginResult.data.token;
    console.log('✅ Tenant logged in successfully');
    
    // Send a message
    console.log('📤 Sending message from tenant...');
    const messageResponse = await fetch(`${API_BASE}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        message: 'Test message from tenant - should create notification',
        subject: 'Test Notification',
        role: 'tenant'
      })
    });
    
    const messageResult = await messageResponse.json();
    console.log('📤 Message response:', messageResponse.status, messageResult.status || messageResult.message);
    
    if (messageResponse.ok) {
      console.log('✅ Message sent successfully');
      
      // Wait a moment for notification to be created
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check notifications
      console.log('🔔 Checking notifications...');
      const notifResponse = await fetch(`${API_BASE}/api/notifications`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const notifications = await notifResponse.json();
      console.log('🔔 Notifications found:', notifications.data?.length || 0);
      
      if (notifications.data?.length > 0) {
        console.log('Latest notification:', {
          type: notifications.data[0].type,
          title: notifications.data[0].title,
          is_read: notifications.data[0].is_read,
          sender_name: notifications.data[0].sender_name
        });
      }
    } else {
      console.error('❌ Message failed:', messageResult);
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
}

testTenantMessage();