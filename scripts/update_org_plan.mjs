import DatabaseManager from '../src/config/database.js';
import { getModel } from '../src/models/registry.js';

const orgId = process.argv[2] ? Number(process.argv[2]) : 1758916986736;
const newPlan = process.argv[3] || 'starter';

async function run() {
  try {
    await DatabaseManager.connect();
    const Orgs = getModel('organizations');
    const before = await Orgs.findOne({ organization_id: orgId }).lean();
    console.log('Before:', before ? JSON.stringify({ organization_id: before.organization_id, _id: before._id, name: before.name, plan: before.plan }, null, 2) : 'Not found');
    const res = await Orgs.findOneAndUpdate({ organization_id: orgId }, { $set: { plan: newPlan } }, { new: true }).lean();
    console.log('After:', res ? JSON.stringify({ organization_id: res.organization_id, _id: res._id, name: res.name, plan: res.plan }, null, 2) : 'Not updated');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}
run();
