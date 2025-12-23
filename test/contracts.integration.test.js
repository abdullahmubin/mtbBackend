import { strict as assert } from 'assert';
import * as svc from '../src/services/contractsService.js';
import { startMemoryDb, stopMemoryDb } from './setupMemoryDb.js';

describe('contracts integration (memory)', function() {
  before(async function() {
    this.timeout(20000);
    await startMemoryDb();
  });

  after(async function() {
    await stopMemoryDb();
  });

  it('creates a contract and reads it back', async function() {
    const payload = { organization_id: 99999, tenant_id: 't-100', title: 'Integration Contract Test' };
    const created = await svc.createContract(payload);
    assert.ok(created._id);
    const fetched = await svc.getContractById(created._id);
    assert.equal(String(fetched._id), String(created._id));
  });
});
