import { computeTenantQuota, computeQuotaBatch, resolveTenantDocLimit } from '../src/services/documentsQuota.js';

// Build fake models that mimic DB collections using the provided payload
const planSettingsDocs = [
  { _id: 'free', id: 'free', tenantDocumentLimit: 1 },
  { _id: 'starter', plan: 'starter', id: 'starter', tenantDocumentLimit: 5 },
];

const DocumentsDB = {
  countDocuments: async (q) => {
    // no docs in this debug run
    return 0;
  },
  aggregate: async (ops) => {
    return [];
  }
};

const OrganizationDB = {
  findOne: async (q) => ({ organization_id: q.organization_id, plan: 'starter' })
};

const fakeGetModel = (name) => {
  if (name === 'plan_settings') return { findOne: async (q) => {
      const key = q && q.$or ? q.$or.map(x=>Object.values(x)[0])[0] : q._id || q.plan || q.id;
      return planSettingsDocs.find(p => p._id === key || p.plan === key || p.id === key) || null;
  }};
  throw new Error('unknown model '+name);
};

(async ()=>{
  const q = await computeTenantQuota('tenant-1', 1, { injectedModels: { DocumentsDB, OrganizationDB }, injectedGetModel: fakeGetModel });
  console.log('quota result', q);
})();
