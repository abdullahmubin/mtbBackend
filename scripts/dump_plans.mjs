import databaseManager from '../src/config/database.js';
import registry from '../src/models/registry.js';

async function main(){
  try{
    console.log('[dump_plans] connecting to DB...');
    await databaseManager.connect();
    const PlanModel = registry.getModel('plan_settings');
    const plans = await PlanModel.find({}).lean();
    console.log(JSON.stringify(plans.map(p=>({ _id: p._id, plan: p.plan, name: p.name, tenantDirectoryEnabled: p.tenantDirectoryEnabled })), null, 2));
    await databaseManager.gracefulShutdown();
  }catch(e){
    console.error('Failed:', e && e.stack?e.stack:e);
    try{ await databaseManager.gracefulShutdown(); }catch(_){}
    process.exit(1);
  }
}

main();
