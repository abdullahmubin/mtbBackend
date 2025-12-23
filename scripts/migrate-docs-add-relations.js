#!/usr/bin/env node
/**
 * Migration: migrate existing documents to add tenant_id and organization_id where missing.
 * Usage:
 *  node migrate-docs-add-relations.js --dry-run
 *  node migrate-docs-add-relations.js --apply --org=1
 *
 * The script performs best-effort inference for tenant_id based on uploader_user_id -> Tenants mapping.
 * For organization_id it will set the provided --org value if passed when applying; otherwise it will only report.
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO = process.env.connectionString || process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO) {
  console.error('No Mongo connection string found in backend/.env (connectionString).');
  process.exit(1);
}

import models from '../src/models/index.js';

function parseArgs() {
  const out = { dryRun: true, apply: false, org: null };
  for (const a of process.argv.slice(2)) {
    if (a === '--dry-run') { out.dryRun = true; out.apply = false; }
    else if (a === '--apply') { out.dryRun = false; out.apply = true; }
    else if (a.startsWith('--org=')) { out.org = a.split('=')[1]; }
    else if (a === '--help' || a === '-h') { out.help = true; }
  }
  return out;
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log('Usage: node migrate-docs-add-relations.js [--dry-run|--apply] [--org=ORG_ID]');
    process.exit(0);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO, { dbName: 'test', // keep default if not provided in URI
    useNewUrlParser: true, useUnifiedTopology: true });

  const Docs = models.DocumentsDB;
  const Tenants = models.TenantsDB;

  // Find documents missing tenant_id or organization_id
  const query = { $or: [ { tenant_id: { $exists: false } }, { organization_id: { $exists: false } }, { tenant_id: null }, { organization_id: null } ] };
  const docs = await Docs.find(query).lean().exec();
  console.log(`Found ${docs.length} document(s) missing tenant_id and/or organization_id`);

  const report = [];

  for (const d of docs) {
    const item = { _id: d._id.toString(), fileName: d.fileName, createdAt: d.createdAt, inferred: {} };

    // Try to infer tenant from uploader_user_id -> Tenants where tenant has a user mapping (best-effort)
    if (d.uploader_user_id) {
      // Some tenants may store user ids in other collections; try to find a tenant with matching id fields
      const t = await Tenants.findOne({ $or: [ { id: d.uploader_user_id }, { _id: d.uploader_user_id }, { user_id: d.uploader_user_id } ] }).lean();
      if (t) {
        item.inferred.tenant_id = t.id || t._id;
      }
    }

    // If tenant_id present in filename pattern (common practice), attempt to parse it
    if (!item.inferred.tenant_id && d.fileName) {
      const m = d.fileName.match(/tenant[_-]?(\d{1,6})/i);
      if (m) item.inferred.tenant_id = m[1];
    }

    // Decide org assignment only if provided via --org when applying
    if (args.org) item.inferred.organization_id = args.org;

    report.push(item);
  }

  // Print report summary
  for (const r of report) {
    console.log(`- ${r._id} ${r.fileName} createdAt=${r.createdAt} -> inferred: ${JSON.stringify(r.inferred)}`);
  }

  if (args.apply) {
    console.log('Applying inferred updates...');
    for (const r of report) {
      const update = {};
      if (r.inferred.tenant_id) update.tenant_id = String(r.inferred.tenant_id);
      if (r.inferred.organization_id) update.organization_id = isNaN(Number(r.inferred.organization_id)) ? r.inferred.organization_id : Number(r.inferred.organization_id);
      if (Object.keys(update).length) {
        await Docs.updateOne({ _id: r._id }, { $set: update });
        console.log(`Updated ${r._id} -> ${JSON.stringify(update)}`);
      } else {
        console.log(`Skipping ${r._id} (no inferred values)`);
      }
    }
  } else {
    console.log('Dry-run complete. Rerun with --apply --org=ORG_ID to write organization_id and inferred tenant_id where found.');
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(2); });
