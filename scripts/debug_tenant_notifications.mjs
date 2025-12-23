import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const API_BASE = 'http://localhost:3031';

async function debugTenantNotifications() {
  try {
    console.log('🔐 Testing tenant message notifications...\n');
    
    // Login as tenant
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
    const userInfo = loginResult.data.userInfo;
    console.log('✅ Tenant logged in:', {
      email: userInfo.email,
      name: userInfo.name,
      role: userInfo.role,
      tenant_id: userInfo.tenant_id,
      organization_id: userInfo.organization_id
    });
    
    // Check current notifications BEFORE sending message
    console.log('\n📋 Checking notifications BEFORE sending message...');
    let notifResponse = await fetch(`${API_BASE}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    let notifications = await notifResponse.json();
    console.log('Notifications before:', notifications.data?.length || 0);
    
    // Check unread count BEFORE
    let countResponse = await fetch(`${API_BASE}/api/notifications/unread-count`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    let countResult = await countResponse.json();
    console.log('Unread count before:', countResult.data?.total || 0);
    
    // Send a test message
    console.log('\n📤 Sending test message from tenant...');
    const messageResponse = await fetch(`${API_BASE}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        message: `Debug test message ${Date.now()}`,
        subject: 'Debug Test',
        role: 'tenant'
      })
    });
    
    const messageResult = await messageResponse.json();
    console.log('Message response:', messageResponse.status, messageResult.status);
    
    if (!messageResponse.ok) {
      console.error('❌ Message failed:', messageResult);
      return;
    }
    
    // Wait a moment for notification to be processed
    console.log('⏳ Waiting for notification to be processed...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check notifications AFTER sending message
    console.log('\n📋 Checking notifications AFTER sending message...');
    notifResponse = await fetch(`${API_BASE}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    notifications = await notifResponse.json();
    console.log('Notifications after:', notifications.data?.length || 0);
    
    if (notifications.data?.length > 0) {
      console.log('\n🔍 Latest notifications:');
      notifications.data.slice(0, 3).forEach((notif, i) => {
        console.log(`  ${i+1}. Type: ${notif.type}, Title: "${notif.title}", Read: ${notif.is_read}, Sender: "${notif.sender_name || 'N/A'}"`);
      });
    }
    
    // Check unread count AFTER
    countResponse = await fetch(`${API_BASE}/api/notifications/unread-count`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    countResult = await countResponse.json();
    console.log('\n🔢 Unread count after:', countResult.data?.total || 0);
    console.log('Unread breakdown:', countResult.data?.byType || {});
    
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
}

debugTenantNotifications();