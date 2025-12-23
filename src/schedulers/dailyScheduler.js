import ReminderDB from '../models/Reminder.js';
import ContractsDB from '../models/contracts.js';
import OrganizationDB from '../models/organizations.js';
import { enqueueReminder } from '../queues/remindersQueue.js';

/**
 * Daily scheduler: find contracts with expiry_date and create reminders
 * for configured windows (30d,14d,7d,1d) if they don't already exist.
 */
export async function runRemindersScheduler({ windows = [30,14,7,1], now = new Date() } = {}){
  const created = [];
  // Fetch all contracts with expiry_date in the future or near past (covering windows)
  const maxWindow = Math.max(...windows);
  const cutoff = new Date(now.getTime() + (maxWindow + 1) * 24 * 60 * 60 * 1000);
  const contracts = await ContractsDB.find({ expiry_date: { $lte: cutoff, $exists: true, $ne: null } }).exec();

  for(const c of contracts){
    // skip if organization's scheduler is disabled
    try{
      const org = await OrganizationDB.findOne({ _id: c.organization_id }).lean();
      if (org && org.schedulerEnabled === false) {
        // skip this contract
        continue;
      }
    }catch(e){ console.warn('Failed to check organization scheduler flag', e && e.message); }
    if(!c.expiry_date) continue;
    for(const daysBefore of windows){
      const sendAt = new Date(c.expiry_date.getTime() - daysBefore * 24 * 60 * 60 * 1000);
      // only schedule sendAt in the future (or very near past tolerance)
      if(sendAt.getTime() < now.getTime() - (60*60*1000)) continue; // skip if more than 1h in the past

      // avoid duplicates: same contractId, channel and sendAt
      const exists = await ReminderDB.findOne({ contractId: c._id, sendAt }).exec();
      if(exists) continue;

      const rem = await ReminderDB.create({ contractId: c._id, organization_id: c.organization_id, tenant_id: c.tenant_id, channel: 'email', templateId: null, sendAt, status: 'scheduled' });
      // enqueue delayed job (delay until sendAt)
      const delay = Math.max(0, sendAt.getTime() - Date.now());
      try{
        const job = await enqueueReminder({ reminderId: String(rem._id), delay, payload: { reminderId: String(rem._id) } });
        rem.jobId = job.id;
        rem.status = 'enqueued';
        await rem.save();
      }catch(e){
        // enqueue may fail if Redis not available; keep reminder as scheduled
        console.warn('Failed to enqueue reminder', e && e.message);
      }
      created.push(rem);
    }
  }

  return created;
}

export default { runRemindersScheduler };
