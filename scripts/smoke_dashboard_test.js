import request from 'supertest';
import app from '../src/index.js';

(async () => {
  try {
    const res = await request(app).get('/api/admin/dashboard/stats');
    console.log('status', res.status);
    console.log('body', res.body);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
