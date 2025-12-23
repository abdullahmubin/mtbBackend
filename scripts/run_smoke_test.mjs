import { spawn } from 'child_process';
import axios from 'axios';

const PORT = process.env.SMOKE_PORT || '3050';
const CWD = process.cwd();

console.log('Starting backend smoke test on port', PORT);

const child = spawn(process.execPath, ['index.js'], {
  cwd: CWD,
  env: { ...process.env, PORT },
  stdio: ['ignore', 'pipe', 'pipe']
});

let ready = false;
const readyMessages = ['Server running on port', 'Health check available', '📊 Health check available'];

child.stdout.on('data', (b) => {
  const s = String(b);
  process.stdout.write('[backend] ' + s);
  if (!ready && readyMessages.some(m => s.includes(m))) {
    ready = true;
    runChecks().then(() => shutdown()).catch((e)=>{ console.error('Checks failed', e); shutdown(); });
  }
});
child.stderr.on('data', (b) => { process.stderr.write('[backend-err] ' + String(b)); });

child.on('exit', (code, sig) => {
  console.log(`Backend exited with code=${code} sig=${sig}`);
});

async function runChecks(){
  try{
    const base = `http://localhost:${PORT}`;
    console.log('Calling GET /api/health');
    const h = await axios.get(`${base}/api/health`, { timeout: 5000 });
    console.log('Health response status:', h.status);
    console.log(JSON.stringify(h.data, null, 2));
  }catch(e){ console.error('Health request failed', e && e.toString()); }

  try{
    const base = `http://localhost:${PORT}`;
    console.log('Calling POST /api/tenants/batch with empty tenants array');
    const r = await axios.post(`${base}/api/tenants/batch`, { tenants: [] }, { timeout: 5000 });
    console.log('POST /api/tenants/batch status:', r.status);
    console.log(JSON.stringify(r.data, null, 2));
  }catch(err){
    if (err.response) {
      console.log('POST responded with status:', err.response.status);
      try{ console.log(JSON.stringify(err.response.data, null, 2)); }catch(e){ console.log('Response data:', err.response.data); }
    } else {
      console.error('POST request failed', err && err.toString());
    }
  }
}

function shutdown(){
  try{ child.kill('SIGINT'); }catch(e){}
  // ensure exit after short delay
  setTimeout(()=>process.exit(0), 1200);
}
