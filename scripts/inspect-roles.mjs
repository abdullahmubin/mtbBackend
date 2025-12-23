import mongoose from 'mongoose';
import dotenv from 'dotenv';
import UserDB from '../src/models/user.js';

dotenv.config();

const MONGO = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/receipt_generator';

async function run() {
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to DB');

  const cursor = UserDB.find({ role: { $exists: true, $ne: null } }).cursor();
  let count = 0;
  for (let user = await cursor.next(); user != null; user = await cursor.next()) {
    const r = user.role;
    if (!r) continue;
    if (typeof r === 'string' && (r.length > 40 || r.startsWith('$2b$') || r.startsWith('$2a$') )) {
      console.log({ id: user._id.toString(), email: user.email, roleSample: r.substring(0,60) + (r.length>60? '...':'') });
      count++;
      if (count >= 200) break;
    }
  }

  console.log('Done. Found', count, 'suspicious role entries');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
