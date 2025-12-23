import models from '../models/index.js';
import { getModel } from '../models/registry.js';
import mongoose from 'mongoose';

/**
 * imageQuotaService
 * Helper functions to count images and enforce plan limits.
 */

const PlanSettings = getModel('plan_settings');
const Buildings = getModel('buildings');
const Suites = getModel('suites');
const Tickets = getModel('tickets');

async function getPlanForOrg(orgId) {
  // Try to find organization and its plan, fallback to 'starter'
  try {
    const org = await models.OrganizationDB.findOne({ organization_id: orgId }).lean();
    const planKey = (org?.plan || 'starter').toString().toLowerCase();

    // Debug: log organization & planKey so we can diagnose missing plan_settings
    try { console.debug('[imageQuota] getPlanForOrg org:', org, 'planKey:', planKey); } catch (e) {}

    // plan_settings collection historically uses mixed id shapes (string keys or plan fields)
    // Try several keys sequentially so we can log which one matches
    let plan = null;
    try {
      plan = await PlanSettings.findOne({ _id: planKey === 'hobbylist'? 'starter' : planKey }).lean();
      if (plan) { console.debug('[imageQuota] found plan by _id'); return plan; }
    } catch (e) { console.debug('[imageQuota] find _id failed', e); }

    try {
      plan = await PlanSettings.findOne({ plan: planKey === 'hobbylist'? 'starter' : planKey }).lean();
      if (plan) { console.debug('[imageQuota] found plan by plan field'); return plan; }
    } catch (e) { console.debug('[imageQuota] find plan field failed', e); }

    try {
      plan = await PlanSettings.findOne({ id: planKey === 'hobbylist'? 'starter' :planKey }).lean();
      if (plan) { console.debug('[imageQuota] found plan by id field'); return plan; }
    } catch (e) { console.debug('[imageQuota] find id field failed', e); }

    // As a last resort, log collection count to help debug
    try { const c = await PlanSettings.countDocuments(); console.debug('[imageQuota] plan_settings count:', c); } catch (e) {}
    return null;
  } catch (e) {
    return null;
  }
}

async function countBuildingImages(orgId) {
  // Count buildings that have a profile_image (treat one profile image per building)
  // Be tolerant of organization_id stored as number or string in different DBs
  const q = { $and: [ { 'profile_image.data': { $exists: true } }, { $or: [{ organization_id: orgId }, { organization_id: String(orgId) }] } ] };
  return await Buildings.countDocuments(q);
}

async function countFloorImages(orgId) {
  // Floors currently do not have image fields in schema in many setups. Try a generic check for profile_image
  const Floors = getModel('floors');
  // Count floors with profile_image; tolerant organization_id match
  const q = { $and: [ { 'profile_image.data': { $exists: true } }, { $or: [{ organization_id: orgId }, { organization_id: String(orgId) }] } ] };
  return await Floors.countDocuments(q);
}

async function countAllSuiteImages(orgId) {
  // Sum lengths of images arrays for all suites in the organization
  const match = { $or: [{ organization_id: orgId }, { organization_id: String(orgId) }] };
  const res = await Suites.aggregate([
    { $match: match },
    { $project: { n: { $size: { $ifNull: ['$images', []] } } } },
    { $group: { _id: null, total: { $sum: '$n' } } }
  ]);
  return (res[0] && res[0].total) || 0;
}

async function getSuiteImageCount(suiteId, orgId) {
  // Be tolerant of organization_id types and id/_id shapes
  // Avoid querying by _id with an invalid ObjectId string to prevent Mongoose cast errors.
  const orClauses = [{ id: suiteId }];
  if (typeof suiteId === 'string' && mongoose.Types.ObjectId.isValid(suiteId)) {
    orClauses.push({ _id: mongoose.Types.ObjectId(suiteId) });
  }
  // If suiteId is numeric-like, include numeric match as well
  const maybeNum = Number(suiteId);
  if (Number.isFinite(maybeNum)) orClauses.push({ id: maybeNum });

  const suite = await Suites.findOne({ $and: [ { $or: orClauses }, { $or: [{ organization_id: orgId }, { organization_id: String(orgId) }] } ] }).lean();
  if (!suite) return 0;
  return Array.isArray(suite.images) ? suite.images.length : 0;
}

async function countTicketImages(orgId) {
  // Sum lengths of images arrays for all tickets in the org
  const match = { $or: [{ organization_id: orgId }, { organization_id: String(orgId) }] };
  const res = await Tickets.aggregate([
    { $match: match },
    { $project: { n: { $size: { $ifNull: ['$images', []] } } } },
    { $group: { _id: null, total: { $sum: '$n' } } }
  ]);
  return (res[0] && res[0].total) || 0;
}

async function checkBuildingLimit(orgId, incomingCount = 1) {
  const plan = await getPlanForOrg(orgId);
  if (!plan || plan.buildingImageLimit === null || plan.buildingImageLimit === undefined) return { ok: true };
  const used = await countBuildingImages(orgId);
  const limit = Number(plan.buildingImageLimit);
  if (used + incomingCount > limit) return { ok: false, used, limit };
  return { ok: true, used, limit };
}

async function checkFloorLimit(orgId, incomingCount = 1) {
  const plan = await getPlanForOrg(orgId);
  if (!plan || plan.floorImageLimit === null || plan.floorImageLimit === undefined) return { ok: true };
  const used = await countFloorImages(orgId);
  const limit = Number(plan.floorImageLimit);
  if (used + incomingCount > limit) return { ok: false, used, limit };
  return { ok: true, used, limit };
}

async function checkSuiteLimit(suiteId, orgId, incomingCount = 1) {
  const plan = await getPlanForOrg(orgId);
  if (!plan || plan.suiteImageLimit === null || plan.suiteImageLimit === undefined) return { ok: true };
  const current = await getSuiteImageCount(suiteId, orgId);
  const limit = Number(plan.suiteImageLimit);
  if (current + incomingCount > limit) return { ok: false, current, limit };
  return { ok: true, current, limit };
}

async function checkTicketLimit(orgId, incomingCount = 1) {
  const plan = await getPlanForOrg(orgId);
  if (!plan || plan.ticketImageLimit === null || plan.ticketImageLimit === undefined) return { ok: true };
  const used = await countTicketImages(orgId);
  const limit = Number(plan.ticketImageLimit);
  if (used + incomingCount > limit) return { ok: false, used, limit };
  return { ok: true, used, limit };
}

export default {
  getPlanForOrg,
  countBuildingImages,
  countFloorImages,
  countAllSuiteImages,
  getSuiteImageCount,
  countTicketImages,
  checkBuildingLimit,
  checkFloorLimit,
  checkSuiteLimit,
  checkTicketLimit
};
