# Codespaces Verification Checklist

**MANDATORY FOR ALL PRs AND ISSUE COMPLETIONS**

This checklist enforces real-world testing of all changes using GitHub Codespaces. Every contributor and AI agent must complete this verification before marking any PR as ready for review or any issue as complete.

## Why This Checklist Exists

- ✅ **Prevents "works on my machine" syndrome** - Tests in a standardized environment
- ✅ **Uncovers hidden bugs** - Finds issues missed in local development
- ✅ **Ensures documentation accuracy** - Verifies all documented commands actually work
- ✅ **Drives continuous improvement** - Identifies gaps in tooling and documentation
- ✅ **Increases confidence** - Provides proof that changes work as intended

## When to Use This Checklist

- **Every PR** that includes code changes must complete verification
- **Every issue completion** must include verification proof
- **Documentation changes** should verify all updated examples work
- **Any workflow changes** must be tested end-to-end

## How to Use This Checklist

1. **Create a Codespace** from your branch or PR
2. **Complete all applicable sections** below
3. **Copy terminal output** for proof (commands + results)
4. **Take screenshots** of UI changes
5. **Document any gaps** discovered during verification
6. **Update documentation/scripts** if gaps found
7. **Add evidence to your PR** description

## Quick Start

```bash
# In your Codespace, run these commands to verify basic functionality:
npm install
npm run build
npm test
npm run dev &
curl http://localhost:3000/health
```

---

## SECTION 1: Environment Setup Verification

### 1.1 Dependencies Installation

**Commands:**
```bash
npm install
ls node_modules | wc -l
```

**Expected Result:**
- ✅ No errors during installation
- ✅ `node_modules` directory contains dependencies (100+ packages)

**Proof Required:** Paste output showing successful installation

---

### 1.2 Environment File Creation

**Commands:**
```bash
ls -la .env
cat .env | grep -E "LIVE_TRADING|COMPLIANCE_ACCEPTED|LOG_LEVEL" | head -5
```

**Expected Result:**
- ✅ `.env` file exists
- ✅ `LIVE_TRADING=false` (paper trading mode)
- ✅ `COMPLIANCE_ACCEPTED=false`
- ✅ `LOG_LEVEL` set (debug recommended)

**Proof Required:** Paste output showing env file exists and key variables are set (do NOT paste sensitive values)

---

### 1.3 Node Version Verification

**Commands:**
```bash
node --version
npm --version
```

**Expected Result:**
- ✅ Node.js v20.x or higher
- ✅ npm v10.x or higher

**Proof Required:** Paste version output

---

## SECTION 2: Build & Test Verification

### 2.1 TypeScript Compilation

**Commands:**
```bash
npm run build
echo "Exit code: $?"
```

**Expected Result:**
- ✅ Build completes successfully
- ✅ Exit code 0
- ⚠️ Note: Pre-existing TypeScript errors are documented in `docs/environment.md`

**Proof Required:** Paste build output showing success or document any NEW errors

---

### 2.2 Test Suite Execution

**Commands:**
```bash
npm test
echo "Exit code: $?"
```

**Expected Result:**
- ✅ Test suite runs successfully
- ✅ Most tests pass
- ⚠️ Note: Up to 8 pre-existing test failures are documented in `docs/testing.md`

**Proof Required:** Paste test summary showing pass/fail counts

**Action Required if tests fail:**
- Compare failures to documented pre-existing failures
- If NEW failures appear, investigate and fix before proceeding

---

### 2.3 Test Coverage Report

**Commands:**
```bash
npm run test:coverage
```

**Expected Result:**
- ✅ Coverage report generates successfully
- ✅ Coverage should be >80% overall (documented in `docs/testing.md`)

**Proof Required:** Paste coverage summary (statements, branches, functions, lines percentages)

---

## SECTION 3: CLI Commands Verification

### 3.1 Fetch Markets Command

**Commands:**
```bash
npm run markets -- --limit 5
```

**Expected Result:**
- ✅ Fetches and displays 5 markets
- ✅ Shows market title, token ID, and status
- ✅ No errors or crashes

**Proof Required:** Paste output showing markets listed

---

### 3.2 Order Book Command

**Commands:**
```bash
# First get a token ID from markets command above, then:
npm run book -- --tokenId <TOKEN_ID_FROM_MARKETS>
```

**Expected Result:**
- ✅ Displays bid/ask spread for the token
- ✅ Shows best bid, best ask, and midpoint
- ✅ No errors

**Proof Required:** Paste output showing order book data

---

### 3.3 Help Command

**Commands:**
```bash
npm run dev -- --help
```

**Expected Result:**
- ✅ Displays available commands and options
- ✅ No errors

