import { Worker, QueueEvents } from 'bullmq';
import { createClient } from 'redis';
import dotenv from 'dotenv';
import ReminderDB from '../models/Reminder.js';
import * as contractsService from '../services/contractsService.js';
import TemplateDB from '../models/Template.js';
import ACTIONS from '../utils/activityActions.js';
import { renderTemplateString, buildContext } from '../utils/templateRenderer.js';
import nodemailer from 'nodemailer';

dotenv.config();
const connection = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
connection.on('error', (e)=>console.warn('Redis error', e && e.message));

const transporter = nodemailer.createTransport({
  jsonTransport: true // dev-friendly transport; override with SMTP/SendGrid in prod
});

function safeString(v){ return v==null ? '' : String(v); }

export async function processReminder(reminderId){
  const rem = await ReminderDB.findById(reminderId).exec();
  if(!rem) throw new Error('Reminder not found');
  if(rem.status === 'sent') return { ok: true, reason: 'already-sent' };

  const contract = await contractsService.getContractById(rem.contractId);
  const template = rem.templateId ? await TemplateDB.findById(rem.templateId).exec() : null;
  const context = buildContext({ contract: contract || {}, tenant: { name: 'Tenant' }, organization: {} });

  const subject = template ? renderTemplateString(template.subject || '', context) : `Reminder: ${safeString(contract && contract.title)}`;
  const html = template ? renderTemplateString(template.bodyHtml || '', context) : `<p>Your contract ${safeString(contract && contract.title)} is due.</p>`;
  const text = template ? renderTemplateString(template.bodyText || '', context) : `Your contract ${safeString(contract && contract.title)} is due.`;

  if(rem.channel === 'email'){
    const info = await transporter.sendMail({ from: process.env.EMAIL_FROM || 'noreply@example.com', to: (contract && contract.parties && contract.parties[0] && contract.parties[0].contact) || process.env.DEV_NOTIFICATION_EMAIL || 'dev@example.com', subject, html, text });
    rem.status = 'sent';
    rem.attempts = (rem.attempts || 0) + 1;
    rem.lastError = null;
    await rem.save();
    try{
      await contractsService.updateContract(rem.contractId, { $push: { audit: { action: ACTIONS.REMINDER_SENT, by: 'system', at: new Date(), meta: { reminderId: rem._id, info } } } });
    }catch(e){ console.warn('Failed to append audit', e && e.message); }
    return { ok: true, info };
  }
  throw new Error('Unsupported channel');
}

export const startRemindersWorker = () => {
  const worker = new Worker('reminders', async (job) => {
    const data = job.data || {};
    const reminderId = data.reminderId || job.name;
    return processReminder(reminderId);
  }, { connection });

  const events = new QueueEvents('reminders', { connection });
  events.on('failed', ({ jobId, failedReason }) => console.warn('Reminder job failed', jobId, failedReason));

  worker.on('error', err => console.error('Worker error', err && err.message));
  return worker;
};
