import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const API_BASE = 'http://localhost:3031';

async function testAdminSeesTenanMessage() {
  try {
    console.log('🔐 Logging in as admin in same organization...');
    
    // First check what admins exist for the tenant's organization
    const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: '2assb123@gmail.com', // This should be the admin for organization 1759010804484
        password: '123456789'
      })
    });
    
    const loginResult = await loginResponse.json();
    if (!loginResponse.ok) {
      console.log('❌ Admin login failed, trying alternative admin emails...');
      
      // Try other potential admin emails
      const adminEmails = [
        'admin@example.com',
        'manager@example.com', 
        'admin2@example.com'
      ];
      
      for (const email of adminEmails) {
        console.log(`🔄 Trying admin login with ${email}...`);
        const altLoginResponse = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            password: '123456789'
          })
        });
        
        if (altLoginResponse.ok) {
          const altLoginResult = await altLoginResponse.json();
          console.log(`✅ Logged in as ${email}, org: ${altLoginResult.data.userInfo.organization_id}`);
          break;
        }
      }
      
      return;
    }
    
    const token = loginResult.data.token;
    const adminOrg = loginResult.data.userInfo.organization_id;
    console.log(`✅ Admin logged in, organization: ${adminOrg}`);
    
    // Check notifications for admin
    console.log('🔔 Checking admin notifications...');
    const notifResponse = await fetch(`${API_BASE}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const notifications = await notifResponse.json();
    console.log('🔔 Admin notifications found:', notifications.data?.length || 0);
    
    if (notifications.data?.length > 0) {
      const messageNotifications = notifications.data.filter(n => 
        n.type === 'message' || (n.source && n.source.collection === 'messages')
      );
      
      console.log('📨 Message notifications for admin:', messageNotifications.length);
      messageNotifications.slice(0, 3).forEach((notif, i) => {
        console.log(`  ${i+1}. ${notif.title} (read: ${notif.is_read}, sender: ${notif.sender_name})`);
      });
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
}

testAdminSeesTenanMessage();