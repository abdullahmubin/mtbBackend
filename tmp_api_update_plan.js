import axios from 'axios';

const BASE = process.env.BASE || 'http://localhost:3030';

async function run(){
  try{
  // Login as admin. Prefer env overrides, otherwise use provided test credentials.
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'adminclientBusiness@gmail.com';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminclientBusiness@gmail.com';
  const login = await axios.post(`${BASE}/api/auth/login`, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    const loginData = login.data?.data || login.data;
    const token = loginData?.token || loginData?.data?.token || loginData?.accessToken || loginData?.access_token;
    console.log('login response', JSON.stringify(login.data, null, 2));
    if(!token){
      console.error('No token returned from login; cannot continue');
      process.exit(1);
    }

    // Update plan settings 'free'
    const body = { emailAutomationEnabled: true, smsAutomationEnabled: true, contractAutomationEnabled: true };
    const updated = await axios.put(`${BASE}/api/plan_settings/free`, body, { headers: { Authorization: 'Bearer '+token } });
    console.log('update response', JSON.stringify(updated.data, null, 2));
  }catch(err){
    if(err.response){
      console.error('API error', err.response.status, err.response.data);
    } else {
      console.error('Error', err.message);
    }
    process.exit(1);
  }
}

run();
