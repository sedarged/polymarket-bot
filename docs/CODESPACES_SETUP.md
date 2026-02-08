# GitHub Codespaces Setup Guide

This guide provides instructions for setting up GitHub Codespaces for full testing of the Polymarket bot, including all features, secret management methods, and trading workflows.

## Overview

GitHub Codespaces provides a complete development environment in the cloud, allowing you to test the bot without local setup. This guide ensures all features can be tested safely using fake/test credentials.

## Prerequisites

- GitHub account with Codespaces access
- Repository cloned or forked to your account
- Basic understanding of environment variables and secrets

## 1. Codespaces Secrets Configuration

GitHub Codespaces allows you to configure encrypted secrets that are automatically injected into your development environment. These secrets are encrypted and never exposed in logs or UI.

### Setting Up Codespaces Secrets

1. Go to your GitHub repository settings
2. Navigate to **Secrets and variables** → **Codespaces**
3. Click **New repository secret** for each of the following:

### Required Test Secrets

**IMPORTANT:** Use fake/test values for all secrets. Never use real production credentials in Codespaces.

#### AWS Secrets Manager (Method 3)
```
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

#### Azure Key Vault (Method 5)
```
AZURE_CLIENT_ID=12345678-1234-1234-1234-123456789012
AZURE_CLIENT_SECRET=test-secret-value-not-real
AZURE_TENANT_ID=87654321-4321-4321-4321-210987654321
```

#### HashiCorp Vault (Method 4)
```
VAULT_TOKEN=hvs.test_fake_token_for_development
```

#### Encrypted Private Key (Method 2)
```
ENCRYPTION_KEY=test-passphrase-for-encryption
```

#### Telegram Alerting
```
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz-FAKE-TOKEN
TELEGRAM_CHAT_ID=123456789
```

#### Test Private Key
```
PRIVATE_KEY=0000000000000000000000000000000000000000000000000000000000000001
```
**Note:** This is a test private key. Never use a real private key with funds.

## 2. Codespaces Environment Variables

Environment variables can be set at the repository or user level for Codespaces.

### Setting Up Environment Variables

1. Go to **Settings** → **Secrets and variables** → **Codespaces**
2. Click on the **Variables** tab
3. Add the following variables:

### Core API Configuration
```
GAMMA_API_URL=https://gamma-api.polymarket.com
CLOB_API_URL=https://clob.polymarket.com
DATA_API_URL=https://data-api.polymarket.com
WS_MARKET_URL=wss://ws-subscriptions-clob.polymarket.com/ws/market
```

### Trading Configuration
```
TOKEN_IDS=
LIVE_TRADING=false
COMPLIANCE_ACCEPTED=false
LOG_LEVEL=info
PORT=3000
CHAIN_ID=137
```

### Server Configuration
```
ADMIN_TOKEN=test-admin-token-for-development
ALLOWED_ORIGINS=*
```

### Secret Management Configuration
```
SECRET_SOURCE=env
AWS_SECRET_NAME=polymarket-bot/private-key
AWS_REGION=us-east-1
VAULT_ADDR=https://vault.example.com
VAULT_PATH=secret/data/polymarket
AZURE_KEY_VAULT_NAME=my-test-keyvault
AZURE_SECRET_NAME=polymarket-private-key
```

### Retry Configuration
```
RETRY_ATTEMPTS=3
RETRY_DELAY=1000
RETRY_TOTAL_TIMEOUT=300000
```

### Paper Trading Configuration
```
PAPER_TRADING_SLIPPAGE=0.01
PAPER_TRADING_MAX_SLIPPAGE=0.05
PAPER_TRADING_FEE_RATE=0.002
PAPER_TRADING_PARTIAL_FILL_RATE=0.0
PAPER_TRADING_MIN_FILL_RATIO=0.1
PAPER_TRADING_MAX_FILL_RATIO=0.9
```

### Risk Management Configuration
```
RISK_MAX_EXPOSURE_PER_MARKET=1000
RISK_MAX_OPEN_ORDERS=50
RISK_MAX_DRAWDOWN=0.20
RISK_ERROR_RATE_THRESHOLD=0.10
RISK_ERROR_RATE_WINDOW=100
```

### Circuit Breaker Configuration
```
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_RESET_TIMEOUT_MS=60000
CIRCUIT_BREAKER_SUCCESS_THRESHOLD=2
```

### Rate Limiting Configuration
```
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_TRUST_PROXY=false
```

### Reconciliation Configuration
```
RECONCILIATION_INTERVAL_SECONDS=300
```

### Alerting Configuration
```
ALERT_ERROR_RATE_THRESHOLD=5
ALERT_CIRCUIT_BREAKER_TRIPS=1
```

### Learning System Configuration
```
LEARNING_SYSTEM_ENABLED=false
EVENT_STORE_PATH=./data/events.db
SIGNAL_CATALOG_PATH=./data/signals.db
BACKTEST_ENGINE_PATH=./data/backtests.db
PROMOTION_WORKFLOW_PATH=./data/promotions.db
BANDIT_ALGORITHM=epsilon-greedy
BANDIT_EXPLORATION_FACTOR=0.1
BANDIT_MIN_TRADE_COUNT=10
```

### Metrics Configuration
```
METRICS_ENABLED=true
METRICS_ENDPOINT=/metrics
```

### WebSocket Configuration
```
WS_RECONNECT_DELAY=1000
WS_MAX_RECONNECT_ATTEMPTS=Infinity
WS_HEARTBEAT_INTERVAL=30000
```

## 3. Using .env File (Alternative)

If you prefer not to use Codespaces secrets, you can create a `.env` file in the root directory when your Codespace starts:

```bash
cp .env.example .env
# Edit .env with your test values
```

**Remember:** Never commit `.env` files to the repository.

## 4. Testing the Setup

Once your Codespace is running with all secrets and variables configured:

### 4.1. Install Dependencies
```bash
npm install
```

### 4.2. Verify Configuration
```bash
npm run dev
```

### 4.3. Test Market Data
```bash
npm run markets
```

### 4.4. Test Order Book
```bash
npm run book
```

### 4.5. Run Tests
```bash
npm test
```

### 4.6. Test Secret Management Methods

Test each secret source individually by changing the `SECRET_SOURCE` environment variable:

#### Test Environment Variable Source (Default)
```bash
SECRET_SOURCE=env npm run dev
```

#### Test Encrypted Source
```bash
SECRET_SOURCE=encrypted npm run dev
```

#### Test AWS Source (will fail gracefully with fake credentials)
```bash
SECRET_SOURCE=aws npm run dev
```

#### Test Vault Source (will fail gracefully with fake credentials)
```bash
SECRET_SOURCE=vault npm run dev
```

#### Test Azure Source (will fail gracefully with fake credentials)
```bash
SECRET_SOURCE=azure npm run dev
```

## 5. Testing Features

### 5.1. Paper Trading
Paper trading is enabled by default and safe to test:
```bash
LIVE_TRADING=false COMPLIANCE_ACCEPTED=false npm run dev
```

### 5.2. WebSocket Connections
Test WebSocket connectivity and reconnection:
```bash
# Start the server and observe WebSocket logs
npm run dev
```

### 5.3. Risk Management
Test risk limits with paper trading:
```bash
# Risk limits are enforced automatically
npm run dev
```

### 5.4. Metrics and Alerting
Test Prometheus metrics endpoint:
```bash
# Start server
npm run dev

