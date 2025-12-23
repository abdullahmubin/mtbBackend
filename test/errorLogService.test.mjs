import assert from 'assert';
import { MongoMemoryServer } from 'mongodb-memory-server';
import databaseManager from '../src/config/database.js';
import errorLogService from '../src/services/errorLogService.js';
import { getModel } from '../src/models/registry.js';

describe('errorLogService', function() {
  let mongo;
  this.timeout(20000);
  before(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.connectionString = mongo.getUri();
    // set required env vars used by databaseManager.validateConfig
    process.env.SECRET_KEY = 'x';
    process.env.REFRESH_SECRET_KEY = 'x';
    process.env.FORGET_PASSWORD = 'x';
    process.env.FORGET_PASSWORD_KEY = 'x';
    await databaseManager.connect();
  });

  after(async () => {
    try { await databaseManager.gracefulShutdown(); } catch (e) {}
    if (mongo) await mongo.stop();
  });

  it('should persist an error log document', async () => {
    const payload = { message: 'test error', name: 'TestError', meta: { foo: 'bar' } };
    await errorLogService.logError(payload);
    const ErrorLog = getModel('error_logs');
    const doc = await ErrorLog.findOne({ message: 'test error' }).lean();
    assert.ok(doc, 'error log was not persisted');
    assert.strictEqual(doc.name, 'TestError');
  });
});
