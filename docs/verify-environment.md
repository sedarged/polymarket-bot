# Pre-Deployment Environment Verification (GAP-016)

The `verify-environment.sh` script validates all environment variables, credentials, connectivity, and cloud resources before deploying the Polymarket bot to any environment.

## Purpose

This script performs comprehensive pre-deployment checks to:

- Validate all required and optional environment variables
- Check external service connectivity (APIs, WebSocket, cloud services)
- Verify trading gates and compliance settings
- Validate secret management configuration
- Check cloud resource configuration (backups, alerting)
- Identify common configuration issues and security risks

Running this script before deployment helps catch misconfigurations early and ensures smoother deployments.

## Usage

### Basic Usage

```bash
# From repository root
./scripts/verify-environment.sh
```

This checks the `.env` file in the current directory and validates all settings.

### Advanced Usage

```bash
# Check a specific environment file
./scripts/verify-environment.sh --env-file /path/to/.env.production

# Skip connectivity checks (useful for air-gapped environments)
./scripts/verify-environment.sh --skip-connectivity

# Show verbose output including skipped checks
./scripts/verify-environment.sh --verbose

# Combine options
./scripts/verify-environment.sh --env-file .env.staging --verbose
```

### Options

| Option | Description |
|--------|-------------|
| `--env-file PATH` | Path to .env file to validate (default: `.env`) |
| `--skip-connectivity` | Skip external service connectivity checks |
| `--verbose` | Show detailed output for all checks including skipped ones |
| `-h, --help` | Display help message |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All checks passed (with or without warnings) |
| `1` | One or more checks failed - environment is NOT ready |
| `2` | Invalid usage or missing dependencies |

## Check Categories

### 1. Prerequisites

Validates that required tools are available:

- **curl**: Required for connectivity checks
- **jq**: Recommended for JSON validation
- **Node.js**: Required (>= 20.0.0)

### 2. Required Environment Variables

Checks core API URLs that must be set:

- `GAMMA_API_URL` - Gamma API endpoint for market data
- `CLOB_API_URL` - CLOB API endpoint for trading
- `WS_MARKET_URL` - WebSocket endpoint for real-time data

### 3. Trading Gates & Compliance

Validates trading mode and secret management:

- `LIVE_TRADING` and `COMPLIANCE_ACCEPTED` flags
- Secret source configuration (`env`, `encrypted`, `aws`, `vault`, `azure`)
- Required credentials for the selected secret source

**Key Rules:**
- Paper trading is the safe default (`LIVE_TRADING=false`)
- Live trading requires **both** `LIVE_TRADING=true` AND `COMPLIANCE_ACCEPTED=true`
- Each secret source requires specific credentials:
  - `env`: Requires `PRIVATE_KEY`
  - `encrypted`: Requires `ENCRYPTION_KEY` and `ENCRYPTED_PRIVATE_KEY`
  - `aws`: Requires `AWS_SECRET_NAME` and optionally `AWS_REGION`
  - `vault`: Requires `VAULT_ADDR`, `VAULT_TOKEN`, and `VAULT_PATH`
  - `azure`: Requires `AZURE_KEY_VAULT_NAME`, `AZURE_SECRET_NAME`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and `AZURE_TENANT_ID`

### 4. Server Configuration

Validates port numbers and blockchain settings:

- `PORT` - HTTP server port (1-65535)
- `METRICS_PORT` - Metrics server port (dedicated or same as PORT)
- `CHAIN_ID` - Blockchain chain ID (137 = Polygon Mainnet)

### 5. Risk Management

Checks optional risk management settings:

- `RISK_MAX_EXPOSURE_PER_MARKET`
- `RISK_MAX_OPEN_ORDERS`
- `RISK_MAX_DRAWDOWN`

### 6. Circuit Breaker Configuration

Validates circuit breaker settings:

- `CIRCUIT_BREAKER_FAILURE_THRESHOLD`
- `CIRCUIT_BREAKER_RESET_TIMEOUT`

### 7. Rate Limiting

Checks rate limiting configuration:

- `RATE_LIMIT_MAX_REQUESTS`
- `RATE_LIMIT_WINDOW_MS`

### 8. Alerting Configuration

Validates Telegram alerting setup:

- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (both required for alerting)

### 9. Backup Configuration

Validates cloud backup storage settings:

- `BACKUP_STORAGE_TYPE` (s3, gcs, or azure)
- Storage-specific credentials (bucket, region, credentials)

### 10. External Service Connectivity

Tests connectivity to external services (unless `--skip-connectivity` is used):

- **Gamma API**: Validates API is accessible
- **CLOB API**: Validates API is accessible
- **WebSocket endpoint**: Validates DNS resolution
- **Cloud secret managers**: Tests access if live trading is enabled
  - AWS Secrets Manager
  - HashiCorp Vault
  - Azure Key Vault (check not yet implemented)
- **Telegram Bot API**: Tests bot token if configured

### 11. Configuration Validation

Checks for common configuration issues:

- Conflicting settings (e.g., MIN_BALANCE_USDC set but paper trading)
- Heartbeat URL format validation
- Markets config file existence and JSON validity
- Strategy config file existence and JSON validity

### 12. Security Checks

Validates security best practices:

- Checks if `.env` is in `.gitignore`
- Warns about potentially committed secrets
- Validates LOG_LEVEL (warns if `debug` in production)

## Output Format

The script provides color-coded output:

- 🟢 **Green checkmark (✓)**: Check passed
- 🔴 **Red X (✗)**: Check failed - must be fixed before deployment
- 🟡 **Yellow warning (⚠)**: Check passed with warnings - review recommended
- ⚪ **Yellow dash (⊘)**: Check skipped (only shown with `--verbose`)

