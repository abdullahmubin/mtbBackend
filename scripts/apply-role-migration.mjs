import mongoose from 'mongoose';
import dotenv from 'dotenv';
import UserDB from '../src/models/user.js';
import models from '../src/models/index.js';
import { compareHasRole } from '../src/utils/index.js';

dotenv.config();

const MONGO = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/receipt_generator';

async function suggestRole(user) {
  if (user.role && typeof user.role === 'string' && user.role.length < 40) return user.role;
  if (user.role) {
    const isAdmin = await compareHasRole('sUp&perA#min', user.role);
    if (isAdmin) return 'admin';
  }
  const activeSub = await models.SubscriptionsDB.findOne({ userId: user._id, isActive: true });
  if (activeSub || user.plan) return 'clientadmin';
  return 'tenant';
}

async function run() {
  if (process.env.CONFIRM_APPLY !== '1') {
    console.error('To actually apply changes set CONFIRM_APPLY=1 in env. This protects against accidental runs.');
    process.exit(1);
  }

  await mongoose.connect(MONGO, { /* useNewUrlParser: true, useUnifiedTopology: true */ });
  console.log('Connected to DB');

  const users = await UserDB.find({ role: { $exists: true, $ne: null } }).lean();
  let changed = 0;
  for (const u of users) {
    const suggested = await suggestRole(u);
    const current = u.role || '';
    if (current !== suggested) {
      await UserDB.updateOne({ _id: u._id }, { $set: { role: suggested } });
      console.log('Updated', u.email, 'from', current, 'to', suggested);
      changed++;
    }
  }

  console.log('Migration complete. Updated', changed, 'users.');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
