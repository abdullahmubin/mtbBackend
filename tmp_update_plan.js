import mongoose from 'mongoose';

async function run(){
  try{
    // Prefer explicit env vars used by the backend: MONGODB_URI or connectionString
    const uri = process.env.MONGODB_URI || process.env.connectionString || 'mongodb://127.0.0.1:27017/receipt_dev';
    // Connect using modern mongoose options (avoid deprecated flags)
    await mongoose.connect(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
    const Plan = mongoose.model('plan_settings', new mongoose.Schema({}, { strict:false, collection:'plan_settings' }));
    await Plan.updateOne({_id: 'free'}, {$set: { emailAutomationEnabled: true, smsAutomationEnabled: true, contractAutomationEnabled: true }}, { upsert: true });
    const doc = await Plan.findOne({_id: 'free'}).lean();
    console.log('updated plan_settings free:');
    console.log(JSON.stringify(doc, null, 2));
    await mongoose.disconnect();
  }catch(err){
    console.error('error', err);
    process.exit(1);
  }
}

run();