# In another terminal, check metrics
curl http://localhost:3000/metrics
```

### 5.5. Learning System
Test the learning system components:
```bash
LEARNING_SYSTEM_ENABLED=true npm run dev
```

### 5.6. Circuit Breaker
Test circuit breaker behavior by simulating failures (requires code modification or test suite).

### 5.7. Reconciliation
Test periodic reconciliation:
```bash
RECONCILIATION_INTERVAL_SECONDS=60 npm run dev
```

## 6. Security Best Practices

### DO:
✅ Use fake/test credentials for all secrets
✅ Keep `LIVE_TRADING=false` at all times
✅ Use paper trading mode for all testing
✅ Test all secret management methods
✅ Verify alerting and monitoring features
✅ Test WebSocket reconnection scenarios

### DON'T:
❌ Never use real private keys with funds
❌ Never enable live trading in Codespaces
❌ Never commit `.env` files
❌ Never share your Codespace secrets
❌ Never test with production credentials
❌ Never bypass trading gates

## 7. Troubleshooting

### Secrets Not Loading
- Verify secrets are set in repository settings
- Restart the Codespace after adding new secrets
- Check the Codespace logs for errors

### Environment Variables Not Working
- Ensure variables are set in the correct scope (repository vs. user)
- Variables take effect on Codespace creation/restart
- Check for typos in variable names

### Cannot Start Server
- Check for port conflicts
- Verify all required environment variables are set
- Check logs for configuration errors

### Tests Failing
- Ensure all dependencies are installed
- Check that test database paths are writable
- Verify network connectivity for API tests

## 8. CI/CD Testing

The same environment variables and secrets can be configured for GitHub Actions:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add secrets and variables following the same pattern
3. CI workflows will automatically use these values

## 9. Local Development

For local development without Codespaces:

1. Copy `.env.example` to `.env`
2. Fill in test values for required variables
3. Run `npm install`
4. Run `npm run dev`

## 10. Additional Resources

- [Environment Variables Documentation](./environment.md)
- [Security Guide](./security.md)
- [Paper Trading Guide](./paper-trading.md)
- [Development Workflow](./DEV_WORKFLOW.md)
- [Troubleshooting Guide](./troubleshooting.md)

## 11. Support

If you encounter issues setting up Codespaces:

1. Check the [Troubleshooting Guide](./troubleshooting.md)
2. Review GitHub Codespaces documentation
3. Open an issue with the `codespaces` label
4. Include relevant logs and error messages

## Conclusion

With this setup, you can fully test all features of the Polymarket bot in a safe, isolated environment without risking real funds or exposing production credentials. All trading operations will use paper trading mode, and all secret management methods can be validated with fake credentials.
