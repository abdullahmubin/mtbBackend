# Running the Reminders Worker separately

Purpose: ensure the reminders worker does not auto-start as part of the main HTTP process and provide safe, repeatable commands and examples for running the worker in dev and production.

Short blurb:
- The scheduler and worker should be run as separate processes. Use `scheduler-service` (or `backend/scheduler/server.js`) with `ENABLE_SCHEDULER=true` to run scheduled jobs. Keep the API web server started with `DISABLE_SCHEDULER=true` so it does not run scheduled jobs accidentally.

Files touched
- `backend/index.js` - checks `WORKER_DISABLED` env var and skips worker startup when set
- `backend/src/workers/runWorker.js` - a small runner that imports and starts the reminders worker
- `backend/package.json` - `worker` script that runs the runner

Quick dev commands (PowerShell)

Run backend API without starting worker or scheduler in-process:

```powershell
cd backend
$env:WORKER_DISABLED='true'; $env:DISABLE_SCHEDULER='true'; npm run dev
```

Start worker only (PowerShell):

```powershell
cd backend
npm run worker
```

Or run the worker directly with node (useful for debugging):

```powershell
cd backend
node src/workers/runWorker.js
```

Notes about environment variables
- `WORKER_DISABLED=true` prevents the main process from starting the worker.
- `DISABLE_SCHEDULER=true` prevents the cron scheduler from scheduling jobs.
- In production you'll want your process manager (PM2, systemd, Docker) to start backend and worker as separate units.

PM2 examples

Create two process entries:

```bash
# start api
pm2 start index.js --name tenant-api --cwd /path/to/backend --watch --env production --interpreter node --node-args='--enable-source-maps' -- $env:WORKER_DISABLED='true' $env:DISABLE_SCHEDULER='false'

# start worker
pm2 start src/workers/runWorker.js --name tenant-worker --cwd /path/to/backend --interpreter node --node-args='--enable-source-maps'
```

systemd example (Ubuntu)

Create `/etc/systemd/system/tenant-api.service` for API:

```
[Unit]
Description=Tenant API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/tenant-backend
Environment=WORKER_DISABLED=true
Environment=DISABLE_SCHEDULER=false
ExecStart=/usr/bin/node index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/tenant-worker.service` for Worker:

```
[Unit]
Description=Tenant Worker
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/tenant-backend
ExecStart=/usr/bin/node src/workers/runWorker.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Troubleshooting
- If worker can't connect to Redis, check `REDIS_URL`/`REDIS_HOST`/`REDIS_PORT` and that Redis is reachable from the host.
- If the worker exits immediately, run with `node --inspect-brk src/workers/runWorker.js` or check the worker logs (`pm2 logs tenant-worker` or `journalctl -u tenant-worker`).
- Ensure `WORKER_DISABLED` is set in the environment used by the API process in production.

Further improvements
- Add a health-check endpoint for worker status and queue depth (already present in `GET /api/dashboard/worker/health`).
- Add a restart policy and log rotation (PM2 or systemd unit with `RestartSec` and logrotate config).

Security
- Run worker under an unprivileged user.
- Ensure environment secrets (Redis URL, DB connection strings) are provided securely (not baked into images or source).
