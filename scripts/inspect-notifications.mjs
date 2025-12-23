import databaseManager from '../src/config/database.js';
import mongoose from 'mongoose';

(async function(){
  try{
    await databaseManager.connect();
    const db = mongoose.connection.db;
    const ticketId = 1756553120723;
    console.log('Searching notifications for ticket id', ticketId);
    const q = { $or: [ { 'meta.ticket_id': ticketId }, { title: { $regex: String(ticketId) } }, { 'source.id': ticketId } ] };
    const docs = await db.collection('notifications').find(q).sort({ created_at: -1 }).limit(50).toArray();
    console.log('Found', docs.length, 'notifications');
    for(const d of docs){
      console.log('---');
      console.log('id:', d._id.toString());
      console.log('created_at:', d.created_at);
      console.log('title:', d.title);
      console.log('body:', d.body);
      console.log('recipients:', JSON.stringify(d.recipients));
      console.log('meta.ticket_id:', d.meta && d.meta.ticket_id);
    }
    process.exit(0);
  }catch(e){ console.error('err', e); process.exit(1); }
})();
