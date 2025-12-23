import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const notifSchema = new mongoose.Schema({}, { strict: false });

mongoose.connect(process.env.connectionString).then(async () => {
  try {
    const Notifications = mongoose.model('notifications', notifSchema);
    
    const tenantOrg = 1759010804484;
    console.log('🔍 Checking recent notifications in organization:', tenantOrg);
    
    // Get recent notifications from the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const recentNotifications = await Notifications.find({
      organization_id: tenantOrg,
      created_at: { $gte: oneHourAgo }
    }).sort({ created_at: -1 }).limit(10).lean();
    
    console.log(`📋 Found ${recentNotifications.length} recent notifications:`);
    
    recentNotifications.forEach((notif, i) => {
      console.log(`  ${i+1}. Type: ${notif.type}, Title: "${notif.title}", Created: ${notif.created_at}`);
      console.log(`     Recipients: ${JSON.stringify(notif.recipients)}`);
      console.log(`     Source: ${notif.source ? JSON.stringify(notif.source) : 'N/A'}`);
      console.log('');
    });
    
    // Also check notification reads for the tenant
    const NotificationReads = mongoose.model('notification_reads', new mongoose.Schema({}, { strict: false }));
    const tenantUserId = 'tenant_1759010804484_1760277446462';
    
    const reads = await NotificationReads.find({
      user_id: tenantUserId,
      organization_id: tenantOrg
    }).sort({ read_at: -1 }).limit(5).lean();
    
    console.log(`📖 Recent notification reads for tenant (${reads.length} found):`);
    reads.forEach((read, i) => {
      console.log(`  ${i+1}. Notification: ${read.notification_id}, Read at: ${read.read_at}`);
    });
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}).catch(e => { 
  console.error('Connection error:', e.message); 
  process.exit(1); 
});