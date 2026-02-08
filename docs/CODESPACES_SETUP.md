# GitHub Codespaces Setup Guide

Complete guide for setting up and using GitHub Codespaces to test and develop the Polymarket Trading Bot.

## Overview

GitHub Codespaces provides a complete, cloud-based development environment for the Polymarket bot with:

- ✅ **One-click setup** - No local installation required
- 🐳 **Consistent environment** - Node.js 20, all dependencies pre-installed
- 🚀 **Fast testing** - Start coding in seconds
- 🔐 **Secure secrets** - GitHub-managed environment variables
- 📊 **Pre-configured ports** - Backend API (3000) and Frontend Dashboard (8080) automatically forwarded
- 🛠️ **Full toolchain** - TypeScript, testing, linting all ready to go

**Perfect for:**
- AI agents testing changes
- Quick bug fixes and patches
- Exploring the codebase
- Testing API integrations
- Paper trading experiments

## Quick Start

### 1. Create a Codespace

**From GitHub UI:**
1. Navigate to the repository on GitHub
2. Click the green **Code** button
3. Select **Codespaces** tab
4. Click **Create codespace on [branch]**

**From your PR:**
1. Open your Pull Request
2. Click **Code** → **Codespaces**
3. Create codespace from PR branch

The setup script runs automatically and installs dependencies, builds the project, and creates your `.env` file.

### 2. Verify Setup

Once the Codespace loads:

```bash
# Check that dependencies are installed
ls node_modules

# Verify build completed
ls apps/backend/dist

# Check .env was created
ls -la .env
```

### 3. Run Basic Tests

```bash
# Run all tests
npm test

# Build the project
npm run build

# Fetch markets
npm run markets -- --limit 5

# Start backend server
npm run dev
```

### 4. Access the Dashboard

```bash
# In Terminal 1: Start backend (if not already running)
npm run dev

# In Terminal 2: Start frontend
cd apps/frontend
npm run dev
```

Then click the **Ports** tab in VS Code and open the forwarded URL for port 8080.

## Environment Configuration

### Default Configuration

The `.env.codespaces.example` file provides safe defaults:

- ✅ **Paper trading mode** (`LIVE_TRADING=false`)
- ✅ **Debug logging** (`LOG_LEVEL=debug`)
- ✅ **Relaxed rate limits** (for testing)
- ✅ **CORS open** (`ALLOWED_ORIGINS=*` - safe for Codespaces)
- ⚠️ **No admin token** (sensitive endpoints return 401)

### Setting Secrets via GitHub

For full functionality, set secrets in GitHub:

#### Option 1: Repository Secrets (Recommended)

1. Go to **Repository → Settings → Secrets and variables → Codespaces**
2. Click **New repository secret**
3. Add the following secrets:

**Required for admin endpoints:**
- **Name:** `ADMIN_TOKEN`
- **Value:** Generate with `openssl rand -hex 32`

**Optional for live trading testing:**
- **Name:** `PRIVATE_KEY`
- **Value:** Test wallet private key only! Never use real funds.

4. Restart your Codespace to pick up the secrets

#### Option 2: User Secrets (Personal)

Secrets set at the user level apply to all your Codespaces:
1. Go to **Your profile → Settings → Codespaces**
2. Manage secrets under **Codespaces secrets**

### Customizing .env

Edit `.env` directly in Codespaces for testing:

```bash
# Edit environment variables
nano .env

# Or use VS Code
code .env
```

