import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod;

export async function startMemoryDb() {
  mongod = await MongoMemoryServer.create({ instance: { dbName: 'tenant_portal_test' } });
  const uri = mongod.getUri();
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  return uri;
}

export async function stopMemoryDb() {
  try {
    await mongoose.connection.db.dropDatabase();
  } catch (e) {
    // ignore
  }
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}
