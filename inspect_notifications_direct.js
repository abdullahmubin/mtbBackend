import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGO_DB || 'tenant-portal';
const ORG_ID = process.env.ORG_ID || '1756056251034';

async function run(){
  const client = new MongoClient(MONGO);
  try{
    await client.connect();
    const db = client.db(DB_NAME);
    const coll = db.collection('notifications');
    const q = { organization_id: ORG_ID };
    // also try numeric match
    const orgNum = !isNaN(Number(ORG_ID)) ? Number(ORG_ID) : null;
    if(orgNum !== null) q.$or = [{ organization_id: ORG_ID }, { organization_id: orgNum }];
    const docs = await coll.find(q).sort({ created_at: -1 }).limit(20).toArray();
    console.log('Found', docs.length, 'notifications for org', ORG_ID);
    for(const d of docs){
      console.log('---');
      console.log('id:', d._id.toString());
      console.log('type:', d.type, 'title:', d.title, 'created_at:', d.created_at);
      console.log('recipients:', JSON.stringify(d.recipients));
      console.log('source:', d.source);
    }
  }catch(e){
    console.error('inspect err', e);
  }finally{ await client.close(); }
}
run();
