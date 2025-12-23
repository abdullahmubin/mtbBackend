import mongoose from 'mongoose';
import dotenv from 'dotenv';
import UserDB from '../src/models/user.js';
import models from '../src/models/index.js';
import { compareHasRole } from '../src/utils/index.js';

dotenv.config();

const MONGO = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/receipt_generator';

async function suggestRole(user) {
  // If role already short plain string, keep
  if (user.role && typeof user.role === 'string' && user.role.length < 40) return user.role;
  // Check super admin
  if (user.role) {
    const isAdmin = await compareHasRole('sUp&perA#min', user.role);
    if (isAdmin) return 'admin';
  }
  // Active subscription or plan
  const activeSub = await models.SubscriptionsDB.findOne({ userId: user._id, isActive: true });
  if (activeSub || user.plan) return 'clientadmin';
  return 'tenant';
}

async function run() {
  await mongoose.connect(MONGO, { /* useNewUrlParser: true, useUnifiedTopology: true */ });
  console.log('Connected to DB');

  const users = await UserDB.find({ role: { $exists: true, $ne: null } }).lean().limit(1000);
  const preview = [];
  for (const u of users) {
    const current = u.role || '';
    const suggested = await suggestRole(u);
    if (current !== suggested) {
      preview.push({ id: u._id.toString(), email: u.email, currentRole: current, suggestedRole: suggested });
    } else if (typeof current === 'string' && (current.length > 40 || current.startsWith('$2b$') || current.startsWith('$2a$'))) {
      // suspicious but mapped to same value (unlikely)
      preview.push({ id: u._id.toString(), email: u.email, currentRole: current, suggestedRole: suggested });
    }
  }

  console.log(`Found ${preview.length} accounts with a role change suggestion (showing up to 1000 users).`);
  for (const p of preview) console.log(p);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
