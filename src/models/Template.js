import mongoose from 'mongoose';

const templateSchema = new mongoose.Schema({
  organization_id: { type: mongoose.Schema.Types.Mixed, required: false },
  name: { type: String, required: true },
  channel: { type: String, enum: ['email','sms','inapp'], default: 'email' },
  subject: { type: String, default: '' },
  bodyHtml: { type: String, default: '' },
  bodyText: { type: String, default: '' },
  placeholders: [String],
  isDefault: { type: Boolean, default: false }
},{ timestamps: true });

const TemplateDB = mongoose.model('Templates', templateSchema);
export default TemplateDB;
