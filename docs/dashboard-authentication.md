# Dashboard Authentication Guide

## Overview

The Polymarket Trading Bot dashboard implements token-based authentication to protect sensitive operations and data. This document describes the authentication model, API endpoints, and usage guidelines.

## Security Model

### Authentication Flow

1. **Admin Token**: Set via `ADMIN_TOKEN` environment variable on the backend
2. **Session Storage**: Token stored in browser `sessionStorage` (cleared when browser closes)
3. **Authorization Header**: Token sent as `Bearer {token}` or plain `{token}` format
4. **401 Handling**: Automatic logout and login prompt on unauthorized requests

### Key Security Features

- ✅ **No secrets in frontend code**: Token entered by user, not hardcoded
- ✅ **Session-based storage**: Token cleared when browser session ends
- ✅ **Protected endpoints**: All sensitive operations require authentication
- ✅ **CORS configuration**: Restricted origins for production deployment
- ✅ **Token verification**: Backend validates token on every protected request

### What's Protected

**Admin Authentication Required:**
- `/status` - System status and wallet address
- `/state` - Orders, positions, balances
- `/orders` - Order information
- `/fills` - Fill history
- `/kill` - Kill switch activation
- `/api/learning/*` - Learning system data (experiments, strategies, status)

**Public Endpoints (No Auth):**
- `/health` - Health check
- `/ready` - Readiness probe
- `/metrics` - Prometheus metrics
- `/orderbooks` - Market orderbook data
- `/feed/status` - Market feed status

## Using the Dashboard

### Initial Setup

1. Set the `ADMIN_TOKEN` environment variable on the backend:
   ```bash
   export ADMIN_TOKEN="your-secure-random-token-here"
   ```

2. Start the backend server:
   ```bash
   npm run dev
   ```

3. Open the dashboard in your browser:
   ```
   http://localhost:3000/dashboard.html
   ```

### Logging In

1. Click the "🔐 Login" button in the safety banner
2. Enter your admin token (same as `ADMIN_TOKEN` env var)
3. Click "🔓 Login"

On successful authentication:
- Auth status indicator turns green
- Learning System tab becomes accessible
- Protected operations become available

### Session Management

- **Token Storage**: Stored in `sessionStorage` (temporary)
- **Session Duration**: Lasts until browser window/tab is closed
- **Logout**: Click "🔓 Logout" button to clear token manually
- **Auto-Logout**: Triggered on 401 responses (invalid/expired token)

### Token Best Practices

1. **Generate Strong Tokens**: Use cryptographically secure random strings
   ```bash
   # Generate a strong token
   openssl rand -base64 32
   ```

2. **Keep Tokens Secret**: Never commit tokens to version control

3. **Rotate Regularly**: Change tokens periodically for security

4. **One Token Per Environment**: Use different tokens for dev/staging/prod

## API Endpoints

### Learning System API

All learning system endpoints require admin authentication.

#### GET /api/learning/experiments

Returns list of active experiments with metrics.

**Response:**
```json
{
  "totalExperiments": 3,
  "experiments": [
    {
      "strategyId": "strategy-001",
      "samples": 150,
      "totalReward": 42.5,
      "meanReward": 0.283,
      "allocation": 0.33,
      "status": "active"
    }
  ],
  "lastUpdated": "2026-02-07T20:00:00.000Z"
}
```

#### GET /api/learning/strategies

Returns list of strategies with performance metrics.

**Response:**
```json
{
  "totalStrategies": 5,
  "strategies": [
    {
      "strategyId": "strategy-001",
      "status": "under-review",
      "samples": 150,
      "pnl": 42.5,
      "sharpeRatio": 1.25,
      "winRate": 0.55,
      "maxDrawdown": 0.08,
      "lastEvaluated": "2026-02-07T20:00:00.000Z",
      "promotionEligible": true
    }
  ],
  "lastUpdated": "2026-02-07T20:00:00.000Z"
}
```

#### GET /api/learning/best

Returns the best performing strategy with recommendation.

**Response:**
```json
{
  "bestStrategy": {
    "strategyId": "strategy-001",
    "status": "under-review",
    "performance": {
      "strategyId": "strategy-001",
      "pnl": 42.5,
      "sharpe": 1.25,
      "maxDrawdown": 0.08,
      "winRate": 0.55,
      "tradeCount": 150,
      "errorRate": 0.01,
      "lastUpdated": "2026-02-07T20:00:00.000Z"
    },
    "promotionEligible": true,
    "promotionBlockers": []
  },
  "recommendation": "Strategy meets promotion criteria and can be considered for candidate status",
  "lastUpdated": "2026-02-07T20:00:00.000Z"
}
```

