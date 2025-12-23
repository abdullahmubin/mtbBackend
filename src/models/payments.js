import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true, required: true },
  organization_id: { type: Number, index: true, required: true },
  // tenant IDs may be string (e.g., "tenant_1") or numeric depending on data source
  tenant_id: { type: mongoose.Schema.Types.Mixed },
  // lease IDs are typically numeric but allow mixed to support various backends
  lease_id: { type: mongoose.Schema.Types.Mixed },
  amount: { type: Number },
  due_date: { type: Date },
  paid_date: { type: Date },
  status: { type: String, enum: ['Paid', 'Overdue', 'Pending'], default: 'Pending' },
  payment_method: { type: String },
  method: { type: String },
  stripe_payment_intent_id: { type: String }, // Stripe Payment Intent ID
  stripe_session_id: { type: String }, // Stripe Checkout Session ID (if using)
  created_at: { type: Date },
  updated_at: { type: Date }
}, { collection: 'payments' });

paymentSchema.index({ organization_id: 1, updated_at: -1 });
paymentSchema.index({ tenant_id: 1, updated_at: -1 });
paymentSchema.index({ lease_id: 1, updated_at: -1 });

const PaymentsDB = mongoose.model('Payments', paymentSchema);
export default PaymentsDB;
