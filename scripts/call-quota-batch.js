import axios from 'axios';

const BASE = 'http://localhost:3031';

(async ()=>{
  try{
    const tenantIds = ['tenant13','tenant132','newtenant13']; // example ids - replace as needed
    const resp = await axios.post(`${BASE}/api/documenthandler/quota/batch`, { tenant_ids: tenantIds }, { headers: { Authorization: `Bearer ${process.env.TEST_TOKEN || ''}` } });
    console.log('raw', resp.status, resp.data);
  }catch(err){
    console.error('err', err.response ? { status: err.response.status, data: err.response.data } : err.message);
  }
})();