**Proof Required:** Paste help output

---

## SECTION 4: Backend API Verification

### 4.1 Start Backend Server

**Commands:**
```bash
# Start server in background
npm run dev &
sleep 5
# Verify it's running
curl http://localhost:3000/health
```

**Expected Result:**
- ✅ Server starts on port 3000
- ✅ No startup errors
- ✅ Health endpoint returns `{"status":"ok"}`

**Proof Required:** Paste startup logs and health check response

---

### 4.2 Public Endpoints (No Auth)

**Commands:**
```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
curl http://localhost:3000/metrics | head -20
curl http://localhost:3000/orderbooks
curl http://localhost:3000/feed/status
```

**Expected Result:**
- ✅ `/health` - Returns `{"status":"ok"}`
- ✅ `/ready` - Returns readiness status
- ✅ `/metrics` - Returns Prometheus metrics
- ✅ `/orderbooks` - Returns orderbook data
- ✅ `/feed/status` - Returns WebSocket status

**Proof Required:** Paste response from each endpoint (first 10-20 lines if long)

---

### 4.3 Admin Endpoints (Auth Required)

**Commands:**
```bash
# Set your admin token (get from .env or use test token)
export ADMIN_TOKEN="your_admin_token_here"

curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/status
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/state
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/orders
```

**Expected Result:**
- ✅ `/status` - Returns trading status including `live_trading: false`
- ✅ `/state` - Returns system state
- ✅ `/orders` - Returns empty array or current orders

**Proof Required:** Paste response from each endpoint

**Action Required if 401 errors:**
- Verify `ADMIN_TOKEN` is set in `.env`
- If missing, add to `.env` or set as environment variable

---

## SECTION 5: Frontend Dashboard Verification

### 5.1 Start Frontend Server

**Commands:**
```bash
# In a new terminal (or stop backend with fg + Ctrl+C first)
cd apps/frontend
npm run dev
```

**Expected Result:**
- ✅ Frontend starts on port 8080
- ✅ No build errors
- ✅ Server ready message displayed

**Proof Required:** Paste startup logs showing port 8080 listening

---

### 5.2 Access Dashboard in Browser

**Steps:**
1. Go to **Ports** tab in VS Code
2. Find port **8080** (Frontend Dashboard)
3. Click **Open in Browser** icon
4. Dashboard loads in browser

**Expected Result:**
- ✅ Dashboard loads without errors
- ✅ "PAPER TRADING" banner visible at top
- ✅ Navigation tabs present (Overview, Controls, etc.)
- ✅ No console errors in browser DevTools

**Proof Required:** Screenshot of dashboard showing:
- "PAPER TRADING" banner
- Main navigation
- Any relevant status indicators

---

### 5.3 Dashboard Functionality

**Steps:**
1. Navigate through tabs (Overview, Controls, Alerts, Logs)
2. Verify data loads in each section
3. Check for any errors in browser console (F12)

**Expected Result:**
- ✅ All tabs load successfully
- ✅ Backend API data displays correctly
- ✅ No JavaScript errors in console

**Proof Required:** Screenshot showing multiple tabs or key functionality

---

## SECTION 6: WebSocket Connectivity Verification

### 6.1 WebSocket Connection Status

**Commands:**
```bash
# With backend running:
curl http://localhost:3000/feed/status
```

**Expected Result:**
- ✅ Returns WebSocket connection status
- ✅ Status should be "connected" or "connecting"
- ✅ No error messages

**Proof Required:** Paste WebSocket status response

---

### 6.2 WebSocket Reconnection (Optional)

**Steps:**
1. Check backend logs for WebSocket messages
2. Verify connection established
3. If applicable, test reconnection by simulating disconnect

**Expected Result:**
- ✅ WebSocket connects on startup
- ✅ Reconnects automatically if disconnected
- ✅ Logs show successful connection/reconnection

**Proof Required:** Paste relevant log excerpts showing connection success

---

## SECTION 7: Security Verification

### 7.1 Secret Scan

**Commands:**
```bash
# Check no secrets committed
git log --oneline -10
git diff main | grep -iE "password|secret|key|token" || echo "No secrets found in diff"
```

**Expected Result:**
- ✅ No secrets in git history
- ✅ No secrets in current changes
- ✅ All credentials in `.env` file (which is gitignored)

**Proof Required:** Paste output confirming no secrets found

---

### 7.2 Dependency Audit

**Commands:**
```bash
npm audit --audit-level=high
```

**Expected Result:**
- ✅ No high or critical vulnerabilities
- ⚠️ Moderate/low vulnerabilities are acceptable if documented

**Proof Required:** Paste audit summary

