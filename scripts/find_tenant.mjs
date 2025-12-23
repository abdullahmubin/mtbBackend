import DatabaseManager from '../src/config/database.js';
import { getModel } from '../src/models/registry.js';

const email = process.argv[2] || 'assbtenant1@gmail.com';

async function run() {
  try {
    await DatabaseManager.connect();
    const Tenants = getModel('tenants');
    const tenant = await Tenants.findOne({ email: email.toLowerCase().trim() }).lean();
    if (!tenant) {
      console.log('Tenant not found for email:', email);
      process.exit(0);
    }
    // Hide large binary fields
    if (tenant.profile_image) delete tenant.profile_image;
    console.log('Tenant record:');
    console.log(JSON.stringify(tenant, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

run();
