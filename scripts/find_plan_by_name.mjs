import DatabaseManager from '../src/config/database.js';
import { getModel } from '../src/models/registry.js';

const name = process.argv[2] || 'HobbyList';

async function run() {
  try {
    await DatabaseManager.connect();
    const PlanSettings = getModel('plan_settings');
    const res = await PlanSettings.findOne({ $or: [{ name: name }, { name: name.toLowerCase() }, { _id: name }, { _id: name.toLowerCase() }, { plan: name }, { plan: name.toLowerCase() }] }).lean();
    console.log('Lookup for', name, ':', res ? JSON.stringify({ _id: res._id, plan: res.plan, name: res.name, tenantDirectoryEnabled: res.tenantDirectoryEnabled }, null, 2) : 'Not found');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
