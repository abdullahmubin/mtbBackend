import { computeQuotaBatch } from '../src/services/documentsQuota.js';

// Use the collection you provided
const planSettingsDocs = [
  { _id: '68aaa91311af156cee1d7576', id: 'free', tenantDocumentLimit: 1 },
  { _id: '68aaa91311af156cee1d7577', id: 'starter', plan: 'starter', tenantDocumentLimit: 5 },
  { _id: '68aaa91311af156cee1d7578', id: 'pro', plan: 'pro', tenantDocumentLimit: 20 },
  { _id: '68aaa91311af156cee1d7579', id: 'business', plan: 'business', tenantDocumentLimit: 25 },
  { _id: '68aaa91311af156cee1d757a', id: 'enterprise', plan: 'enterprise', tenantDocumentLimit: null },
  // duplicates with simple _id keys (as in your paste)
  { _id: 'starter', plan: 'starter', tenantDocumentLimit: 5 },
  { _id: 'pro', plan: 'pro', tenantDocumentLimit: 20 },
  { _id: 'business', plan: 'business', tenantDocumentLimit: 25 },
  { _id: 'enterprise', plan: 'enterprise', tenantDocumentLimit: null },
  { _id: 'free', name: 'Free', tenantDocumentLimit: 1 }
];

// Fake DocumentsDB aggregate to return counts for provided tenant ids
const DocumentsDB = {
  aggregate: (ops) => {
    // return chainable object with allowDiskUse
    return {
      allowDiskUse: async (v) => {
        const match = ops.find(o=>o.$match && o.$match.tenant_id && o.$match.tenant_id.$in);
        const ids = match ? match.$match.tenant_id.$in : [];
        const counts = ids.map(id => ({ _id: id, count: 0 }));
        return counts;
      }
    };
  }
};

const OrganizationDB = {
  findOne: async (q) => ({ organization_id: q.organization_id, plan: 'starter' })
};

const fakeGetModel = (name) => {
  if (name === 'plan_settings') return { findOne: async (q) => {
      // q is $or or {_id: key}
      let key = null;
      if (q && q.$or) key = q.$or.map(x=>Object.values(x)[0])[0];
      else if (q._id) key = q._id;
      else if (q.plan) key = q.plan;
      // find by _id, plan or id
      return planSettingsDocs.find(p => p._id === key || p.plan === key || p.id === key) || null;
  }};
  throw new Error('unknown model '+name);
};

(async ()=>{
  const tenantIds = ['tenant13','tenant132','newtenant13'];
  const orgId = 1756056251034; // from your user payload
  const res = await computeQuotaBatch(tenantIds, orgId, { injectedModels: { DocumentsDB, OrganizationDB }, injectedGetModel: fakeGetModel });
  console.log('computed batch quotas:', JSON.stringify(res, null, 2));
})();
