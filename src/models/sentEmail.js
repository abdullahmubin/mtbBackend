import mongoose from 'mongoose';

const sentEmailSchema = new mongoose.Schema({
  messageId: { type: String, index: true },
  organization_id: { type: mongoose.Schema.Types.Mixed, index: true },
  to: { type: [String], required: true, index: true },
  from: { type: String },
  subject: { type: String },
  html: { type: String },
  status: { type: String, default: 'sent' },
  providerResponse: { type: mongoose.Schema.Types.Mixed },
  error: { type: mongoose.Schema.Types.Mixed },
  relatedModel: { type: String },
  relatedId: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true, collection: 'sent_emails' });

export default mongoose.model('SentEmail', sentEmailSchema);
