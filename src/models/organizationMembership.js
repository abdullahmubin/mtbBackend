import mongoose from "mongoose";

const membershipSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  organization_id: { type: Number, required: true, index: true },
  role: { type: String, default: "member" }, // e.g. admin, member, clientadmin
  status: { type: String, default: "active" }
}, { timestamps: true });

membershipSchema.index({ user_id: 1, organization_id: 1 }, { unique: true });

const OrganizationMembershipDB = mongoose.model("OrganizationMembership", membershipSchema);
export default OrganizationMembershipDB;
