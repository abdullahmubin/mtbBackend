import assert from 'assert';
import { MongoMemoryServer } from 'mongodb-memory-server';
import databaseManager from '../src/config/database.js';
import { handleErrors } from '../src/utils/errors/errorHandler.js';
import { getModel } from '../src/models/registry.js';

describe('errorHandler middleware', function() {
  let mongo;
  this.timeout(20000);
  before(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.connectionString = mongo.getUri();
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

  it('should persist an error via middleware', async () => {
    const testErr = new Error('middleware test error');
    const req = {
      originalUrl: '/test/err',
      method: 'GET',
      ip: '127.0.0.1',
      get: (h) => 'mocha-agent',
      body: { foo: 'bar' },
      params: { id: 1 },
      query: {}
    };
    const res = {
      status: function(code) { this._status = code; return this; },
      json: function(obj) { this._body = obj; }
    };

    await handleErrors(testErr, req, res, () => {});

    const ErrorLog = getModel('error_logs');
    const doc = await ErrorLog.findOne({ message: 'middleware test error' }).lean();
    assert.ok(doc, 'error log was not persisted by middleware');
    assert.strictEqual(doc.route, '/test/err');
  });
});
