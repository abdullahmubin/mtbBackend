import fetch from 'node-fetch';
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const API_BASE = process.env.API_BASE || 'http://localhost:3031';
const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGO_DB || 'tenant-portal';

async function run(){
  try{
    console.log('Logging in tenant...');
    const login = await fetch(API_BASE + '/api/auth/login', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ email:'tenant1@example.com', password:'password' }) });
    const jr = await login.json();
    if(!jr?.data?.token){ console.error('tenant login failed', jr); return; }
    const token = jr.data.token;
    console.log('Tenant token ok');

    console.log('Creating message...');
    const m = await fetch(API_BASE + '/api/messages', { method:'POST', headers:{ 'content-type':'application/json','authorization':'Bearer '+token }, body: JSON.stringify({ subject:'smoke-check', message:'hello from script' }) });
    const mr = await m.json();
    console.log('message created id:', mr?.data?._id || mr?.data?.id);

    // wait a second for notification creation
    await new Promise(r=>setTimeout(r,1000));

    console.log('Connecting to mongo to inspect notifications...');
    const client = new MongoClient(MONGO);
    await client.connect();
    const db = client.db(DB_NAME);
    const notif = await db.collection('notifications').find({ 'source.collection': 'messages' }).sort({ created_at: -1 }).limit(1).toArray();
    console.log('latest message notification doc:');
    console.log(JSON.stringify(notif[0], null, 2));
    await client.close();
  }catch(e){ console.error('err', e); }
}
run();
