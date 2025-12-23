const BASE = process.env.BASE || 'http://localhost:3030';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'adminclientBusiness@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminclientBusiness@gmail.com';

async function run(){
  try{
    console.log('LOGIN:', ADMIN_EMAIL);
    const loginRes = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }) });
    const loginJson = await loginRes.json();
    console.log('login status', loginRes.status);
    console.log(JSON.stringify(loginJson, null, 2));

    const token = loginJson?.data?.token || loginJson?.token || loginJson?.accessToken || loginJson?.data?.accessToken;
    if(!token){
      console.error('No token in login response. Aborting.');
      process.exit(1);
    }
    console.log('Token (first 12 chars):', token.substring(0,12));

    const body = { emailAutomationEnabled: true, smsAutomationEnabled: true, contractAutomationEnabled: true };
    const updateRes = await fetch(`${BASE}/api/plan_settings/free`, { method: 'PUT', headers: { 'content-type': 'application/json', Authorization: 'Bearer '+token }, body: JSON.stringify(body) });
    const updateJson = await updateRes.json();
    console.log('update status', updateRes.status);
    console.log(JSON.stringify(updateJson, null, 2));
  }catch(err){
    console.error('Error during API calls:', err && (err.stack || err.message || err));
    process.exit(1);
  }
}

run();
