# Dokploy Redis Password Setup

This guide fixes the error:

```
NOAUTH Authentication required.
```

Your backend already supports `REDIS_PASSWORD`. Follow these steps to configure it in Dokploy.

## 1) Collect Redis connection details (Dokploy UI)

- Open your Redis service in Dokploy (e.g., `backend-redis-kpo2xa`).
- Note:
  - Hostname: typically the container/service name (e.g., `backend-redis-kpo2xa`) or a value shown in the service info.
  - Port: `6379` (default)
  - Password: shown in the Redis service settings or environment. If not visible, set one there.

## 2) Configure the Backend environment (Dokploy UI)

In your backend app’s Environment variables, add or update:

```bash
REDIS_HOST=backend-redis-kpo2xa
REDIS_PORT=6379
REDIS_PASSWORD=<your-redis-password>
```

Then redeploy the backend.

## 3) Verify in logs

You should see something like:

```
[DEBUG] Redis configuration:
  - Enabled: true
  - Host: backend-redis-kpo2xa
  - Port: 6379
  - Password: ***
Redis connected successfully
```

If you still see `NOAUTH` or `WRONGPASS`, double‑check the exact password configured in the Redis service and in your backend.

## Troubleshooting

- WRONGPASS / NOAUTH: Ensure the value in `REDIS_PASSWORD` exactly matches the one configured for the Redis service.
- Host not found: Make sure `REDIS_HOST` matches the Redis service hostname visible in Dokploy (or use the internal hostname Dokploy provides).
- Temporarily skip Redis: set `REDIS_ENABLED=false` in the backend to start without Redis while you sort credentials. Some features may be limited.

## Notes

- The backend code already reads `REDIS_PASSWORD` and passes it to the Redis client.
- Do not use `localhost` for `REDIS_HOST` unless Redis runs in the exact same container as the backend.
