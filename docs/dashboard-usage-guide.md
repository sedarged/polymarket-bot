# Dashboard Usage Guide

**Version:** 1.0  
**Last Updated:** 2026-02-07  
**Related Issues:** #239, #89, #88, #87

---

## Overview

The Polymarket Trading Bot Dashboard is a production-ready web interface for monitoring and controlling the trading bot. It provides real-time visibility into bot operations, risk management controls, and comprehensive logging.

**Access URL:** `http://localhost:8080/dashboard.html` (when frontend server is running)

---

## Quick Start

### Starting the Dashboard

1. **Start the backend server:**
   ```bash
   cd /path/to/polymarket-bot
   npm run dev
   ```
   Backend will start on `http://localhost:3000`

2. **Start the frontend server (in a new terminal):**
   ```bash
   cd apps/frontend
   npm run dev
   ```
   Frontend will start on `http://localhost:8080`

3. **Open the dashboard:**
   Navigate to `http://localhost:8080/dashboard.html` in your browser

### Configuration

**For development:** The dashboard is pre-configured to use localhost:3000 and includes a development admin token.

**For production:** You must:
1. Set `ADMIN_TOKEN` environment variable to a secure random value
2. Configure `ALLOWED_ORIGINS` to whitelist your dashboard domain
3. Update the dashboard.js `getAdminToken()` function to use secure authentication

---

## Dashboard Features

### Persistent Safety Banner

The safety banner is always visible at the top and shows:

- **Mode Indicator:**
  - 🟡 **Paper Mode** (Yellow) - Safe, simulated trading
  - 🔴 **LIVE TRADING** (Red, animated) - Real money at risk

- **System Status:**
  - Market Feed: Connected/Disconnected
  - Trading: Initialized/Not Initialized

- **Quick Actions:**
  - **Reconnect** - Manually trigger market feed reconnection
  - **Kill Switch** - Emergency stop all trading (requires admin token)

### Tab 1: Overview

**Purpose:** Quick summary of bot status and performance

**Features:**
- Wallet address display
- Open orders count
- Active positions count
- Available balance (USDC)
- Realized PnL (24h)
- Unrealized PnL
- Watched markets table with bid/ask/mid prices

**Auto-refresh:** Every 5 seconds

