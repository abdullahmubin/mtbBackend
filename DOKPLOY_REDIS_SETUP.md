# Dokploy Redis Connection Setup

## Problem
Your app was trying to connect to hostname "redis" which doesn't exist in Dokploy's environment, causing:
```
Error: getaddrinfo ENOTFOUND redis
```

## Solution

### Step 1: Find Your Redis Connection Details in Dokploy

1. Go to your Dokploy dashboard
2. Navigate to your Redis service
3. Look for connection details (usually under "Connection" or "Info" tab)
4. Note down:
   - **Host/IP**: Could be something like `redis-12345.dokploy.internal` or an IP like `10.0.1.5`
   - **Port**: Usually `6379`
   - **Password**: If set

### Step 2: Configure Environment Variables in Dokploy

In your backend application's environment variables section, add:

```bash
# Required: Set this to your actual Redis hostname/IP from Dokploy
REDIS_HOST=your-redis-hostname-from-dokploy

# Required: Redis port (usually 6379)
REDIS_PORT=6379

# Optional: Redis password (if your Redis has authentication)
REDIS_PASSWORD=your-redis-password

# Optional: Disable Redis if you don't need it
# REDIS_ENABLED=false
```

### Step 3: Alternative - Disable Redis (if not needed)

If your application can run without Redis, simply add:
```bash
REDIS_ENABLED=false
```

The application will start without Redis and log:
```
Redis is disabled via REDIS_ENABLED=false
Application starting without Redis
```

## Common Dokploy Redis Hostnames

Depending on your setup, the hostname might be:
- Service name with suffix: `redis-abc123.internal`
- Internal IP: `10.0.x.x` or `172.x.x.x`
- Localhost (only if Redis is in the same container): `127.0.0.1`

## Testing Connection

After setting the environment variables, check your application logs. You should see:
```
[DEBUG] Redis configuration:
  - Enabled: true
  - Host: your-configured-host
  - Port: 6379
  - Password: *** (or none)
Redis connected successfully
```

## Troubleshooting

### Still getting connection errors?
1. Verify Redis service is running in Dokploy
2. Double-check the hostname/IP in environment variables
3. Ensure Redis port is correct (default: 6379)
4. Check if Redis requires authentication (password)
5. Verify network connectivity between services

### Redis not needed?
Set `REDIS_ENABLED=false` and your app will skip Redis entirely.

## Code Changes Made

The `redisClient.js` file has been updated to:
- ✅ Show detailed connection debug info
- ✅ Support `REDIS_ENABLED` flag to disable Redis
- ✅ Gracefully handle connection failures
- ✅ Allow app to run without Redis
