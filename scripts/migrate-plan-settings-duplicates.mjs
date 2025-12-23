#!/usr/bin/env node
/**
 * Migration: merge duplicate plan_settings documents that reference the same plan/id.
 *
 * Behavior:
 * - Groups documents by the canonical plan identifier (prefer `plan`, then `id`, then `_id`).
 * - If multiple documents exist for the same plan, pick a preferred target:
 *    1) a document whose string `_id` === plan (string) if present;
 *    2) otherwise the most recently updated document (prefers `updatedAt`/`updated_at`).
 * - Merge fields preferring values from the preferred target when conflicts,
 *   otherwise pull non-null values from other docs.
 * - Strip any fields that end with 'GiB' before saving.
 * - By default runs in dry-run mode; pass `--apply` to perform writes (update + delete).
 *
 * Usage:
 *   node migrate-plan-settings-duplicates.mjs [--mongo <uri>] [--apply]
 */

import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const backup = argv.includes('--backup');
const mongoArgIndex = argv.findIndex(a => a === '--mongo');
const mongoUri = (mongoArgIndex >= 0 && argv[mongoArgIndex + 1]) || process.env.MONGO_URL || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tenant-portal';

console.log('Migration: migrate-plan-settings-duplicates');
console.log('Mongo URI:', mongoUri);
console.log('Mode:', apply ? 'apply' : 'dry-run (no writes)');

try {
  const registryPath = path.resolve(__dirname, '../src/models/registry.js');
  // Import registry to get model factory (convert to file:// URL on Windows)
  const registryUrl = pathToFileURL(registryPath).href;
  const { getModel } = await import(registryUrl);

  await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  const PlanModel = getModel('plan_settings');

  // Load all plan settings docs
  const docs = await PlanModel.find({}).lean();
  if (!docs || docs.length === 0) {
    console.log('No plan_settings documents found. Exiting.');
    process.exit(0);
  }

  // Build map keyed by canonical plan key
  const groups = new Map();
  for (const d of docs) {
    const key = (d.plan || d.id || (typeof d._id === 'string' ? d._id : null) || '').toString();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }

  const duplicates = Array.from(groups.entries()).filter(([k, arr]) => arr.length > 1);
  if (duplicates.length === 0) {
    console.log('No duplicate plan documents found. Exiting.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`Found ${duplicates.length} plan keys with >1 documents. Preparing to merge.`);

  for (const [planKey, items] of duplicates) {
    console.log('\nPlan:', planKey, 'documents:', items.map(i => ({ _id: i._id, id: i.id, plan: i.plan, updatedAt: i.updatedAt || i.updated_at })).slice(0,20));

    // Pick preferred: 1) string _id === planKey, 2) newest updatedAt/updated_at
    let preferred = items.find(i => typeof i._id === 'string' && i._id === planKey) || null;
    if (!preferred) {
      preferred = items.reduce((best, cur) => {
        const bestTs = best?.updatedAt || best?.updated_at || 0;
        const curTs = cur?.updatedAt || cur?.updated_at || 0;
        return (curTs > bestTs) ? cur : best;
      }, items[0]);
    }

    console.log('Preferred target chosen _id=', preferred._id);

    // Merge logic: start from preferred, then copy missing non-null fields from others
    const merged = { ...(preferred || {}) };
    for (const other of items) {
      if (String(other._id) === String(preferred._id)) continue;
      for (const [k, v] of Object.entries(other)) {
        if (['_id','__v'].includes(k)) continue;
        // Skip GiB fields
        if (k.endsWith('GiB')) continue;
        // If preferred has no value (null/undefined/empty), take from other
        const prefVal = merged[k];
        if (prefVal === undefined || prefVal === null || prefVal === '') {
          merged[k] = v;
        }
      }
    }

    // Normalize canonical fields
    merged._id = typeof merged._id === 'string' ? merged._id : planKey;
    merged.plan = merged.plan || planKey;

    // Remove any lingering GiB fields (extra safety)
    Object.keys(merged).forEach(k => { if (k.endsWith('GiB')) delete merged[k]; });

    console.log('Merged doc preview (diff):');
    // Show changed keys
    const changed = {};
    const pref = preferred || {};
    for (const k of Object.keys(merged)) {
      const a = pref[k];
      const b = merged[k];
      if (JSON.stringify(a) !== JSON.stringify(b)) changed[k] = { from: a, to: b };
    }
    console.log(changed);

    if (apply) {
      // If backup mode enabled, copy duplicates to backup collection before applying changes
      if (backup) {
        const backupCollection = mongoose.connection.collection('plan_settings_migration_backup');
        const backupDocs = items.map(d => ({
          original_id: d._id,
          planKey,
          doc: d,
          migratedAt: new Date()
        }));
        if (backupDocs.length) {
          await backupCollection.insertMany(backupDocs);
          console.log('Backed up duplicate docs to collection plan_settings_migration_backup');
        }
      }
      // Apply update to preferred _id
      const updateQuery = { _id: preferred._id };
      // Replace doc fields but keep timestamps managed by mongoose (use $set)
      const safeMerged = { ...merged };
      delete safeMerged._id; // don't set _id via $set
      await PlanModel.updateOne(updateQuery, { $set: safeMerged }, { runValidators: true });
      console.log('Updated preferred doc', preferred._id);

      // Delete other docs
      const otherIds = items.filter(i => String(i._id) !== String(preferred._id)).map(i => i._id);
      if (otherIds.length) {
        await PlanModel.deleteMany({ _id: { $in: otherIds } });
        console.log('Deleted duplicate docs:', otherIds);
      }
    } else {
      console.log('(dry-run) would update _id=', preferred._id, 'and remove others:', items.filter(i=>String(i._id)!==String(preferred._id)).map(i=>i._id));
    }
  }

  console.log('\nMigration complete.');
  if (!apply) console.log('Run with --apply to perform the updates.');

  await mongoose.disconnect();
  process.exit(0);
} catch (err) {
  console.error('Migration failed:', err);
  try { await mongoose.disconnect(); } catch(e){}
  process.exit(2);
}