**Screenshot:**
![Overview Tab](https://github.com/user-attachments/assets/46818d6e-c250-47e0-be4d-6e4bb1db6338)

---

### Tab 2: Monitoring

**Purpose:** Detailed real-time monitoring of trading activity

**Features:**

1. **Open Orders Table**
   - Order ID, Token ID, Side, Price, Size
   - Creation timestamp
   - Refresh button for manual updates

2. **Positions Table**
   - Token ID, Size, Average Price
   - Market Value, Unrealized PnL
   - Color-coded PnL (green=profit, red=loss)

3. **Recent Fills Table**
   - Last 20 fills displayed
   - Order ID, Token ID, Side, Price, Size, Fee
   - Timestamp for each fill

4. **Real-Time Event Feed**
   - Live stream of bot events
   - Shows refresh cycles, initialization, configuration changes
   - Keeps last 100 events

**Screenshot:**
![Monitoring Tab](https://github.com/user-attachments/assets/6cbc4724-7cf6-4b27-bae5-72838a0779b1)

---

### Tab 3: Controls

**Purpose:** Configuration management for risk, strategy, and reconnection settings

**Features:**

1. **Risk Configuration**
   - Max Exposure Per Market (USDC)
   - Max Open Orders
   - Max Drawdown (%) - triggers kill switch when breached
   - Save button to persist changes

2. **Strategy Parameters**
   - Trading Strategy selection (Market Maker, Arbitrage, Momentum, Custom)
   - Order Size (USDC)
   - Refresh Interval (seconds)
   - Save button to persist changes

3. **Reconnect Configuration**
   - Reconnect Attempts
   - Reconnect Delay (ms)
   - Max Reconnect Delay (ms)
   - Save button to persist changes

4. **Configuration Change Log**
   - Tracks all configuration changes
   - Shows timestamp, section, field, old value → new value
   - Keeps last 50 changes

**Screenshot:**
![Controls Tab](https://github.com/user-attachments/assets/609906e7-a216-4113-9036-083411f2f46d)

---

### Tab 4: Alerts & Logs

**Purpose:** Monitor alerts, view application logs, and check system metrics

**Features:**

1. **Active Alerts Panel**
   - Displays critical alerts with severity badges
   - Color-coded: Red (danger), Yellow (warning), Blue (info), Green (success)
   - Auto-dismisses success alerts after 5 seconds
   - Clear All button

2. **Application Logs**
   - Real-time log viewer
   - Filter by level: All, Error, Warning, Info, Debug
   - Color-coded by severity
   - Export logs to text file
   - Clear logs button
   - Keeps last 500 log entries

3. **System Metrics**
   - Uptime
   - Memory usage (heap used/total)
   - Status (ok/error)
   - Live trading mode indicator

**Screenshot:**
![Alerts & Logs Tab](https://github.com/user-attachments/assets/bb6bd3fa-56f3-443e-b5f8-e35ad5cbf069)

---

### Tab 5: Learning System

**Purpose:** Monitor learning system experiments and integration status

**Features:**
- Active experiments count
- Strategies tested count
- Best performing strategy
- Experiment uptime
- Integration points status (Event Store, Feature Engine, Evaluation Framework, Bandit Allocator)
- Placeholder for future functionality

**Note:** Full learning system integration is planned for future releases.

---

## Kill Switch

The Kill Switch is a critical safety feature that immediately:
1. Cancels ALL open orders
2. Halts all trading operations
3. Logs the event for audit purposes

### How to Use Kill Switch

1. Click the **🛑 Kill Switch** button in the safety banner
2. A confirmation modal appears
3. Enter the admin token (required for authentication)
4. Click **Activate Kill Switch** to confirm

**Security:** The kill switch requires admin token authentication to prevent accidental or unauthorized activation.

---

## API Authentication

Protected endpoints require admin token authentication:

- `/status` - Bot status and wallet info
- `/state` - Orders, positions, balances
- `/orders` - Order management
- `/fills` - Fill history
- `/kill` - Kill switch activation

**Development Token:** `dev-test-token-12345` (automatically configured for localhost)

**Production:** Set `ADMIN_TOKEN` environment variable and update dashboard authentication.

---

## Configuration

### Backend (.env)

```bash
# Server
PORT=3000
LOG_LEVEL=info

# CORS - Allow dashboard origin
ALLOWED_ORIGINS=http://localhost:8080,http://localhost:3000

# Admin Token - REQUIRED for protected endpoints
ADMIN_TOKEN=your-secure-random-token-here

# Trading Mode
LIVE_TRADING=false
COMPLIANCE_ACCEPTED=false
```

### Frontend (dashboard.js)

For production, update the `getAdminToken()` function:

```javascript
const getAdminToken = () => {
  // Use secure authentication flow in production
  // e.g., OAuth, session tokens, etc.
  return yourAuthenticationMethod();
};
```

---

## Troubleshooting

### Dashboard Shows Disconnected Status

**Symptom:** Status dots show red, data not loading

**Cause:** Backend not running or CORS not configured

**Solution:**
1. Check backend is running: `curl http://localhost:3000/health`
2. Verify CORS: Check `ALLOWED_ORIGINS` includes dashboard URL
3. Check browser console for CORS errors

### 401 Unauthorized Errors

**Symptom:** Dashboard loads but shows 401 errors for /status, /state endpoints

**Cause:** Admin token not configured or incorrect

**Solution:**
1. Set `ADMIN_TOKEN` in backend .env file
2. Update `getAdminToken()` in dashboard.js if needed
3. Restart backend server

### Auto-Refresh Not Working

**Symptom:** Dashboard shows stale data

**Cause:** Auto-refresh interval may have stopped

**Solution:**
1. Refresh the browser page
2. Check browser console for JavaScript errors
3. Verify backend is responding: `curl http://localhost:3000/health`

### Data Shows Zeros

**Symptom:** All metrics show 0 or "Not connected"

**Cause:** Bot not fully initialized (expected for first run without wallet/markets configured)

**Solution:**
1. Configure `TOKEN_IDS` in .env to watch specific markets
2. Configure `PRIVATE_KEY` for live trading (paper mode doesn't require it)
3. Restart backend to pick up configuration changes

---

## Security Best Practices

1. **Never expose admin tokens** in frontend code in production
2. **Use HTTPS** for production deployments
3. **Restrict CORS origins** to specific domains (never use '*' in production)
4. **Implement proper authentication** (OAuth, JWT, etc.) instead of hardcoded tokens
5. **Use secure WebSockets** (wss://) for real-time features (future)
6. **Enable rate limiting** to prevent API abuse
7. **Monitor access logs** for suspicious activity

---

## Performance

- **Auto-refresh interval:** 5 seconds (configurable)
- **Event feed:** Keeps last 100 events
- **Log viewer:** Keeps last 500 logs
- **Alert history:** Keeps last 50 alerts
- **Memory footprint:** ~2-3MB client-side
- **Network usage:** ~5-10 KB per refresh cycle

---

## Browser Compatibility

**Tested and supported:**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

**Features requiring modern browsers:**
- CSS Grid Layout
- Fetch API
- ES6+ JavaScript
- CSS Custom Properties

---

## Future Enhancements

Planned features for future releases:

1. **WebSocket Integration** - Real-time data push instead of polling
2. **Learning System UI** - Full integration with experiment management
3. **Advanced Charting** - Price charts, PnL graphs, performance analytics
4. **Mobile App** - Native iOS/Android applications
5. **Multi-User Support** - User roles and permissions
6. **Alerts Configuration** - Custom alert rules and thresholds
7. **Export/Import** - Configuration backup and restore
8. **Dark/Light Theme Toggle** - User preference for theme

---

## Related Documentation

- [UI Recommendations](../REPORTS/UI_RECOMMENDATIONS.md) - Complete UI/UX documentation
- [Architecture](./ARCHITECTURE.md) - System architecture overview
- [API Reference](./api-missing-endpoints-analysis.md) - Backend API endpoints
- [Security](./SECURITY.md) - Security best practices (if available)

---

## Support

For issues or questions:

1. Check [Common Pitfalls](./ai/common-pitfalls.md)
2. Review [Troubleshooting Guide](./TROUBLESHOOTING.md) (if available)
3. Open an issue on GitHub with:
   - Dashboard version
   - Browser and version
   - Screenshot of issue
   - Browser console logs
   - Backend logs (if relevant)

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-07  
**Maintained By:** Polymarket Bot Development Team
