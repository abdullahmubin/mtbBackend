import mongoose from 'mongoose';

const reminderSchema = new mongoose.Schema({
  contractId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  organization_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  tenant_id: { type: String, required: false, index: true },
  channel: { type: String, enum: ['email','sms','inapp'], default: 'email' },
  templateId: { type: mongoose.Schema.Types.Mixed },
  sendAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ['scheduled','enqueued','sent','failed','cancelled'], default: 'scheduled' },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: null },
  jobId: { type: String, default: null }
}, { timestamps: true });

const ReminderDB = mongoose.model('Reminders', reminderSchema);
export default ReminderDB;
