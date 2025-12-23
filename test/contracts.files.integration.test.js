import { strict as assert } from 'assert';
import * as svc from '../src/services/contractsService.js';
import { saveDocument } from '../src/services/documentsService.js';
import { startMemoryDb, stopMemoryDb } from './setupMemoryDb.js';

describe('contracts file linking (integration)', function() {
  before(async function() {
    this.timeout(20000);
    await startMemoryDb();
  });

  after(async function() {
    await stopMemoryDb();
  });

  it('saves a document and links it to contract.files', async function() {
    const payload = { organization_id: 555, tenant_id: 'tenant-1', title: 'Contract With File' };
    const created = await svc.createContract(payload);
    assert.ok(created._id, 'contract created');

    const docPayload = {
      document: Buffer.from('dummy'),
      fileName: 'test.pdf',
      fileType: 'application/pdf',
      size: 5,
      tenant_id: payload.tenant_id,
      organization_id: payload.organization_id,
      uploader: 'test-runner'
    };

    const savedDoc = await saveDocument(docPayload);
    assert.ok(savedDoc._id, 'document saved');

    // Link to contract
    const updated = await svc.updateContract(created._id, { $push: { files: { filename: savedDoc.fileName, storage_key: savedDoc._id, mime: savedDoc.fileType, size: savedDoc.size, uploadedBy: savedDoc.uploader, uploadedAt: savedDoc.createdAt } } });
    assert.ok(updated, 'contract updated');

    const fetched = await svc.getContractById(created._id);
    assert.ok(fetched.files && fetched.files.length === 1, 'files array populated');
    assert.equal(String(fetched.files[0].storage_key), String(savedDoc._id));
  });
});
