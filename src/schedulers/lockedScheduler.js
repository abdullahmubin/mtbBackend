import { createClient } from 'redis';
import { runRemindersScheduler } from './dailyScheduler.js';
import logger from '../utils/logger.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const LOCK_KEY = 'scheduler:leader_lock';
const LOCK_TTL = 1000 * 60 * 60; // 1 hour
const LOCK_RENEW_INTERVAL = 30 * 1000; // 30s

// Safety guard: do not run scheduler unless explicitly enabled.
// This prevents accidental scheduler runs when the web server starts.
// To enable the scheduler set DISABLE_SCHEDULER to 'false' or set ENABLE_SCHEDULER='true'.
const schedulerDisabled = (process.env.DISABLE_SCHEDULER || 'true') !== 'false' && !(process.env.ENABLE_SCHEDULER === 'true');

// Use Redlock when available for robust distributed locking with automatic safety guarantees.
// If Redlock is not installed or fails to initialize, fall back to the previous SET NX PX approach.
async function createRedisClient(){
  const client = createClient({ url: REDIS_URL });
  client.on('error', (e)=> logger.warn('Redis error for scheduler lock', e && e.message));
  await client.connect();
  return client;
}

export async function runLockedScheduler(){
  if (schedulerDisabled) {
    logger.info('Scheduler disabled via DISABLE_SCHEDULER/ENABLE_SCHEDULER env vars; skipping runLockedScheduler');
    return { acquired: false, skipped: true };
  }
  const client = await createRedisClient();
  let lock = null;
  let useRedlock = false;
  let extender;

  try{
    // Try to load redlock dynamically so the app still works if dependency isn't present.
    let RedlockModule;
    try{
      RedlockModule = await import('redlock');
    }catch(e){
      logger.warn('Redlock module not available, falling back to simple SET NX lock', e && e.message);
    }

    if(RedlockModule){
      const Redlock = RedlockModule.default || RedlockModule;
      // redlock expects an array of clients
      const redlock = new Redlock([client], { retryCount: 0, automaticExtensionThreshold: 500 });
      try{
        lock = await redlock.acquire([LOCK_KEY], LOCK_TTL);
        useRedlock = true;
        logger.info('Acquired redlock for scheduler');

        // start periodic renewal using Redlock's extend
        extender = setInterval(async () => {
          try{
            if(!lock) return;
            lock = await lock.extend(LOCK_TTL);
            logger.debug('Redlock extended for scheduler');
          }catch(e){
            logger.warn('Failed to extend redlock', e && e.message);
            clearInterval(extender);
          }
        }, LOCK_RENEW_INTERVAL);
      }catch(e){
        logger.info('Could not acquire redlock - another instance likely holds it');
      }
    }

    // Fallback: if we didn't get a redlock, try plain SET NX PX and manual pexpire renewal
    if(!useRedlock){
      const res = await client.set(LOCK_KEY, String(process.pid), { NX: true, PX: LOCK_TTL });
      if(res !== 'OK'){
        logger.info('Another scheduler instance holds the simple lock; exiting');
        await client.disconnect();
        return { acquired: false };
      }

      extender = setInterval(async () => {
        try{
          const current = await client.get(LOCK_KEY);
          if(String(current) === String(process.pid)){
            await client.pexpire(LOCK_KEY, LOCK_TTL);
            logger.debug('Simple lock extended');
          } else {
            logger.warn('Simple lock value changed, stopping extender');
            clearInterval(extender);
          }
        }catch(e){ logger.warn('Failed to extend simple lock', e && e.message); }
      }, LOCK_RENEW_INTERVAL);
    }

    // If we reached here we hold a lock of some form
    logger.info('Scheduler lock acquired; running reminders scheduler');
    const created = await runRemindersScheduler();
    logger.info(`Scheduler created ${created.length} reminders`);

    // persist last run info in Redis for monitoring
    try{
      await client.set('scheduler:last_run', new Date().toISOString());
      await client.set('scheduler:last_created', String(created.length));
    }catch(e){ logger.warn('Failed to persist scheduler metrics', e && e.message); }

    // cleanup
    try{ if(extender) clearInterval(extender); }catch(e){}
    try{
      if(useRedlock && lock){ await lock.release(); logger.info('Redlock released'); }
      else { await client.del(LOCK_KEY); }
    }catch(e){ logger.warn('Failed to release scheduler lock', e && e.message); }
    await client.disconnect();
    return { acquired:true, created: created.length };
  }catch(err){
    logger.error('Scheduler run failed', err && err.message);
    try{ if(extender) clearInterval(extender); }catch(e){}
    try{ await client.set('scheduler:last_run_error', String(err && err.message || 'unknown')); }catch(e){}
    try{
      if(lock && useRedlock){ await lock.release(); }
      else { await client.del(LOCK_KEY); }
    }catch(e){ logger.warn('Failed to release lock after error', e && e.message); }
    await client.disconnect();
    throw err;
  }
}

export default runLockedScheduler;
