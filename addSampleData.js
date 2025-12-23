import axios from 'axios';

async function addSampleData() {
  try {
    // Check if the API server is running
    const response = await axios.get('http://localhost:3030/api/health');
    console.log('Server status:', response.data);
    
    // Try to post messages
    const orgId = 1756051998621;
    
    // Create sample messages
    const messages = [
      {
        id: `msg_${orgId}_001`,
        organization_id: orgId,
        text: 'Welcome to your tenant portal! How can we help you today?',
        sender: 'Admin',
        role: 'admin',
        createdAt: new Date()
      },
      {
        id: `msg_${orgId}_002`,
        organization_id: orgId,
        text: 'I have a question about my lease agreement.',
        sender: 'Sample Tenant',
        role: 'tenant',
        createdAt: new Date(Date.now() + 1000 * 60 * 5) // 5 minutes later
      },
      {
        id: `msg_${orgId}_003`,
        organization_id: orgId,
        text: 'Of course! I have uploaded it to your documents section. Let me know if you need anything clarified.',
        sender: 'Admin',
        role: 'admin',
        createdAt: new Date(Date.now() + 1000 * 60 * 10) // 10 minutes later
      }
    ];
    
    // Create sample SMS messages
    const smsMessages = [
      {
        id: `sms_${orgId}_001`,
        organization_id: orgId,
        sender_id: `user_${orgId}_001`,
        recipient_id: `tenant_${orgId}_001`,
        message: 'Reminder: Your rent payment is due in 5 days.',
        is_read: true,
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3) // 3 days ago
      },
      {
        id: `sms_${orgId}_002`,
        organization_id: orgId,
        sender_id: `tenant_${orgId}_001`,
        recipient_id: `user_${orgId}_001`,
        message: 'Thanks for the reminder. I will make the payment tomorrow.',
        is_read: true,
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2) // 2 days ago
      }
    ];
    
    // Post messages via API
    console.log('Adding messages...');
    for (const message of messages) {
      const msgRes = await axios.post('http://localhost:3030/messages', message);
      console.log(`Added message ${message.id}: ${msgRes.status}`);
    }
    
    console.log('Adding SMS messages...');
    for (const sms of smsMessages) {
      const smsRes = await axios.post('http://localhost:3030/sms_messages', sms);
      console.log(`Added SMS message ${sms.id}: ${smsRes.status}`);
    }
    
    console.log('Sample data added successfully.');
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

addSampleData();
