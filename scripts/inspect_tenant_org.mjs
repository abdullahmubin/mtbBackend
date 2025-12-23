import DatabaseManager from '../src/config/database.js';
import { getModel } from '../src/models/registry.js';

const email = process.argv[2] || 'assbtenant1@gmail.com';

async function run() {
  try {
    await DatabaseManager.connect();
    const Tenants = getModel('tenants');
    const Orgs = getModel('organizations');
    const PlanSettings = getModel('plan_settings');

    const tenant = await Tenants.findOne({ email: email.toLowerCase().trim() }).lean();
    if (!tenant) { console.log('Tenant not found for email:', email); process.exit(0); }
    console.log('Tenant:', JSON.stringify({ id: tenant.id, organization_id: tenant.organization_id, email: tenant.email, has_portal_access: tenant.has_portal_access, password_set: !!tenant.password_set }, null, 2));

    const org = await Orgs.findOne({ organization_id: tenant.organization_id }).lean();
    console.log('Organization:', org ? JSON.stringify({ organization_id: org.organization_id, _id: org._id, name: org.name, plan: org.plan }, null, 2) : 'Organization not found');

    const planKey = (org && org.plan) || 'free';
    const plan = await PlanSettings.findOne({ $or: [{ _id: planKey }, { plan: planKey }, { id: planKey }] }).lean();
    console.log('Plan settings (looked up by plan key):', plan ? JSON.stringify({ _id: plan._id, plan: plan.plan, name: plan.name, tenantDirectoryEnabled: plan.tenantDirectoryEnabled }, null, 2) : 'Plan settings not found');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}
run();
