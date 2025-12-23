import mongoose from 'mongoose';

const planSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // Use String instead of ObjectId for plan names as IDs
    plan: { type: String, required: true },
    name: { type: String, required: true },
    tenantLimit: { type: Number, default: null },
    buildingLimit: { type: Number, default: null },
    floorLimit: { type: Number, default: null },
    suiteLimit: { type: Number, default: null },
    tenantDocumentLimit: { type: Number, default: null },
  // Image count limits for property images. Null === unlimited.
  // buildingImageLimit: total number of building images allowed across the org
  // floorImageLimit: total number of floor images allowed across the org
  // suiteImageLimit: per-suite maximum number of images
  buildingImageLimit: { type: Number, default: null },
  floorImageLimit: { type: Number, default: null },
  suiteImageLimit: { type: Number, default: null },
  // Ticket/issue attachment image limit (total per organization or per ticket depending on UI semantics)
  ticketImageLimit: { type: Number, default: null },
    price: { type: Number, default: null },
    yearly: { type: Number, default: null },
  emailQuota: { type: Number, default: null },
  smsQuota: { type: Number, default: null },
  tenantDirectoryEnabled: { type: Boolean, default: false },
  // Explicit automation feature flags
  emailAutomationEnabled: { type: Boolean, default: false },
  smsAutomationEnabled: { type: Boolean, default: false },
  contractAutomationEnabled: { type: Boolean, default: false }
  },
  { timestamps: true, collection: 'plan_settings' }
);

export default planSettingsSchema;
