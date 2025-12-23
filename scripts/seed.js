import fs from 'fs';
import path from 'path';
import url from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getModel, collections } from '../src/models/registry.js';
import TenantsDB from '../src/models/tenants.js';
import LeasesDB from '../src/models/leases.js';
import PaymentsDB from '../src/models/payments.js';
import TicketsDB from '../src/models/tickets.js';

dotenv.config();

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const strictMap = {
  tenants: TenantsDB,
  leases: LeasesDB,
  payments: PaymentsDB,
  tickets: TicketsDB,
};

const parseDate = (v) => (v ? new Date(v) : v);

function transform(collection, item) {
  const out = { ...item };
  // Normalize date strings to Date objects for strict models
  const dateKeys = ['created_at','updated_at','lease_start_date','lease_end_date','due_date','paid_date','last_payment_date','lease_start','lease_end'];
  for (const k of dateKeys) if (out[k]) out[k] = parseDate(out[k]);
  return out;
}

async function upsertCollection(name, items) {
  const Model = strictMap[name] || getModel(name);
  for (const it of items) {
    const doc = transform(name, it);
    if (name === 'users') {
      // Ensure unique userName to satisfy collection unique index (reuse email)
      if (!doc.userName && doc.email) doc.userName = doc.email;
      // Normalize password field if only password_hash exists (store as password)
      if (!doc.password && doc.password_hash) doc.password = doc.password_hash;
    }
    // Skip incompatible shapes for existing strict collections (e.g. documents expects binary)
    if (name === 'documents' && (!doc.fileName || !doc.document)) continue;
    if (doc.id == null) {
      await Model.create(doc);
    } else {
      await Model.updateOne({ id: doc.id }, { $set: doc }, { upsert: true });
    }
  }
  const count = await Model.countDocuments();
  console.log(`Seeded ${name}: ${count} documents`);
}

async function main() {
  const conn = process.env.connectionString;
  if (!conn) throw new Error('Missing connectionString in .env');
  await mongoose.connect(conn);

  const dataPath = path.resolve(__dirname, '..', '..', 'db.json');
  const raw = fs.readFileSync(dataPath, 'utf8');
  const json = JSON.parse(raw);

  for (const name of collections) {
    if (Array.isArray(json[name])) {
      await upsertCollection(name, json[name]);
    }
  }

  await mongoose.connection.close();
  console.log('Seeding complete');
}

main().catch(async (e) => {
  console.error('Seeding failed', e);
  try { await mongoose.connection.close(); } catch {}
  process.exit(1);
});