**Important:** Changes to `.env` in Codespaces are NOT committed (it's gitignored).

## Testing Checklist

### ✅ Basic Setup Tests

```bash
# 1. Build passes
npm run build

# 2. All tests pass
npm test

# 3. Backend starts
npm run dev
# Expected: Server running on port 3000
```

### ✅ Backend API Tests

With backend running (`npm run dev`), test endpoints:

```bash
# Public endpoints (no auth required)
curl http://localhost:3000/health
curl http://localhost:3000/ready
curl http://localhost:3000/metrics
curl http://localhost:3000/orderbooks
curl http://localhost:3000/feed/status

# Admin endpoints (require ADMIN_TOKEN)
# Set your token first:
export ADMIN_TOKEN="your_token_from_github_secrets"

curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/status
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/state
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/orders
```

### ✅ Frontend Dashboard Access

```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Frontend
cd apps/frontend
npm run dev
```

1. Go to **Ports** tab in VS Code
2. Find port **8080** (Frontend Dashboard)
3. Click the **Open in Browser** icon
4. Verify dashboard loads and shows "PAPER TRADING" mode

### ✅ Paper Trading Verification

Verify the bot is in safe paper trading mode:

1. Check `.env`: `LIVE_TRADING=false`
2. Check dashboard: "PAPER TRADING" banner visible
3. Test status endpoint:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/status
# Expected: "live_trading": false
```

### ✅ Port Forwarding Verification

1. Click **Ports** tab in VS Code
2. Verify both ports are forwarded:
   - **3000** - Backend API (public or private)
   - **8080** - Frontend Dashboard (public or private)
3. Ports should auto-forward and show visibility status

## Manual GitHub Setup

### Setting Up Admin Token

**1. Generate a secure token:**
```bash
# In Codespaces terminal
openssl rand -hex 32
```

**2. Add to GitHub Secrets:**
- Go to **Repository → Settings → Secrets and variables → Codespaces**
- Click **New repository secret**
- Name: `ADMIN_TOKEN`
- Value: Paste the generated token
- Click **Add secret**

**3. Restart Codespace:**
- Close the current Codespace
- Create a new one or rebuild container

**4. Verify:**
```bash
# Check the env var is available
echo $ADMIN_TOKEN

# Test admin endpoint
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/status
```

### Setting Up Test Wallet (Optional)

⚠️ **WARNING:** Only use test wallets with minimal funds for testing!

**1. Export private key from MetaMask:**
- Open MetaMask
- Select account → Account details → Export private key
- Enter password and copy key

**2. Create test wallet (recommended):**
- Create a NEW wallet specifically for testing
- Fund with small amount of test USDC on Polygon
- Export private key

**3. Add to GitHub Secrets:**
- Name: `PRIVATE_KEY`
- Value: `0x...your_test_wallet_key`

**4. Update .env for live trading testing:**
```env
LIVE_TRADING=true
COMPLIANCE_ACCEPTED=true
```

## Security Best Practices

### ⛔ Never Do This

- ❌ Never commit `.env` files to git
- ❌ Never hardcode secrets in code
- ❌ Never use real wallets with significant funds
- ❌ Never share your `ADMIN_TOKEN` or `PRIVATE_KEY`
- ❌ Never push credentials to GitHub

### ✅ Always Do This

- ✅ Use GitHub Codespaces Secrets for sensitive data
- ✅ Use paper trading mode by default
- ✅ Use dedicated test wallets with minimal funds
- ✅ Rotate tokens regularly
- ✅ Review `.gitignore` to ensure secrets are excluded
- ✅ Set `ALLOWED_ORIGINS` to specific domains in production

### Codespaces-Specific Security

- 🔒 Codespaces are **private by default** - only you can access them
- 🔒 Environment variables from GitHub Secrets are **encrypted** in transit
- 🔒 Port forwarding is **private by default** (requires authentication)
- 🔒 Codespaces are **automatically deleted** after inactivity (configurable)

**Port Visibility:**
- **Private:** Requires GitHub authentication to access
- **Public:** Anyone with the URL can access (use with caution)

To change port visibility:
1. Go to **Ports** tab
2. Right-click port → **Port Visibility** → Choose Private or Public

## Troubleshooting

### Port Forwarding Issues

**Problem:** Can't access backend or dashboard

**Solution:**
```bash
# Check ports are listening
netstat -tuln | grep -E '3000|8080'

# Manually start services
npm run dev                      # Backend on 3000
cd apps/frontend && npm run dev  # Frontend on 8080

# Check Ports tab in VS Code
# Verify ports are forwarded and visibility is set correctly
```

### Build Errors

**Problem:** `npm run build` fails with TypeScript errors

**Solution:**
```bash
# Check docs/environment.md for known issues
cat docs/environment.md

# Known pre-existing errors are documented
# If your changes introduce NEW errors, fix them

# Check specific error details
npm run build 2>&1 | less
```

### Environment Variable Not Found

**Problem:** `ADMIN_TOKEN` or other secrets not available

**Solution:**
```bash
# 1. Verify secret is set in GitHub
# Go to Repository → Settings → Codespaces → Secrets

# 2. Rebuild container to pick up new secrets
# Command Palette (Ctrl+Shift+P) → "Codespaces: Rebuild Container"

# 3. Or restart Codespace
# Close and create new Codespace

# 4. Verify in terminal
env | grep ADMIN_TOKEN
```

### Dependencies Not Installed

**Problem:** `node_modules` missing or outdated

**Solution:**
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

### Tests Failing

**Problem:** `npm test` shows failures

**Solution:**
```bash
# Run tests with verbose output
npm test -- --reporter=verbose

# Run specific test file
npm test -- path/to/test.test.ts

# Check for pre-existing failures
# See docs/environment.md for known test issues

# Run with coverage to see what's tested
npm run test:coverage
```

### Dashboard Not Loading

**Problem:** Frontend shows blank page or errors

**Solution:**
```bash
# 1. Verify backend is running
curl http://localhost:3000/health

# 2. Check backend logs
# Look for errors in terminal running npm run dev

# 3. Verify port 8080 is forwarded
# Ports tab → Check 8080 is listed

# 4. Check browser console for errors
# Open DevTools (F12) → Console tab

# 5. Try different browser or incognito mode
```

### Codespace Running Slow

**Problem:** Codespace is laggy or unresponsive

**Solution:**
- Use **4-core** machine type minimum (Settings → Change machine type)
- Close unused terminals and processes
- Restart Codespace if memory is high
- Consider local development for large changes

## Feature Testing Matrix

| Feature | Command | Expected Result | Notes |
|---------|---------|-----------------|-------|
| **Build** | `npm run build` | Compiles successfully | Pre-existing errors documented |
| **Tests** | `npm test` | All pass (see known issues) | 21 auth tests may fail (pre-existing) |
| **Market Fetch** | `npm run markets -- --limit 5` | Lists 5 markets | Requires internet access |
| **Orderbook** | `npm run book -- --tokenId <ID>` | Shows bid/ask/spread | Use token from markets |
| **Backend Start** | `npm run dev` | Server on port 3000 | Check with curl or browser |
| **Dashboard** | `cd apps/frontend && npm run dev` | Loads on port 8080 | Click port to open |
| **Public API** | `curl http://localhost:3000/health` | `{"status":"ok"}` | No auth required |
| **Admin API** | `curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/status` | Trading status JSON | Requires ADMIN_TOKEN |
| **WebSocket** | Check `/feed/status` endpoint | Shows connection status | Auto-connects on start |
| **Paper Trading** | Dashboard shows "PAPER TRADING" | Safe mode confirmed | Default config |

## Links and References

### Documentation
- [README.md](../README.md) - Project overview and features
- [docs/README.md](./README.md) - Complete documentation index
- [docs/environment.md](./environment.md) - Environment configuration reference
- [docs/security.md](./security.md) - Security best practices and warnings
- [AGENTS.md](../AGENTS.md) - Guidelines for AI agents

### Setup and Configuration
- [.env.example](../.env.example) - Complete environment variable reference
- [.env.codespaces.example](../.env.codespaces.example) - Codespaces-specific defaults
- [.devcontainer/devcontainer.json](../.devcontainer/devcontainer.json) - Container configuration

### Testing and Operations
- [docs/testing.md](./testing.md) - Testing strategy and guidelines
- [docs/runbook.md](./runbook.md) - Operational procedures and incident response
- [docs/troubleshooting.md](./troubleshooting.md) - Common issues and solutions

### API and Architecture
- [docs/architecture.md](./architecture.md) - Technical architecture and data flows
- [docs/api-alignment-verification.md](./api-alignment-verification.md) - API implementation details

## Notes

- **Development/Testing Only:** This setup is NOT for production deployment
- **Ephemeral Environment:** Codespaces are temporary - commit changes to git regularly
- **Resource Limits:** Free tier has limited hours - manage usage carefully
- **Network Access:** Codespaces have full internet access for API calls
- **Auto-sleep:** Inactive Codespaces auto-suspend after 30 minutes (default)

## Getting Help

- **Issues:** Check [STATUS.md](../STATUS.md) for current known issues
- **Troubleshooting:** See [docs/troubleshooting.md](./troubleshooting.md) for detailed guides
- **Questions:** Open an issue on GitHub with the `question` label
- **AI Agents:** Follow guidelines in [AGENTS.md](../AGENTS.md)

---

**Ready to start?** Click **Code** → **Codespaces** → **Create codespace** and begin testing in seconds! 🚀
