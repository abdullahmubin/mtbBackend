import OrganizationMembershipDB from "../models/organizationMembership.js";

export const enforceMembership = async (req, res, next) => {
  const userId = req.user._id;
  const orgId = req.organization_id;
  const membership = await OrganizationMembershipDB.findOne({ user_id: userId, organization_id: orgId, status: "active" });
  if (!membership) {
    return res.status(403).json({ message: "Forbidden: You are not a member of this organization." });
  }
  req.membership = membership;
  next();
};