### Example Output

```
================================================
Pre-Deployment Environment Verification (GAP-016)
================================================

Environment file: .env
Skip connectivity: false

━━━ Prerequisites ━━━
✓ curl is available
✓ jq installed
✓ Node.js v20.11.0 (>= 20.0.0 required)

━━━ Environment File ━━━
✓ Loaded environment from .env

━━━ Required Environment Variables ━━━
✓ GAMMA_API_URL is set and valid: https://gamma-api.polymarket.com
✓ CLOB_API_URL is set and valid: https://clob.polymarket.com
✓ WS_MARKET_URL is set and valid: wss://ws-subscriptions-clob.polymarket.com/ws/market

━━━ Trading Gates & Compliance ━━━
✓ LIVE_TRADING=false (paper trading mode - safe default)

━━━ Server Configuration ━━━
✓ PORT=3000 (valid port number)
✓ METRICS_PORT=9090 (valid port number)
✓ METRICS_PORT=9090 (dedicated metrics port)
✓ CHAIN_ID=137 (Polygon Mainnet)

...

━━━ Summary ━━━

Total checks: 45
Passed: 42
Failed: 0
Warnings: 3

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠ Environment verification PASSED with warnings
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Environment is ready for deployment, but review warnings above.
```

## Integration with CI/CD

This script can be integrated into your CI/CD pipeline to automatically validate configuration before deployment.

### GitHub Actions Example

```yaml
name: Pre-Deployment Verification

on:
  push:
    branches: [main, staging, production]

jobs:
  verify-environment:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Create .env from secrets
        run: |
          echo "GAMMA_API_URL=${{ secrets.GAMMA_API_URL }}" >> .env
          echo "CLOB_API_URL=${{ secrets.CLOB_API_URL }}" >> .env
          echo "WS_MARKET_URL=${{ secrets.WS_MARKET_URL }}" >> .env
          # Add other secrets...
      
      - name: Verify environment
        run: ./scripts/verify-environment.sh --skip-connectivity
```

### Docker Deployment

Add to your Dockerfile or startup script:

```dockerfile
# Verify environment before starting
RUN chmod +x ./scripts/verify-environment.sh && \
    ./scripts/verify-environment.sh --env-file .env.production

# Start application
CMD ["npm", "start"]
```

Or in your startup script:

```bash
#!/bin/bash
# startup.sh

echo "Verifying environment configuration..."
./scripts/verify-environment.sh || exit 1

echo "Starting Polymarket bot..."
npm start
```

## Relationship to Other Scripts

This script complements other verification scripts:

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `verify-environment.sh` | **Pre-deployment** environment validation | Before deploying (checks config) |
| `verify-pre-deploy.sh` | Runtime health checks | After deployment (checks running service) |
| `verify-deployment.sh` | Docker/deployment validation | During deployment (checks containers) |
| `verify-infrastructure.sh` | IaC validation | Before provisioning infrastructure |

**Recommended Workflow:**

1. **Before deployment**: Run `verify-environment.sh` to validate configuration
2. **During deployment**: Run `verify-deployment.sh` to validate containers/services
3. **After deployment**: Run `verify-pre-deploy.sh` to validate running application
4. **Before infrastructure changes**: Run `verify-infrastructure.sh` to validate IaC

## Troubleshooting

### Failed Checks

If the script reports failed checks:

1. **Review the error messages** - They indicate which variables are missing or invalid
2. **Check the reference files**:
   - `.env.example` - Complete list of all variables with examples
   - `docs/ENV_VARIABLE_REFERENCE.md` - Detailed documentation for each variable
3. **Fix the issues** in your `.env` file
4. **Re-run the script** to verify the fixes

### Common Issues

#### "Required environment variable not set"

**Cause**: A required variable (GAMMA_API_URL, CLOB_API_URL, WS_MARKET_URL) is missing.

**Solution**: Add the variable to your `.env` file. See `.env.example` for the default values.

#### "COMPLIANCE_ACCEPTED must be true when LIVE_TRADING=true"

**Cause**: Attempting to enable live trading without compliance acceptance.

**Solution**: Only set `COMPLIANCE_ACCEPTED=true` after reviewing compliance requirements. For testing, keep `LIVE_TRADING=false` (paper trading).

#### "Secret source credentials missing"

**Cause**: Selected a secret source (aws, vault, azure, encrypted) but didn't provide required credentials.

**Solution**: Either:
- Provide all required credentials for the selected secret source
- Use `SECRET_SOURCE=env` and set `PRIVATE_KEY` (for development only)
- Keep `LIVE_TRADING=false` (no credentials needed for paper trading)

#### "External service not accessible"

**Cause**: Cannot connect to Gamma API, CLOB API, or other external services.

**Solution**:
- Check your network connectivity
- Verify the URLs are correct
- If behind a firewall, ensure the endpoints are accessible
- Use `--skip-connectivity` flag to skip these checks if deploying to a restricted environment

### Warnings

Warnings don't prevent deployment but should be reviewed:

- **"Telegram partially configured"**: Set both bot token and chat ID or remove both
- **"LOG_LEVEL=debug"**: Consider using `info` or `warn` in production for better performance
- **"PRIVATE_KEY appears to be set in .env"**: Ensure `.env` is in `.gitignore` and never committed

## See Also

- [Pre-Deployment Verification Checklist](./pre-deployment-verification.md) - Manual checklist
- [Environment Variable Reference](./ENV_VARIABLE_REFERENCE.md) - Complete variable documentation
- [Security Best Practices](./security.md) - Security guidelines
- [Scripts README](../scripts/README.md) - Overview of all scripts