**Action Required if vulnerabilities found:**
- Document any NEW high/critical vulnerabilities
- Create issue to track resolution
- Do NOT merge if introducing new critical vulnerabilities

---

### 7.3 Environment Security Check

**Commands:**
```bash
# Verify paper trading mode
grep "LIVE_TRADING" .env
grep "COMPLIANCE_ACCEPTED" .env
```

**Expected Result:**
- ✅ `LIVE_TRADING=false`
- ✅ `COMPLIANCE_ACCEPTED=false`

**Proof Required:** Paste grep output confirming paper trading mode

---

## SECTION 8: Documentation & Script Improvement

### 8.1 Gaps Discovered

**Document any issues found during verification:**

- [ ] Missing documentation for: _______________
- [ ] Broken command: _______________
- [ ] Unclear instructions: _______________
- [ ] Missing CLI command needed: _______________
- [ ] Missing test needed: _______________

**Action Required:**
- Update documentation immediately
- Create script/CLI command if needed
- Add test if verification gap exists
- Document improvements in PR

---

### 8.2 Documentation Updates Made

**List all documentation files updated:**

- [ ] Updated `docs/___________.md` - Reason: _______________
- [ ] Updated `README.md` - Reason: _______________
- [ ] Updated `.env.example` - Reason: _______________
- [ ] Created new script: ___________ - Purpose: _______________
- [ ] Created new test: ___________ - Purpose: _______________

---

### 8.3 Verification Improvements Suggested

**Suggest improvements to this checklist:**

- Suggestion 1: _______________
- Suggestion 2: _______________

---

## SECTION 9: Final Verification Summary

### 9.1 Checklist Completion Status

**Mark only applicable sections:**

- [ ] Section 1: Environment Setup - COMPLETE
- [ ] Section 2: Build & Test - COMPLETE
- [ ] Section 3: CLI Commands - COMPLETE
- [ ] Section 4: Backend API - COMPLETE
- [ ] Section 5: Frontend Dashboard - COMPLETE (if frontend changes)
- [ ] Section 6: WebSocket - COMPLETE (if WebSocket changes)
- [ ] Section 7: Security - COMPLETE
- [ ] Section 8: Documentation Improvement - COMPLETE (gaps addressed)

### 9.2 Evidence Checklist

- [ ] All terminal output included in PR description
- [ ] Screenshots of UI changes included
- [ ] Documentation gaps documented and addressed
- [ ] New scripts/tests created if needed
- [ ] All verification steps completed successfully

### 9.3 Approval Blockers

**PR CANNOT be approved if any of these are true:**

- [ ] ❌ Checklist not completed
- [ ] ❌ No proof provided
- [ ] ❌ New high/critical vulnerabilities introduced
- [ ] ❌ Documentation gaps not addressed
- [ ] ❌ Tests failing (excluding pre-existing failures)

**PR CAN be approved if:**

- [x] ✅ All applicable sections completed
- [x] ✅ Proof provided for all verification steps
- [x] ✅ Documentation updated for any gaps found
- [x] ✅ Security verification passed
- [x] ✅ Tests passing (or only pre-existing failures)

---

## Quick Command Reference

Copy-paste these commands for fast verification:

```bash
# Complete verification in one go
echo "=== Environment Setup ===" && \
npm install && \
ls -la .env && \
node --version && \
echo "=== Build & Test ===" && \
npm run build && \
npm test && \
echo "=== CLI Commands ===" && \
npm run markets -- --limit 5 && \
echo "=== Backend API ===" && \
npm run dev & \
sleep 5 && \
curl http://localhost:3000/health && \
curl http://localhost:3000/ready && \
echo "=== Security ===" && \
npm audit --audit-level=high && \
echo "=== Paper Trading Verification ===" && \
grep "LIVE_TRADING" .env
```

---

## Related Documentation

- [Codespaces Setup Guide](./CODESPACES_SETUP.md) - How to create and configure Codespaces
- [Development Workflow](./DEV_WORKFLOW.md) - Documentation maintenance requirements
- [Testing Guide](./testing.md) - Test coverage and testing best practices
- [Agent Guidelines](../AGENTS.md) - Guidelines for AI agents
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions

---

## Questions or Issues?

If you encounter issues not covered in this checklist:

1. Check [docs/troubleshooting.md](./troubleshooting.md)
2. Review [docs/CODESPACES_SETUP.md](./CODESPACES_SETUP.md)
3. Check pre-existing issues in [STATUS.md](../STATUS.md)
4. Add a comment to your PR with details
5. Update this checklist with solutions found

---

**Remember:** This verification ensures quality and prevents bugs. Take the time to complete it thoroughly. Your future self (and other contributors) will thank you! 🚀
