#!/usr/bin/env node
import redisClient from '../src/utils/redisClient.js';

async function main(){
  const payload = {
    type: 'notification.created',
    record: {
      id: 'test-notif-' + Date.now(),
      organization_id: 1001,
      type: 'message',
      title: 'TEST: notification pipeline',
      created_at: new Date().toISOString()
    }
  };

  try{
    if(!redisClient) throw new Error('Redis client not available');
    // ensure the client is ready
    if(redisClient.isReady === false){
      console.log('Redis client not ready yet, attempting to connect...');
      try{ await redisClient.connect(); }catch(e){}
    }
    await redisClient.publish('notifications', JSON.stringify(payload));
    console.log('Published test notification to Redis:', payload.record.id);
    process.exit(0);
  }catch(e){
    console.error('Failed to publish test notification', e);
    process.exit(1);
  }
}

main();
