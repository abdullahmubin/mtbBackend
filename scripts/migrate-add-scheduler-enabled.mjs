#!/usr/bin/env node
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import OrganizationDB from '../src/models/organizations.js';

const MONGO = process.env.MONGODB_URI || process.env.connectionString || 'mongodb://localhost:27017/receipt_generator';

const run = async () => {
  try{
    await mongoose.connect(MONGO, { dbName: process.env.DB_NAME || undefined });
    console.info('Connected to MongoDB for migration');
    const res = await OrganizationDB.updateMany({ $or: [ { schedulerEnabled: { $exists: false } }, { schedulerEnabled: null } ] }, { $set: { schedulerEnabled: true } });
    console.info('Migration result:', res);
    process.exit(0);
  }catch(e){
    console.error('Migration failed', e && e.message);
    process.exit(1);
  }
};

run();
