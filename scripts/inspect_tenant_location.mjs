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
    console.log('Tenant id:', tenant.id);
    console.log('tenant.building_id:', tenant.building_id);
    console.log('tenant.floor_id:', tenant.floor_id);
    console.log('tenant.suite_id:', tenant.suite_id);

    const suite = tenant.suite_id ? await Suites.findOne({ id: tenant.suite_id }).lean() : null;
    const floor = suite && suite.floor_id ? await Floors.findOne({ id: suite.floor_id }).lean() : null;
    const buildingFromSuite = floor && floor.building_id ? await Buildings.findOne({ id: floor.building_id }).lean() : null;
    const buildingDirect = tenant.building_id ? await Buildings.findOne({ id: tenant.building_id }).lean() : null;

    console.log('\nSuite record:', suite ? JSON.stringify({ id: suite.id, name: suite.name, floor_id: suite.floor_id }, null, 2) : 'none');
    console.log('Floor record:', floor ? JSON.stringify({ id: floor.id, floor_number: floor.floor_number, building_id: floor.building_id }, null, 2) : 'none');
    console.log('Building (from suite->floor):', buildingFromSuite ? JSON.stringify({ id: buildingFromSuite.id, name: buildingFromSuite.name }, null, 2) : 'none');
    console.log('Building (tenant.building_id):', buildingDirect ? JSON.stringify({ id: buildingDirect.id, name: buildingDirect.name }, null, 2) : 'none');

  }catch(err){ console.error('Error:', err); }
  finally{ process.exit(0); }
}
run();
