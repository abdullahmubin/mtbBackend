import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true, required: true },
  organization_id: { type: Number, index: true, required: true },
  tenant_id: { type: String, required: false },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  status: { type: String, enum: ['Open', 'In Progress', 'Resolved', 'Closed'], default: 'Open' },
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Low' },
  created_by_user_id: { type: String, required: true },
  assigned_to_user_id: { type: String },
  created_at: { type: Date },
  updated_at: { type: Date },
  images: [{
    data: Buffer,
    contentType: String,
    size: Number,
    originalName: String,
    caption: { type: String, default: '' },
    uploaded_at: { type: Date, default: Date.now }
  }]
}, { collection: 'tickets' });

ticketSchema.index({ organization_id: 1, updated_at: -1 });
ticketSchema.index({ status: 1, updated_at: -1 });

const TicketsDB = mongoose.model('Tickets', ticketSchema);
export default TicketsDB;
