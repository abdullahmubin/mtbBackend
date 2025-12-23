import assert from 'assert';
import { mapUploadError } from '../src/services/uploadErrorMapper.js';

describe('uploadErrorMapper', () => {
  it('maps unsupported file type', () => {
    const e = new Error('Unsupported file type: foo');
    const r = mapUploadError(e);
    assert.strictEqual(r.status, 415);
    assert.strictEqual(r.code, 'unsupported_type');
  });

  it('maps file too large', () => {
    const e = new Error('File too large');
    const r = mapUploadError(e);
    assert.strictEqual(r.status, 413);
    assert.strictEqual(r.code, 'too_large');
  });

  it('maps unknown error', () => {
    const e = new Error('boom');
    const r = mapUploadError(e);
    assert.strictEqual(r.status, 500);
    assert.strictEqual(r.code, 'unknown');
  });
});
