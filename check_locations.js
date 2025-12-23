(async () => {
  try {
    const base = 'http://localhost:3030';
    const r = await fetch(base + '/api/tenants');
    console.log('/api/tenants ->', r.status);
    const j = await r.json();
    if (!j || !j.data || j.data.length === 0) {
      console.log('no tenants found');
      return;
    }
    const first = j.data[0];
    const tid = first._id || first.id || first.ID || first.id;
    console.log('first tenant id:', tid);
    const rl = await fetch(base + '/api/tenants/' + tid + '/locations');
    console.log(`/api/tenants/${tid}/locations ->`, rl.status);
    const rljson = await rl.json();
    console.log('locations response:', JSON.stringify(rljson, null, 2));
  } catch (e) {
    console.error('err', e && e.message);
  }
})();
