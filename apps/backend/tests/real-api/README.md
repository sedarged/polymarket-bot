# Real API Tests

This directory contains real API integration tests for the Polymarket Trading Bot. These tests are designed to verify functionality against the actual Polymarket API endpoints.

## Test Types

### Read-Only Tests (`read-only.spec.ts`)

**Purpose:** Verify that public API endpoints are accessible and return expected data structures.

**Safety:** These tests perform only read operations and can be run automatically in CI/CD.

**Requirements:**
- Optional: `POLYMARKET_API_KEY_READONLY` (if API requires authentication)
- Optional: `POLYMARKET_API_SECRET_READONLY` (if API requires authentication)
- Optional: `POLYMARKET_API_BASE` (defaults to `https://gamma-api.polymarket.com`)

**Usage:**
```bash
# From repo root
npm run --workspace @polymarket/backend test:real-readonly

# Or from apps/backend
npm run test:real-readonly
```

### Write Tests (`write.spec.ts`)

**Purpose:** Test write operations like order creation and cancellation against the real API.

**Safety:** These tests are GATED by safety checks and require explicit authorization.

**Requirements (ALL must be set):**
- `LIVE_TRADING=true`
- `COMPLIANCE_ACCEPTED=true`
- `FORCE_REAL_TEST=true`
- `POLYMARKET_API_KEY_WRITE` (write-enabled API key)
- `POLYMARKET_API_SECRET_WRITE` (write-enabled API secret)
- Optional: `ALLOWED_TEST_RUNNERS` (comma-separated list of authorized users/hosts)

**Usage:**
```bash
# Set all required environment variables first!
export LIVE_TRADING=true
export COMPLIANCE_ACCEPTED=true
export FORCE_REAL_TEST=true
export POLYMARKET_API_KEY_WRITE=your_key
export POLYMARKET_API_SECRET_WRITE=your_secret

# Then run the tests
npm run --workspace @polymarket/backend test:real-write
```

⚠️ **WARNING:** Write tests perform REAL operations that may affect your account state, balances, and positions. Only run when explicitly authorized.

## Safety Check Script

The safety-check script (`scripts/safety-check.js`) enforces safety gates before write operations:

```bash
# Check read permissions (always passes)
node scripts/safety-check.js --action=read

# Check write permissions (requires all gates)
node scripts/safety-check.js --action=write
```

The script verifies:
1. `LIVE_TRADING=true` - Confirms intent to use live trading
2. `COMPLIANCE_ACCEPTED=true` - Acknowledges compliance responsibilities
3. `FORCE_REAL_TEST=true` - Explicitly enables real API tests
4. `ALLOWED_TEST_RUNNERS` - Optional whitelist of authorized runners

## CI/CD Integration

### Automated Read-Only Tests

The workflow `.github/workflows/real-api-tests.yml` automatically runs read-only tests on:
- Every push to any branch
- Every pull request to main

These tests use read-only secrets if configured:
- `POLYMARKET_API_KEY_READONLY`
- `POLYMARKET_API_SECRET_READONLY`

### Manual Write Tests

Write tests can only be triggered manually via workflow_dispatch:

1. Go to Actions tab in GitHub
2. Select "Real API Tests" workflow
3. Click "Run workflow"
4. Enable "Run write tests" checkbox
5. Click "Run workflow"

Required secrets for write tests:
- `LIVE_TRADING=true`
- `COMPLIANCE_ACCEPTED=true`
- `FORCE_REAL_TEST=true`
- `POLYMARKET_API_KEY_WRITE`
- `POLYMARKET_API_SECRET_WRITE`
- Optional: `ALLOWED_TEST_RUNNERS`

## Test Status

### Read-Only Tests
- ✅ Test infrastructure complete
- ✅ Smoke tests for market data
- ✅ API connectivity verification
- ✅ Rate limiting behavior checks

### Write Tests
- ✅ Safety gating implemented
- ✅ Test framework complete
- ⚠️ **Placeholder tests** - actual order operations not yet implemented

The write tests currently contain placeholders that verify safety gates work correctly but do not perform actual order operations. To implement real write tests:

1. Import the CLOB client
2. Create test orders with minimal size
3. Verify order acceptance
4. Cancel test orders
5. Verify cancellation

## Development Container

A devcontainer configuration is provided in `.devcontainer/` for Codespaces and VS Code Remote Containers:

- Node 20 LTS
- Pre-configured VS Code extensions (TypeScript, ESLint, Vitest, etc.)
- Automatic dependency installation on container creation
- Port forwarding for local development

To use:
1. Open repository in GitHub Codespaces, or
2. Open in VS Code with Remote Containers extension

## Environment Variables

All environment variables are documented in `.env.example` at the repository root.

### Trading Gates
```bash
LIVE_TRADING=false              # Must be 'true' for write operations
COMPLIANCE_ACCEPTED=false       # Must be 'true' to acknowledge compliance
```

### Real API Testing
```bash
FORCE_REAL_TEST=false           # Must be 'true' to run write tests
ALLOWED_TEST_RUNNERS=           # Optional: comma-separated list of allowed runners

# Read-only API credentials (for automated CI/CD)
POLYMARKET_API_KEY_READONLY=
POLYMARKET_API_SECRET_READONLY=

# Write API credentials (for authorized manual testing)
POLYMARKET_API_KEY_WRITE=
POLYMARKET_API_SECRET_WRITE=
```

## Best Practices

1. **Never commit secrets** - Use `.env` files locally, secrets in CI/CD
2. **Use read-only keys for automation** - Minimize risk in CI/CD pipelines
3. **Use write keys sparingly** - Only for authorized manual testing
4. **Test in order** - Run read-only tests first to verify connectivity
5. **Monitor write tests** - Always review logs after running write tests
6. **Clean up test orders** - Ensure test orders are cancelled after tests

## Troubleshooting

### Read-Only Tests Failing

```
Error: getaddrinfo ENOTFOUND gamma-api.polymarket.com
```

**Cause:** No network access to Polymarket API (expected in some environments)

**Solution:** This is expected in sandboxed environments. In production CI/CD, ensure outbound HTTPS is allowed.

### Write Tests Not Running

```
[Safety Check] ❌ SAFETY CHECK FAILED
```

**Cause:** One or more safety gates not set

**Solution:** Set all required environment variables:
```bash
export LIVE_TRADING=true
export COMPLIANCE_ACCEPTED=true
export FORCE_REAL_TEST=true
```

### Runner Not Allowed

```
[Safety Check] ❌ Current runner not allowed
```

**Cause:** `ALLOWED_TEST_RUNNERS` is set and current user/hostname not in list

**Solution:** Add your username or hostname to `ALLOWED_TEST_RUNNERS`:
```bash
export ALLOWED_TEST_RUNNERS="your-username,your-hostname"
```

## Related Documentation

- [Safety & Compliance](../../docs/paper-trading.md) - Paper trading and safety guidelines
- [Testing Guide](../../docs/testing.md) - Overall testing strategy
- [CI/CD Automation](../../docs/automation.md) - Automation and workflows
- [Agent Guidelines](../../AGENTS.md) - Guidelines for AI agents

## Future Enhancements

Potential improvements:
1. Implement actual order operations in write tests
2. Add WebSocket connection tests
3. Add historical data query tests
4. Add Gamma API endpoint coverage tests
5. Add performance/load tests
6. Add test data cleanup utilities
7. Add test result archiving
8. Add test metrics collection
