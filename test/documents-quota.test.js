import assert from 'assert';
import { resolveTenantDocLimit, computeTenantQuota, computeQuotaBatch } from '../src/services/documentsQuota.js';

describe('documentsQuota helper', () => {
  it('resolveTenantDocLimit handles null/integer/undefined', () => {
    assert.strictEqual(resolveTenantDocLimit({ tenantDocumentLimit: null }), Infinity);
    assert.strictEqual(resolveTenantDocLimit({ tenantDocumentLimit: 5 }), 5);
  assert.strictEqual(resolveTenantDocLimit({}), 5);
  });

  it('computeTenantQuota uses injected models', async () => {
    const fakeModels = {
      OrganizationDB: { findOne: async () => ({ organization_id: 1, plan: 'starter' }) },
      DocumentsDB: { countDocuments: async () => 2 }
    };
    const fakeGetModel = (name) => ({ findOne: async () => ({ _id: 'starter', tenantDocumentLimit: 5 }) });

    const q = await computeTenantQuota('t1', 1, { injectedModels: fakeModels, injectedGetModel: fakeGetModel });
    assert.strictEqual(q.tenant_id, 't1');
    assert.strictEqual(q.limit, 5);
    assert.strictEqual(q.used, 2);
    assert.strictEqual(q.remaining, 3);
  });

  it('computeQuotaBatch aggregates counts', async () => {
    const fakeModels = {
      OrganizationDB: { findOne: async () => ({ organization_id: 1, plan: 'starter' }) },
      DocumentsDB: { aggregate: async () => ([{ _id: 't1', count: 2 }, { _id: 't2', count: 4 }]) }
    };
    const fakeGetModel = (name) => ({ findOne: async () => ({ _id: 'starter', tenantDocumentLimit: 5 }) });

    const res = await computeQuotaBatch(['t1','t2','t3'], 1, { injectedModels: fakeModels, injectedGetModel: fakeGetModel });
    const map = Object.fromEntries(res.map(r => [r.tenant_id, r]));
    assert.strictEqual(map['t1'].used, 2);
    assert.strictEqual(map['t2'].used, 4);
    assert.strictEqual(map['t3'].used, 0);
    assert.strictEqual(map['t3'].remaining, 5);
  });
});
