import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true, required: true },
  organization_id: { type: Number, index: true, required: true },
  first_name: { type: String, required: true, trim: true },
  last_name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  building_id: { type: String },
  floor_id: { type: String },
  suite_id: { type: String },
  // profile image stored as Buffer in DB (optional)
  profile_image: {
    data: { type: Buffer, required: false },
    contentType: { type: String, required: false },
    size: { type: Number, required: false },
    uploaded_at: { type: Date, required: false }
  },
  lease_start_date: { type: Date },
  lease_end_date: { type: Date },
  status: { type: String, enum: ['Active', 'Pending', 'Vacated', 'Expiring Soon'], default: 'Active' },
  rent_due: { type: Number, default: 0 },
  rent_paid: { type: Number, default: 0 },
  last_payment_date: { type: Date },
  balance: { type: Number, default: 0 },
  created_at: { type: Date },
  updated_at: { type: Date },
  emergency_contact_name: { type: String },
  emergency_contact_phone: { type: String },
  preferred_contact: { type: String },
  sms_opt_in: { type: Boolean, default: false },
  has_portal_access: { type: Boolean, default: false },
  password: { type: String },
  password_set: { type: Boolean, default: false }
  ,
  // Additional optional fields: billing and metadata
  billing_address: { type: String },
  secondary_email: { type: String, lowercase: true, trim: true },
  occupants_count: { type: Number, default: 0 },
  guarantor_name: { type: String },
  guarantor_phone: { type: String },
  parking_spot: { type: String },
  tags: { type: [String], default: [] },
  custom_metadata: { type: mongoose.Schema.Types.Mixed },
  created_by: { type: String },
  updated_by: { type: String }
}, { collection: 'tenants' });

tenantSchema.index({ organization_id: 1, updated_at: -1 });

const TenantsDB = mongoose.model('Tenants', tenantSchema);
export default TenantsDB;
