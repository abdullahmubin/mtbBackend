import { runRemindersScheduler } from '../schedulers/dailyScheduler.js';
import { createClient } from 'redis';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

import { Queue } from 'bullmq';
import logger from '../utils/logger.js';


export async function getDashboardStats(req, res, next) {
  const client = createClient({ url: REDIS_URL });
  await client.connect();
  try {
    const lastRun = await client.get('scheduler:last_run');
    const lastCreated = Number(await client.get('scheduler:last_created') || 0);
    const lastError = await client.get('scheduler:last_run_error');

    let queueCounts = {};
    try {
      const queue = new Queue('reminders', { connection: client });
      queueCounts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused');
      await queue.close();
    } catch (e) {
      logger.warn('Failed to retrieve queue stats', e && e.message);
    }

    await client.disconnect();
    return res.json({ success: true, scheduler: { lastRun, lastCreated, lastError }, queue: queueCounts });
  } catch (err) {
    try { await client.disconnect(); } catch (e) { /* ignore */ }
    return next(err);
  }
}


export async function runRemindersController(req, res, next){
  try{
    const created = await runRemindersScheduler();
    res.json({ success: true, created: created.length });
  }catch(err){ next(err); }
}

export async function getSchedulerStatsController(req, res, next){
  const client = createClient({ url: REDIS_URL });
  await client.connect();
  try{
    const lastRun = await client.get('scheduler:last_run');
    const lastCreated = await client.get('scheduler:last_created');
    const lastError = await client.get('scheduler:last_run_error');
    await client.disconnect();
    res.json({ success:true, lastRun, lastCreated: Number(lastCreated||0), lastError });
  }catch(err){ await client.disconnect(); next(err); }
}

export default { runRemindersController, getSchedulerStatsController, getDashboardStats };
