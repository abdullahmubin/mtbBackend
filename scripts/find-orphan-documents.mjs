#!/usr/bin/env node
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import models from '../src/models/index.js';

// Simple dry-run script to find documents missing tenant_id or organization_id
// Usage: node ./scripts/find-orphan-documents.mjs --out=./backend/output/orphan_documents.csv

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      args[k] = v === undefined ? true : v;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const outPath = args.out || path.resolve(process.cwd(), 'backend', 'output', 'orphan_documents.csv');
  const mongoUri = process.env.MONGO_URI || process.env.MONGO_INTEGRATION_URI || 'mongodb://localhost:27017/tenant_portal';

  console.log('Connecting to MongoDB:', mongoUri);
  await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    const Documents = models.DocumentsDB;
    if (!Documents) {
      console.error('Documents model not available from models registry. Aborting.');
      process.exit(2);
    }

    // Find records where tenant_id or organization_id are null/undefined/empty string
    const cursor = Documents.find({ $or: [ { tenant_id: { $in: [null, '', undefined] } }, { organization_id: { $in: [null, '', undefined] } } ] }).cursor();

    // Ensure output dir exists
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const out = fs.createWriteStream(outPath, { encoding: 'utf8' });
    out.write('id,fileName,tenant_id,organization_id,createdAt\n');

    let count = 0;
    for await (const doc of cursor) {
      const row = [
        String(doc._id),
        '"' + String((doc.fileName || doc.fileName || '')).replace(/"/g, '""') + '"',
        '"' + String(doc.tenant_id ?? '') + '"',
        '"' + String(doc.organization_id ?? '') + '"',
        (doc.createdAt ? new Date(doc.createdAt).toISOString() : '')
      ].join(',') + '\n';
      out.write(row);
      count++;
    }

    out.end();
    console.log(`Found ${count} orphaned document(s). CSV written to: ${outPath}`);
    if (count > 0) console.log('Review the CSV and run fixes manually or with a follow-up migration script.');
  } catch (err) {
    console.error('Error during migration dry-run:', err && err.message);
    process.exit(3);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
