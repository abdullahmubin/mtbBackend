let ContractsDB;
try {
  ContractsDB = (await import('../models/contracts.js')).default;
} catch (err) {
  console.warn('Warning: contracts model not available, using placeholder in contractsService:', err && err.message);
  // lightweight placeholder that mimics mongoose-like calls
  ContractsDB = {
    create: async (p) => ({ ...p, _id: 'placeholder', createdAt: new Date() }),
    find: (filter) => ({ sort: () => ({ limit: () => ({ skip: () => ({ exec: async () => [] }) }) }) }),
    findById: (id) => ({ exec: async () => null }),
    findByIdAndUpdate: (id, changes) => ({ exec: async () => null })
  };
}

export async function createContract(payload) {
  if (typeof ContractsDB === 'function' || ContractsDB.create === undefined) {
    // If ContractsDB is a mongoose model constructor
    const doc = new ContractsDB(payload);
    await doc.save();
    return doc.toObject ? doc.toObject() : doc;
  }
  // Placeholder path
  return ContractsDB.create(payload);
}

export async function listContracts(filter = {}, opts = {}) {
  const q = (ContractsDB.find ? ContractsDB.find(filter) : { sort: () => ({ limit: () => ({ skip: () => ({ exec: async () => [] }) }) }) });
  if (q && q.sort) {
    if (opts.limit) q.limit(opts.limit);
    if (opts.skip) q.skip(opts.skip);
    return q.sort ? q.sort({ createdAt: -1 }).exec() : q.exec();
  }
  return [];
}

export async function getContractById(id) {
  if (ContractsDB.findById) return ContractsDB.findById(id).exec();
  return null;
}

export async function updateContract(id, changes) {
  if (ContractsDB.findByIdAndUpdate) return ContractsDB.findByIdAndUpdate(id, changes, { new: true }).exec();
  return null;
}

export async function archiveContract(id) {
  return updateContract(id, { status: "archived" });
}

export async function findContractByLeaseId(leaseId, organizationId) {
  if (ContractsDB.findOne) {
    return ContractsDB.findOne({ lease_id: leaseId, organization_id: organizationId }).exec();
  }
  return null;
}

export async function updateContractByLeaseId(leaseId, organizationId, changes) {
  if (ContractsDB.findOneAndUpdate) {
    return ContractsDB.findOneAndUpdate(
      { lease_id: leaseId, organization_id: organizationId },
      { $set: changes },
      { new: true }
    ).exec();
  }
  return null;
}
