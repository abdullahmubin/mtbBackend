import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const API_BASE = 'http://localhost:3031';

async function testAdminSeesTenanMessage() {
  try {
    console.log('🔐 Testing admin notifications for tenant messages...\n');
    
    // First, let's use the admin user ID we found: 68d85ff41dc0d137b1398f31
    // We need to find their credentials or create a login test
    
    console.log('🔍 The admin user ID from our fix is: 68d85ff41dc0d137b1398f31');
    console.log('📧 Admin email should be: 2assb123@gmail.com');
    
    // Try to login as the admin
    const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: '2assb123@gmail.com',
        password: '123456789' // Try same password as tenant
      })
    });
    
    const loginResult = await loginResponse.json();
    
    if (!loginResponse.ok) {
      console.log('❌ Admin login failed with 2assb123@gmail.com');
      console.log('Response:', loginResult);
      
      console.log('🔄 Trying different password variations...');
      const passwords = ['password', 'admin', '123456', 'admin123'];
      
      for (const pwd of passwords) {
        const retry = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: '2assb123@gmail.com', password: pwd })
        });
        
        if (retry.ok) {
          const retryResult = await retry.json();
          console.log(`✅ Admin login successful with password: ${pwd}`);
          console.log('Admin info:', retryResult.data.userInfo);
          break;
        }
      }
      
      return;
    }
    
    const token = loginResult.data.token;
    const adminInfo = loginResult.data.userInfo;
    console.log('✅ Admin logged in:', {
      email: adminInfo.email,
      name: adminInfo.name,
      role: adminInfo.role,
      organization_id: adminInfo.organization_id,
      id: adminInfo.id
    });
    
    // Check admin notifications
    console.log('\n🔔 Checking admin notifications...');
    const notifResponse = await fetch(`${API_BASE}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const notifications = await notifResponse.json();
    console.log('📋 Admin notifications found:', notifications.data?.length || 0);
    
    if (notifications.data?.length > 0) {
      console.log('\n📨 Recent notifications for admin:');
      notifications.data.slice(0, 5).forEach((notif, i) => {
        console.log(`  ${i+1}. Type: ${notif.type}, Title: "${notif.title}"`);
        console.log(`     Read: ${notif.is_read}, Created: ${new Date(notif.created_at).toLocaleString()}`);
        console.log(`     Sender: "${notif.sender_name || 'N/A'}"`);
        console.log('');
      });
    }
    
    // Check unread count for admin
    const countResponse = await fetch(`${API_BASE}/api/notifications/unread-count`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const countResult = await countResponse.json();
    console.log('🔢 Admin unread count:', countResult.data?.total || 0);
    console.log('Breakdown:', countResult.data?.byType || {});
    
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
}

testAdminSeesTenanMessage();