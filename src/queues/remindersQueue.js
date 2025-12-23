import { Queue } from 'bullmq';
import { createClient } from 'redis';
import dotenv from 'dotenv';
dotenv.config();

const connection = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
connection.on('error', (e)=>console.warn('Redis connection err', e && e.message));

export const remindersQueue = new Queue('reminders', { connection });

export async function enqueueReminder({ reminderId, delay = 0, payload = {} }){
  const job = await remindersQueue.add(reminderId, payload, { delay, removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
  return job;
}
