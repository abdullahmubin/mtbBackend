# Paddle Checkout Modal - Production Troubleshooting

## Issue
Paddle checkout modal opens successfully **locally** but **not in production**.

## Common Causes & Solutions

### 1. **Environment Variables Not Set in Production**

Check these in your production environment (Dokploy):

```bash
# Required for Paddle API
PADDLE_API_BASE=https://api.paddle.com  # NOT sandbox in production!
PADDLE_VENDOR_AUTH_CODE=pdl_live_xxxxx  # Live API key (starts with pdl_live_)

# Price IDs (must be LIVE price IDs, not sandbox)
PADDLE_PRICE_BUSINESS_YEARLY=pri_01xxxxx
PADDLE_PRICE_BUSINESS_MONTHLY=pri_01xxxxx
PADDLE_PRICE_PRO_MONTHLY=pri_01xxxxx
PADDLE_PRICE_PRO_YEARLY=pri_01xxxxx
PADDLE_PRICE_HOBBY_YEARLY=pri_01xxxxx
PADDLE_PRICE_HOBBY_MONTHLY=pri_01xxxxx

# Frontend URLs
FRONTEND_BASE_URL=https://your-production-domain.com
CORS_ORIGINS=https://your-production-domain.com,https://app.your-domain.com
```

### 2. **Using Sandbox Instead of Live API**

**Local (.env.development):**
```bash
PADDLE_API_BASE=https://sandbox-api.paddle.com
PADDLE_VENDOR_AUTH_CODE=pdl_sdbx_apikey_xxxxx
```

**Production (Dokploy):**
```bash
PADDLE_API_BASE=https://api.paddle.com
PADDLE_VENDOR_AUTH_CODE=pdl_live_xxxxx
```

### 3. **CORS Issues**

Your backend validates success/cancel URLs against `CORS_ORIGINS` and `FRONTEND_BASE_URL`.

**Check authController.js logic:**
```javascript
const envOrigins = (process.env.CORS_ORIGINS || '').split(',')...
const allowedOrigins = [...defaultOrigins, ...envOrigins];
```

**In Production, add:**
```bash
CORS_ORIGINS=https://your-production-domain.com
FRONTEND_BASE_URL=https://your-production-domain.com
```

Otherwise the backend might reject the request or build wrong redirect URLs.

### 4. **Sandbox vs Live Price IDs Mismatch**

Your frontend might be sending a **sandbox price_id** but production uses **live API**.

**Check:**
- Frontend env vars (`VITE_PADDLE_PRICE_*`) use **live** price IDs in production.
- Backend validates price IDs from env. If frontend sends a sandbox ID, backend rejects it.

### 5. **Missing Payment Method Configuration**

Some Paddle accounts require:
```bash
PADDLE_PAYMENT_METHOD_CONFIGURATION_ID=pmcfg_xxxxx
```

Check your Paddle dashboard → Settings → Payment methods.

### 6. **Frontend Not Handling checkout_url**

Your backend returns:
```json
{
  "transaction_id": "...",
  "status": "...",
  "checkout_url": "https://checkout.paddle.com/..."
}
```

**Frontend must:**
- Open `checkout_url` in a new window/tab, or
- Use Paddle's JS SDK to open the modal:
  ```javascript
  Paddle.Checkout.open({ transactionId: data.transaction_id });
  ```

### 7. **Check Production Logs**

In Dokploy, check backend logs for:
```
console.log('process.env.PADDLE_VENDOR_AUTH_CODE:', ...);
console.log('payload:', ...);
console.log('apiBase:', ...);
```

**Look for:**
- Wrong API base (sandbox vs live)
- Missing/wrong auth code
- Error responses from Paddle API

---

## Production Checklist

- [ ] Set `PADDLE_API_BASE=https://api.paddle.com` (not sandbox)
- [ ] Set `PADDLE_VENDOR_AUTH_CODE=pdl_live_xxxxx` (live key)
- [ ] Update all `PADDLE_PRICE_*` to **live** price IDs
- [ ] Set `CORS_ORIGINS` to include production domain
- [ ] Set `FRONTEND_BASE_URL` to production frontend URL
- [ ] Verify frontend sends **live** price IDs
- [ ] Check frontend opens `checkout_url` correctly
- [ ] Test with browser console/network tab open
- [ ] Check Dokploy backend logs for errors

---

## Quick Debug Steps

### 1. Check Environment in Production

Add to backend (temporarily):
```javascript
console.log('PADDLE_API_BASE:', process.env.PADDLE_API_BASE);
console.log('PADDLE_VENDOR_AUTH_CODE:', process.env.PADDLE_VENDOR_AUTH_CODE?.slice(0, 20));
console.log('CORS_ORIGINS:', process.env.CORS_ORIGINS);
```

### 2. Test the Endpoint

```bash
curl -X POST https://your-backend.com/api/auth/checkout \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "price_id": "pri_01xxxxx",
    "success_url": "https://your-domain.com/dashboard",
    "cancel_url": "https://your-domain.com/pricing"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "data": {
    "transaction_id": "txn_xxxxx",
    "status": "...",
    "checkout_url": "https://checkout.paddle.com/..."
  }
}
```

### 3. Frontend Network Tab

- Open DevTools → Network
- Trigger checkout
- Check `/api/auth/checkout` request/response
- Verify `checkout_url` is returned
- Check if frontend opens the URL

---

## Common Error Messages

### "Invalid price_id"
- Frontend sending sandbox ID to live API
- Price ID not whitelisted in backend env vars

### "getaddrinfo ENOTFOUND api.paddle.com"
- Network/DNS issue in production
- Check if backend can reach Paddle's API

### "Unauthorized" / "Invalid API key"
- Wrong `PADDLE_VENDOR_AUTH_CODE`
- Using sandbox key with live API (or vice versa)

### CORS error in browser console
- `CORS_ORIGINS` not set for production domain
- Frontend domain not whitelisted

---

## Resources

- [Paddle API Docs](https://developer.paddle.com/api-reference/overview)
- [Paddle Checkout](https://developer.paddle.com/build/checkout/build-overlay-checkout)
- Backend code: `src/controllers/authController.js` → `createCheckoutSession`