#### GET /api/learning/status

Returns integration status of learning system components.

**Response:**
```json
{
  "eventStore": {
    "initialized": true,
    "status": "connected",
    "eventsCount": 0
  },
  "signalCatalog": {
    "initialized": true,
    "status": "connected",
    "signalsCount": 5
  },
  "backtestEngine": {
    "initialized": true,
    "status": "active"
  },
  "banditAllocator": {
    "initialized": true,
    "status": "running",
    "algorithm": "epsilon-greedy"
  },
  "metricsGating": {
    "initialized": true,
    "status": "active"
  },
  "promotionWorkflow": {
    "initialized": true,
    "status": "active"
  },
  "overall": {
    "healthy": true,
    "mode": "paper-trading-only"
  },
  "lastUpdated": "2026-02-07T20:00:00.000Z"
}
```

### Error Responses

**401 Unauthorized:**
```json
{
  "error": "Unauthorized: invalid or missing admin token"
}
```

**503 Service Unavailable:**
```json
{
  "error": "Learning system not initialized",
  "experiments": []
}
```

## Frontend Integration

### Auth Module

The dashboard provides an `Auth` module for authentication management:

```javascript
// Check if authenticated
if (Auth.isAuthenticated()) {
  // User is logged in
}

// Get current token
const token = Auth.getToken();

// Set token (login)
Auth.setToken('your-token-here');

// Clear token (logout)
Auth.clearToken();

// Verify token with backend
const isValid = await Auth.verify();
```

### Making Authenticated Requests

Use the provided `fetchData` or `apiCall` helpers:

```javascript
// Automatically includes Authorization header if authenticated
const data = await fetchData('/api/learning/experiments', true);

// Or use apiCall
const response = await apiCall('/api/learning/experiments');
const data = await response.json();
```

### Handling 401 Responses

The dashboard automatically handles 401 responses:
1. Clears the invalid token
2. Shows error message
3. Displays login modal
4. User can re-authenticate

## Troubleshooting

### "Authentication Required" Error

**Cause**: No valid token in session  
**Solution**: Click "🔐 Login" and enter your admin token

### "Invalid Admin Token" Error

**Cause**: Token doesn't match `ADMIN_TOKEN` env var  
**Solution**: Verify token matches exactly (no extra spaces/newlines)

### Learning System Shows "Login Required"

**Cause**: Not authenticated  
**Solution**: Login first, then switch to Learning System tab

### Token Expired After Browser Restart

**Cause**: Token stored in `sessionStorage` (by design)  
**Solution**: Login again - this is intentional for security

### Backend Says "ADMIN_TOKEN Not Configured"

**Cause**: `ADMIN_TOKEN` env var not set  
**Solution**: Set `ADMIN_TOKEN` before starting backend:
```bash
export ADMIN_TOKEN="your-secure-token"
npm run dev
```

## Security Considerations

### Production Deployment

1. **Use Strong Tokens**: Minimum 32 characters, cryptographically random
2. **HTTPS Only**: Always use HTTPS in production
3. **CORS Configuration**: Set `ALLOWED_ORIGINS` to restrict access
4. **Rate Limiting**: Backend includes rate limiting (100 req/min default via `RATE_LIMIT_MAX_REQUESTS=100` and `RATE_LIMIT_WINDOW_MS=60000`)
5. **Regular Rotation**: Change tokens periodically

### Development vs Production

**Development** (localhost):
- Relaxed CORS (`*` allowed if configured)
- Can use weaker tokens for testing
- Manual token entry in dashboard

**Production**:
- Strict CORS (explicit origins only)
- Strong cryptographic tokens required
- Consider additional auth layer (OAuth, SAML, etc.)

### What NOT to Do

❌ Don't hardcode tokens in frontend code  
❌ Don't commit tokens to version control  
❌ Don't use weak/guessable tokens  
❌ Don't share tokens between environments  
❌ Don't store tokens in localStorage (use sessionStorage)

## References

- [REPORTS/AUDIT.md](../REPORTS/AUDIT.md) - Audit Finding A-004 (Authentication)
- [REPORTS/UI_RECOMMENDATIONS.md](../REPORTS/UI_RECOMMENDATIONS.md) - Dashboard security model
- [apps/backend/src/server/index.ts](../apps/backend/src/server/index.ts) - Authentication middleware
- [apps/frontend/public/dashboard.js](../apps/frontend/public/dashboard.js) - Frontend Auth module
