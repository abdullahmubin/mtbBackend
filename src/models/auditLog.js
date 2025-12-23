import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  organization_id: { type: Number, required: true },
  action: { type: String, required: true }, // e.g. CREATE, UPDATE, DELETE
  resource: { type: String, required: true }, // e.g. Tenant, Lease
  resource_id: { type: String },
  details: { type: Object },
  timestamp: { type: Date, default: Date.now }
});

const AuditLogDB = mongoose.model("AuditLog", auditLogSchema);
export default AuditLogDB;
