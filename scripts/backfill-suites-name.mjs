#!/usr/bin/env node
import mongoose from 'mongoose';
import 'dotenv/config';
import { getModel } from '../src/models/registry.js';

async function main(){
  const mongo = process.env.MONGO_URI || 'mongodb://localhost:27017/tenant-portal';
  console.log('Connecting to Mongo:', mongo);
  // parse CLI options
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 20000;

  // fail fast if Mongo is unreachable
  await mongoose.connect(mongo, {
    dbName: process.env.MONGO_DB || undefined,
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
  });

  try{
    const Suites = getModel('suites');
    console.log('Querying suites with missing name but have suite_number...');
    const query = { $and: [ { $or: [ { name: { $exists: false } }, { name: null }, { name: '' } ] }, { suite_number: { $exists: true, $ne: '' } } ] };
    const docs = await Suites.find(query).lean().limit(limit);
    console.log('Found', docs.length, `suites to ${dryRun ? 'preview-update' : 'update'} (limit=${limit})`);
    let updated = 0;
    for(const d of docs){
      try{
        const newName = d.suite_number;
        if(!newName) continue;
        if(dryRun){
          // just log what would be done in dry-run
          console.log('[dry-run] would set name for', d._id.toString(), '=>', newName);
          updated++;
        } else {
          await Suites.updateOne({ _id: d._id }, { $set: { name: newName, updated_at: new Date() } });
          updated++;
        }
      }catch(err){ console.error('Failed to update', d._id, err && err.message); }
    }
    console.log(`Backfill complete. ${dryRun ? 'Would update' : 'Updated'} ${updated} documents.`);
  }catch(err){
    console.error('Backfill failed:', err && err.stack || err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main().catch(err=>{ console.error(err); process.exit(1); });
