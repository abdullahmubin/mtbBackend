import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema({
  // Allow both ObjectId and Number types for _id
  _id: { type: mongoose.Schema.Types.Mixed, auto: true },
  organization_id: { type: Number, unique: true, required: true, index: true },
  name: { type: String, required: true, trim: true },
  ownerUserId: { type: String, required: true, index: true },
  customer_id: { type: String, index: true },
  plan: { type: String, default: 'starter' },
  status: { type: String, default: 'active' }
  ,
  // Whether scheduler automation is enabled for this organization
  schedulerEnabled: { type: Boolean, default: true, index: true }
}, { 
  timestamps: true,
  strict: false // Allow other fields that might be present
});

// Add a pre-save hook to ensure _id is set to organization_id for new documents
organizationSchema.pre('save', function(next) {
  if (this.isNew && this.organization_id && !this._id) {
    this._id = this.organization_id;
  }
  next();
});

organizationSchema.index({ ownerUserId: 1, organization_id: 1 });

const OrganizationDB = mongoose.model('Organizations', organizationSchema);
export default OrganizationDB;
