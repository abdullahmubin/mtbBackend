import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const API_BASE = 'http://localhost:3031';

async function testTenantTicketNotifications() {
  try {
    console.log('🎫 Testing tenant ticket notifications...\n');
    
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
    const userInfo = loginResult.data.userInfo;
    console.log('✅ Tenant logged in:', {
      email: userInfo.email,
      role: userInfo.role,
      tenant_id: userInfo.tenant_id,
      organization_id: userInfo.organization_id
    });
    
    // 1. Test: Create a ticket
    console.log('\n🎫 Creating a ticket...');
    const ticketResponse = await fetch(`${API_BASE}/api/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: 'Test Ticket Notification',
        description: 'This ticket should generate a notification for admins',
        priority: 'Medium'
      })
    });
    
    const ticketResult = await ticketResponse.json();
    console.log('Ticket response:', ticketResponse.status, ticketResult.status);
    
    if (!ticketResponse.ok) {
      console.error('❌ Ticket creation failed:', ticketResult);
      return;
    }
    
    const ticketId = ticketResult.data.id;
    console.log('✅ Ticket created with ID:', ticketId);
    
    // Wait a moment for notification processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 2. Test: Update the ticket
    console.log('\n📝 Updating the ticket...');
    const updateResponse = await fetch(`${API_BASE}/api/tickets/${ticketId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        status: 'In Progress',
        description: 'Updated: This ticket update should also generate a notification'
      })
    });
    
    const updateResult = await updateResponse.json();
    console.log('Ticket update response:', updateResponse.status, updateResult.status);
    
    if (updateResponse.ok) {
      console.log('✅ Ticket updated successfully');
    }
    
    // Wait a moment for notification processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 3. Test: Add a comment
    console.log('\n💬 Adding a comment to the ticket...');
    const commentResponse = await fetch(`${API_BASE}/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        body: 'This is a test comment that should generate notifications for admins'
      })
    });
    
    const commentResult = await commentResponse.json();
    console.log('Comment response:', commentResponse.status, commentResult.status);
    
    if (commentResponse.ok) {
      console.log('✅ Comment added successfully');
    }
    
    // Wait for notification processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 4. Check notifications created
    console.log('\n🔔 Checking notifications after ticket operations...');
    const notifResponse = await fetch(`${API_BASE}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const notifications = await notifResponse.json();
    console.log('Total notifications:', notifications.data?.length || 0);
    
    if (notifications.data?.length > 0) {
      console.log('\n📋 Recent ticket notifications:');
      const ticketNotifications = notifications.data
        .filter(n => n.type === 'ticket')
        .slice(0, 5);
      
      ticketNotifications.forEach((notif, i) => {
        console.log(`  ${i+1}. "${notif.title}" - Read: ${notif.is_read}, Created: ${new Date(notif.created_at).toLocaleString()}`);
      });
      
      if (ticketNotifications.length === 0) {
        console.log('  ❌ No ticket notifications found');
      }
    }
    
    // Check unread count
    const countResponse = await fetch(`${API_BASE}/api/notifications/unread-count`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const countResult = await countResponse.json();
    console.log('\n🔢 Unread count:', countResult.data?.total || 0);
    console.log('By type:', countResult.data?.byType || {});
    
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
}

testTenantTicketNotifications();