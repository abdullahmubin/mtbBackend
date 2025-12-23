import { strict as assert } from 'assert';
import * as svc from '../src/services/contractsService.js';

describe('contractsService exports', () => {
  it('should export basic CRUD functions', () => {
    assert.ok(typeof svc.createContract === 'function');
    assert.ok(typeof svc.listContracts === 'function');
    assert.ok(typeof svc.getContractById === 'function');
    assert.ok(typeof svc.updateContract === 'function');
  });
});
