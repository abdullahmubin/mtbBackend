(async ()=>{
  try{
    const base = 'http://localhost:3030';
    const payload = {
      first_name: 'Smoke',
      last_name: 'Tester',
      email: `smoke${Date.now()}@example.com`,
      phone: '',
      has_portal_access: true
    };
    const r = await fetch(base + '/api/tenants', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    console.log('/api/tenants POST ->', r.status);
    const j = await r.json();
    console.log('created:', JSON.stringify(j, null, 2));
    const id = j?.data?._id || j?.data?.id;
    if(id){
      const g = await fetch(base + '/api/tenants/' + id);
      console.log('/api/tenants/:id GET ->', g.status);
      const gj = await g.json();
      console.log('fetched:', JSON.stringify(gj, null, 2));
    }
  }catch(e){ console.error('err', e && e.message); }
})();
