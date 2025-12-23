const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
(async ()=>{
  const base = 'http://localhost:3030';
  try{
    const h = await fetch(base + '/api/health');
    console.log('health', h.status);
  }catch(e){ console.error('health err', e.message); return; }
  try{
    const t = await fetch(base + '/api/auth/login', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ email:'tenant1@example.com', password:'password' }) });
    const tr = await t.json();
    console.log('tenant login', tr?.data?.userInfo?.id || tr?.data?.userInfo?._id, tr?.status || tr?.error || 'ok');
    const token = tr?.data?.token;
    if(!token) { console.error('no tenant token'); return; }
    const m = await fetch(base + '/api/messages', { method:'POST', headers:{ 'content-type':'application/json','authorization': 'Bearer '+token }, body: JSON.stringify({ subject:'smoke', message:'hello smoke' }) });
    const mr = await m.json();
    console.log('message created', mr?.data?._id || mr?.data?.id || JSON.stringify(mr).slice(0,80));
    const a = await fetch(base + '/api/auth/login', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ email:'admin@example.com', password:'password' }) });
    const ar = await a.json();
    console.log('admin login', ar?.data?.userInfo?.id || ar?.data?.userInfo?._id);
    const atok = ar?.data?.token;
    if(!atok){ console.error('no admin token'); return; }
    const n = await fetch(base + '/api/notifications?limit=20', { headers:{ authorization: 'Bearer '+atok } });
    const nr = await n.json();
    console.log('notifications', JSON.stringify(nr, null, 2).slice(0,200));
    const uc = await fetch(base + '/api/notifications/unread-count', { headers:{ authorization: 'Bearer '+atok } });
    console.log('unread', JSON.stringify(await uc.json(), null, 2));
  }catch(e){ console.error('smoke err', e); }
})();
