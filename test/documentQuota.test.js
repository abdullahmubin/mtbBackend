import assert from 'assert';
import { createEnforceDocumentQuota } from '../src/middleware/documentQuotaMiddleware.js';

function makeMockModels({ orgPlan='starter', docsCount=0, limit=2 } = {}){
  const OrganizationDB = {
    findOne: async (q) => ({ organization_id: q.organization_id, plan: orgPlan })
  };
  const DocumentsDB = {
    countDocuments: async (q) => {
      // return provided count or simulate by tenant id
      return docsCount;
    }
  };
  return { OrganizationDB, DocumentsDB };
}

function makeMockGetModel(planSettings){
  return (name) => ({ findOne: async (q) => planSettings });
}

function makeReq({ tenant_id='t1', orgId=1, userPlan='starter' } = {}){
  return { body: { tenant_id }, query: {}, file: null, organization_id: orgId, user: { plan: userPlan } };
}

function makeRes(){
  let statusCode = 200; let body = null;
  return {
    status(code){ statusCode = code; return this; },
    json(obj){ body = obj; return this; },
    _get(){ return { statusCode, body }; }
  };
}

describe('documentQuota middleware', function(){
  it('allows upload when under limit', async function(){
    const models = makeMockModels({ docsCount: 1 });
    const planSettings = { tenantDocumentLimit: 3 };
    const getModel = makeMockGetModel(planSettings);
    const middleware = createEnforceDocumentQuota({ models, getModel });

    const req = makeReq({ tenant_id: 't1', orgId: 1 });
    const res = makeRes();
    let called = false;
    await middleware(req, res, () => { called = true; });
    assert.strictEqual(called, true, 'next should be called when under limit');
  });

  it('blocks upload when at limit', async function(){
    const models = makeMockModels({ docsCount: 3 });
    const planSettings = { tenantDocumentLimit: 3 };
    const getModel = makeMockGetModel(planSettings);
    const middleware = createEnforceDocumentQuota({ models, getModel });

    const req = makeReq({ tenant_id: 't1', orgId: 1 });
    const res = makeRes();
    let nextCalled = false;
    await middleware(req, res, () => { nextCalled = true; });
    const out = res._get();
    assert.strictEqual(nextCalled, false, 'next should not be called when limit reached');
    assert.strictEqual(out.statusCode, 403);
    assert.ok(out.body && out.body.error === 'tenant_document_limit_exceeded');
  });

  it('allows when tenant_id missing', async function(){
    const models = makeMockModels({ docsCount: 100 });
    const getModel = makeMockGetModel(null);
    const middleware = createEnforceDocumentQuota({ models, getModel });
    const req = { body: {}, query: {}, file: null, organization_id: 1 };
    const res = makeRes();
    let called = false;
    await middleware(req, res, () => { called = true; });
    assert.strictEqual(called, true);
  });
});
