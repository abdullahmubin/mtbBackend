#!/usr/bin/env node
import dotenv from 'dotenv';
import { startRemindersWorker } from './remindersWorker.js';

dotenv.config();

const run = async () => {
  try {
    const worker = startRemindersWorker();
    console.info('Reminders worker runner started');

    const shutdown = async () => {
      try {
        console.info('Shutting down worker...');
        if (worker && typeof worker.close === 'function') await worker.close();
      } catch (e) { console.error('Error closing worker', e && e.message); }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep the process alive
    // eslint-disable-next-line no-constant-condition
    await new Promise(() => {});
  } catch (err) {
    console.error('Failed to start reminders worker runner', err && err.message);
    process.exit(1);
  }
};

run();
