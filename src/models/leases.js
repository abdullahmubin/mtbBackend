import mongoose from 'mongoose';

const leaseSchema = new mongoose.Schema({
  id: { type: Number, unique: true, index: true, required: true },
  organization_id: { type: Number, index: true, required: true },
  tenant_id: { type: String, required: true },
  unit_id: { type: String },
  lease_start: { type: Date, required: true },
  lease_end: { type: Date, required: true },
  rent_amount: { type: Number, required: true },
  due_day: { type: Number, min: 1, max: 28 },
  grace_period_days: { type: Number, min: 0, max: 31 },
  late_fee_flat: { type: Number, default: 0 },
  late_fee_percent: { type: Number, default: 0 },
  security_deposit_amount: { type: Number },
  recurring_charges: [{ code: String, name: String, amount: Number, frequency: String }],
  status: { type: String, enum: ['Active', 'Expired', 'Pending', 'Terminated'], default: 'Active' },
  reason: { type: String },
  terminated_at: { type: Date },
  terminated_by: { type: String },
  created_at: { type: Date },
  updated_at: { type: Date }
}, { collection: 'leases' });

leaseSchema.index({ organization_id: 1, updated_at: -1 });
leaseSchema.index({ tenant_id: 1, updated_at: -1 });

const LeasesDB = mongoose.model('Leases', leaseSchema);
export default LeasesDB;
