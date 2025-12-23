import { getModel } from '../models/registry.js';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';

// Helper to construct Mongo $or match clauses for suite keys (handles string/number storage)
export function buildSuiteMatches(rawKey) {
  const suiteKeyStr = String(rawKey).trim();
  const suiteKeyNum = Number(rawKey);
  const suiteMatches = [ { name: suiteKeyStr }, { suite_number: suiteKeyStr } ];
  if (Number.isFinite(suiteKeyNum)) suiteMatches.push({ suite_number: suiteKeyNum });
  return suiteMatches;
}

export function makeService(collection) {
  const Model = getModel(collection);
  const parseId = (id) => {
    // Preserve strings like 'free', but convert numeric-like strings to Number
    if (id === null || id === undefined) return id;
    if (typeof id === 'number') return id;
    const n = Number(id);
    return Number.isFinite(n) && String(n) === String(id).trim() ? n : id;
  };
  return {
    list: async (filter = {}, { limit = 100, skip = 0, sort = { updatedAt: -1 } } = {}) => {
      return Model.find(filter).sort(sort).skip(skip).limit(limit).lean();
    },
    getById: async (id) => {
      return Model.findOne({ id: parseId(id) }).lean();
    },
    // New method that includes organization_id filtering
    getByIdAndOrgId: async (id, organization_id) => {
      const parsed = parseId(id);
      // Try the common case: documents that store a numeric/string `id` field
      let found = await Model.findOne({ id: parsed, organization_id }).lean();
      if (found) return found;
      // Special-case organizations: allow lookup by _id or organization_id even if the
      // request-scoped org id (req.organization_id) isn't present or doesn't match.
      if (collection === 'organizations') {
        try {
          // Try matching by _id or organization_id directly
          const orQuery = { $or: [ { _id: parsed }, { organization_id: parsed }, { id: parsed } ] };
          found = await Model.findOne(orQuery).lean();
          if (found) return found;
        } catch (err) { /* ignore */ }
      }
      // Some collections (notably `organizations`) store identifiers on `organization_id` or _id.
      // Only attempt the organization_id fallback for the `organizations` collection to avoid
      // accidentally matching other documents (e.g. suites) when `parsed` happens to equal
      // an organization id. Matching by organization_id here caused images to be saved to the
      // wrong suite when the incoming id failed to find a direct match.
      if (collection === 'organizations') {
        try {
          found = await Model.findOne({ organization_id: parsed }).lean();
          if (found && String(found.organization_id) === String(parsed)) return found;
        } catch (err) { /* ignore */ }
      }
      // Last-resort: try matching by raw _id (string/ObjectId)
      try {
        const mongoose = await import('mongoose');
        if (typeof parsed === 'string' && mongoose.Types.ObjectId.isValid(parsed)) {
          // For organizations, allow matching by _id without the org filter as a fallback
          if (collection === 'organizations') {
            const obj = await Model.findOne({ _id: mongoose.Types.ObjectId(parsed) }).lean();
            if (obj) return obj;
          }
          const obj = await Model.findOne({ _id: mongoose.Types.ObjectId(parsed), organization_id }).lean();
          if (obj) return obj;
        }
      } catch (err) { /* ignore */ }
      return null;
    },
    create: async (data) => {
      // Defensive: do not allow creating suites without a floor_id. Controllers should enforce this,
      // but internal scripts may call the service directly; protect the DB here as well.
      if (collection === 'suites' && (!data || !data.floor_id)) {
        throw new Error('floor_id is required to create a suite');
      }
      // Prevent duplicates for certain collections by checking for an existing
      // resource with the same canonical keys (scoped to organization).
      // This is a pragmatic, code-level safeguard to avoid duplicate floors
      // and suites being created by concurrent or repeated client requests.
      try {
        if (collection === 'floors' && data && data.organization_id != null && data.building_id != null && data.floor_number != null) {
          const found = await Model.findOne({ organization_id: data.organization_id, building_id: data.building_id, floor_number: data.floor_number }).lean();
          if (found) return { __duplicate: true, record: found };
        }

        if (collection === 'buildings' && data && data.organization_id != null && data.name != null) {
          const found = await Model.findOne({ organization_id: data.organization_id, name: String(data.name).trim() }).lean();
          if (found) return { __duplicate: true, record: found };
        }

        if (collection === 'suites' && data && data.organization_id != null && data.floor_id != null && (data.suite_number != null || data.name != null)) {
          const rawKey = data.suite_number != null ? data.suite_number : data.name;
          const suiteMatches = buildSuiteMatches(rawKey);
          const found = await Model.findOne({
            organization_id: data.organization_id,
            floor_id: data.floor_id,
            $or: suiteMatches
          }).lean();
          if (found) return { __duplicate: true, record: found };
        }
      } catch (err) {
        // If the lookup fails for any reason, log and continue to create to avoid blocking functionality.
        // The logger may not be available in this module; swallow silently to keep behavior predictable.
      }
      // upsert by id if provided; else let Mongo _id handle identity
      if (data && data.id != null) {
        await Model.updateOne({ id: data.id }, { $set: data }, { upsert: true });
        return Model.findOne({ id: data.id }).lean();
      }
      const doc = await Model.create(data);
      return doc.toObject();
    },
    update: async (id, data) => {
      const parsed = parseId(id);
      await Model.updateOne({ id: parsed }, { $set: data }, { upsert: false });
      return Model.findOne({ id: parsed }).lean();
    },
    // New method that includes organization_id filtering for updates
    updateWithOrgId: async (id, data, organization_id) => {
      const parsed = parseId(id);
      // First check if the record exists and belongs to the organization
      let existing = await Model.findOne({ id: parsed, organization_id }).lean();
      if (!existing) {
        // Organizations are sometimes stored using `organization_id` instead of an `id` field.
        // Try matching by organization_id === parsed as a fallback only for organizations collection.
        if (collection === 'organizations') {
          try {
            existing = await Model.findOne({ organization_id: parsed }).lean();
          } catch (err) { existing = null; }
        }
      }
      if (!existing) {
        // Also try matching by raw _id when supplied id looks like an ObjectId
        try {
          const mongoose = await import('mongoose');
          if (typeof parsed === 'string' && mongoose.Types.ObjectId.isValid(parsed)) {
            // For organizations, try matching _id without org filter
            if (collection === 'organizations') {
              existing = await Model.findOne({ _id: mongoose.Types.ObjectId(parsed) }).lean();
            } else {
              existing = await Model.findOne({ _id: mongoose.Types.ObjectId(parsed), organization_id }).lean();
            }
          }
        } catch (err) { /* ignore */ }
      }
      if (!existing) return null;
      // Prevent updates that would create duplicates for floors/suites
      try {
        if (collection === 'floors' && data && data.floor_number != null) {
          // If changing floor_number (or building_id), ensure no other floor with same keys exists
          const targetBuildingId = data.building_id != null ? data.building_id : existing.building_id;
          const targetFloorNumber = data.floor_number;
          const dup = await Model.findOne({ organization_id, building_id: targetBuildingId, floor_number: targetFloorNumber, _id: { $ne: existing._id } }).lean();
          if (dup) return { __duplicate: true, record: dup }; // Return the existing conflicting record instead of creating a duplicate
        }

        if (collection === 'buildings' && data && data.name != null) {
          const dup = await Model.findOne({ organization_id, name: String(data.name).trim(), _id: { $ne: existing._id } }).lean();
          if (dup) return { __duplicate: true, record: dup };
        }

        if (collection === 'suites' && data && (data.suite_number != null || data.name != null || data.floor_id != null)) {
          const targetFloorId = data.floor_id != null ? data.floor_id : existing.floor_id;
          const rawKey = data.suite_number != null ? data.suite_number : (data.name != null ? data.name : existing.suite_number || existing.name);
          const suiteMatches = buildSuiteMatches(rawKey);
          const dup = await Model.findOne({ organization_id, floor_id: targetFloorId, $or: suiteMatches, _id: { $ne: existing._id } }).lean();
          if (dup) return { __duplicate: true, record: dup };
        }
      } catch (err) {
        // swallow lookup errors to avoid blocking updates
      }
      
      // Sanitize incoming update payload: prevent attempts to set _id or id
      // which can cause Mongoose to cast numeric values to ObjectId and fail.
      const updateData = { ...data };
      if (updateData._id !== undefined) delete updateData._id;
      if (updateData.id !== undefined) delete updateData.id;

      // Update using the found document. For collections like `organizations` where
      // documents may use numeric _id or organization_id as the canonical key,
      // avoid findByIdAndUpdate which will attempt to cast the id to ObjectId
      // (causing BSON cast errors). Instead, update by `organization_id` or
      // by the parsed id field depending on what's available.
      try {
        if (collection === 'organizations' && existing.organization_id !== undefined) {
          const updated = await Model.findOneAndUpdate({ organization_id: existing.organization_id }, { $set: updateData }, { new: true }).lean();
          return updated;
        }
        // Default: try to update by the document's _id when safe
        const updated = await Model.findByIdAndUpdate(existing._id, { $set: updateData }, { new: true }).lean();
        return updated;
      } catch (err) {
        // Fallback to a safer update attempt if findByIdAndUpdate fails for any reason
        await Model.updateOne({ id: parsed, organization_id }, { $set: updateData }, { upsert: false });
        return Model.findOne({ id: parsed, organization_id }).lean();
      }
    },
    remove: async (id) => {
      return Model.deleteOne({ id: parseId(id) });
    },
    // New method that includes organization_id filtering for deletions
    removeWithOrgId: async (id, organization_id) => {
      const parsed = parseId(id);
  // Try delete by logical `id` first
  const filterById = { id: parsed, organization_id };
  logger.debug('removeWithOrgId trying filter', filterById);
  let res = await Model.deleteOne(filterById);
  logger.debug('removeWithOrgId result for filterById', { result: res && res.deletedCount ? `${res.deletedCount} deleted` : '0 deleted' });
  if (res && res.deletedCount && res.deletedCount > 0) return res;

      // If not deleted, and the provided id looks like an ObjectId, try deleting by _id
      try {
        if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
          const objFilter = { _id: mongoose.Types.ObjectId(id), organization_id };
          logger.debug('removeWithOrgId trying ObjectId filter', objFilter);
          res = await Model.deleteOne(objFilter);
          logger.debug('removeWithOrgId result for objFilter', { result: res && res.deletedCount ? `${res.deletedCount} deleted` : '0 deleted' });
          if (res && res.deletedCount && res.deletedCount > 0) return res;
        }
      } catch (err) {
        // ignore and fallthrough
      }

      // As a last resort, try matching by raw _id string without ObjectId conversion
      try {
  const rawFilter = { _id: id, organization_id };
  logger.debug('removeWithOrgId trying raw _id filter', rawFilter);
  res = await Model.deleteOne(rawFilter);
  logger.debug('removeWithOrgId result for rawFilter', { result: res && res.deletedCount ? `${res.deletedCount} deleted` : '0 deleted' });
        return res;
      } catch (err) {
  logger.warn('removeWithOrgId rawFilter error', err && err.message);
        return res || { deletedCount: 0 };
      }
    }
  };
}

export default makeService;
