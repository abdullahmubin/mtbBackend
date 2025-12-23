import DatabaseManager from '../src/config/database.js';
import { getModel } from '../src/models/registry.js';

const email = process.argv[2] || 'assbtenant1@gmail.com';

async function run(){
  try{
    await DatabaseManager.connect();
    const Tenants = getModel('tenants');
    const Suites = getModel('suites');
    const Floors = getModel('floors');
    const Buildings = getModel('buildings');

    const tenant = await Tenants.findOne({ email: email.toLowerCase().trim() }).lean();
    if(!tenant){ console.log('Tenant not found:', email); process.exit(0); }
    console.log('Before:', JSON.stringify({ id: tenant.id, building_id: tenant.building_id, floor_id: tenant.floor_id, suite_id: tenant.suite_id }, null, 2));

    const suite = tenant.suite_id ? await Suites.findOne({ id: tenant.suite_id }).lean() : null;
    if(!suite){ console.log('No suite on tenant, nothing to do'); process.exit(0); }
    const floor = suite.floor_id ? await Floors.findOne({ id: suite.floor_id }).lean() : null;
    const buildingFromSuiteId = floor?.building_id;

    if(!buildingFromSuiteId){ console.log('Suite->floor->building not resolvable, aborting'); process.exit(0); }

    const res = await Tenants.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { $set: { building_id: buildingFromSuiteId, floor_id: suite.floor_id } },
      { new: true }
    ).lean();

    console.log('After:', JSON.stringify({ id: res.id, building_id: res.building_id, floor_id: res.floor_id, suite_id: res.suite_id }, null, 2));
  }catch(err){ console.error('Error:', err); }
  finally{ process.exit(0); }
}
run();
