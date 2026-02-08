# Environment Variable Coverage Summary

## Overview
This document provides an overview of environment variables used by the Polymarket bot at runtime, plus variables reserved for future use that are not yet wired into the codebase, organized by category.

**Total Variables (including planned):** 50  
**Last Updated:** 2026-02-08  
**Reference:** `.env.example`

---

## 1. Polymarket API Configuration (3 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `GAMMA_API_URL` | `https://gamma-api.polymarket.com` | Yes | Gamma API endpoint for market data |
| `CLOB_API_URL` | `https://clob.polymarket.com` | Yes | CLOB API endpoint for order book & trading |
| `WS_MARKET_URL` | `wss://ws-subscriptions-clob...` | Yes | WebSocket endpoint for real-time market data |

**Note:** The Data API URL is hardcoded in `apps/backend/src/clients/dataApi.ts` and is not configurable via environment variable.

---

## 2. Market Feed Configuration (1 variable)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `TOKEN_IDS` | (empty) | No | Comma-separated list of token IDs to monitor |

---

## 3. Logging (1 variable)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `LOG_LEVEL` | `info` | No | Logging level: error, warn, info, debug |

---

## 4. Trading Gates (2 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `LIVE_TRADING` | `false` | No | Enable live trading (requires COMPLIANCE_ACCEPTED) |
| `COMPLIANCE_ACCEPTED` | `false` | No | Confirm compliance acceptance (required for live trading) |

---

## 5. Server Configuration (2 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | `3000` | No | HTTP server port |
| `CHAIN_ID` | `137` | No | Blockchain chain ID (137 = Polygon Mainnet) |

---

## 6. Secret Management (11 variables - 3 functional, 8 stubbed)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `SECRET_SOURCE` | `env` | No | Secret source: `env`, `encrypted` (functional). `aws`, `vault`, `azure` (stubbed - throw "not implemented") |
| `PRIVATE_KEY` | - | Conditional | Private key (Method 1 - direct env var) |
| `ENCRYPTION_KEY` | - | Conditional | Passphrase for encrypted storage (Method 2) |
| `ENCRYPTED_PRIVATE_KEY` | - | Conditional | Encrypted private key (Method 2) |
| `AWS_SECRET_NAME` | - | Conditional | **(Stubbed)** Intended AWS Secrets Manager secret name. Backend not yet implemented. |
| `AWS_REGION` | - | Conditional | **(Stubbed)** Intended AWS region. Backend not yet implemented. |
| `AWS_ACCESS_KEY_ID` | - | Conditional | **(Stubbed)** Intended AWS access key. Backend not yet implemented. |
| `AWS_SECRET_ACCESS_KEY` | - | Conditional | **(Stubbed)** Intended AWS secret key. Backend not yet implemented. |
| `VAULT_ADDR` | - | Conditional | **(Stubbed)** Intended Vault server address. Backend not yet implemented. |
| `VAULT_TOKEN` | - | Conditional | **(Stubbed)** Intended Vault token. Backend not yet implemented. |
| `VAULT_PATH` | - | Conditional | **(Stubbed)** Intended Vault secret path. Backend not yet implemented. |

**Continued:**

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `AZURE_KEY_VAULT_NAME` | - | Conditional | **(Stubbed)** Intended Azure Key Vault name. Backend not yet implemented. |
| `AZURE_SECRET_NAME` | - | Conditional | **(Stubbed)** Intended Azure secret name. Backend not yet implemented. |
| `AZURE_CLIENT_ID` | - | Conditional | **(Stubbed)** Intended Azure client ID. Backend not yet implemented. |
| `AZURE_CLIENT_SECRET` | - | Conditional | **(Stubbed)** Intended Azure client secret. Backend not yet implemented. |
| `AZURE_TENANT_ID` | - | Conditional | **(Stubbed)** Intended Azure tenant ID. Backend not yet implemented. |

---

## 7. Retry Configuration (3 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `RETRY_ATTEMPTS` | `3` | No | Number of retry attempts |
| `RETRY_DELAY` | `1000` | No | Initial retry delay in milliseconds |
| `RETRY_TOTAL_TIMEOUT` | `300000` | No | Total timeout for all retries (5 minutes) |

---

## 8. Paper Trading Configuration (6 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PAPER_TRADING_SLIPPAGE` | `0.01` | No | Base slippage percentage (1%) |
| `PAPER_TRADING_MAX_SLIPPAGE` | `0.05` | No | Maximum slippage percentage (5%) |
| `PAPER_TRADING_FEE_RATE` | `0.002` | No | Trading fee rate (0.2%) |
| `PAPER_TRADING_PARTIAL_FILL_RATE` | `0.0` | No | Probability of partial fills (0-1) |
| `PAPER_TRADING_MIN_FILL_RATIO` | `0.1` | No | Minimum fill ratio for partial fills |
| `PAPER_TRADING_MAX_FILL_RATIO` | `0.9` | No | Maximum fill ratio for partial fills |

---

## 9. Risk Management (5 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `RISK_MAX_EXPOSURE_PER_MARKET` | `1000` | No | Maximum exposure per market in USD |
| `RISK_MAX_OPEN_ORDERS` | `50` | No | Maximum number of open orders |
| `RISK_MAX_DRAWDOWN` | `0.20` | No | Maximum drawdown percentage (20%) |
| `RISK_ERROR_RATE_THRESHOLD` | `0.10` | No | Error rate threshold (10%) |
| `RISK_ERROR_RATE_WINDOW` | `100` | No | Window size for error rate calculation |

---

## 10. Circuit Breaker (3 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | `5` | No | Failures before opening circuit |
| `CIRCUIT_BREAKER_RESET_TIMEOUT_MS` | `60000` | No | Reset timeout in milliseconds (1 minute) |
| `CIRCUIT_BREAKER_SUCCESS_THRESHOLD` | `2` | No | Successes needed to close circuit |

---

## 11. Admin Authentication (1 variable)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `ADMIN_TOKEN` | (empty) | Conditional | Admin token for sensitive endpoints (required in production) |

---

## 12. CORS Configuration (1 variable)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `ALLOWED_ORIGINS` | `http://localhost:3000` | No | Comma-separated list of allowed origins |

---

## 13. Reconciliation (1 variable)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `RECONCILIATION_INTERVAL_SECONDS` | `300` | No | Reconciliation interval in seconds (5 minutes) |

---

## 14. Rate Limiting (3 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `RATE_LIMIT_MAX_REQUESTS` | `100` | No | Max requests per IP per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | No | Rate limit window in milliseconds (1 minute) |
| `RATE_LIMIT_TRUST_PROXY` | `false` | No | Trust X-Forwarded-For headers |

---

## 15. Alerting Configuration (4 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | - | Conditional | Telegram bot token for alerts |
| `TELEGRAM_CHAT_ID` | - | Conditional | Telegram chat ID for alerts |
| `ALERT_ERROR_RATE_THRESHOLD` | `5` | No | Alert threshold for error rate (5%) |
| `ALERT_CIRCUIT_BREAKER_TRIPS` | `1` | No | Alert after N circuit breaker trips |

---

## 16. Learning System (4 variables functional, 4 planned)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `LEARNING_SYSTEM_ENABLED` | `false` | No | **(Planned)** Enable/disable learning system. Not yet wired into config. |
| `EVENT_STORE_PATH` | `./data/events.db` | No | Event store database path |
| `SIGNAL_CATALOG_PATH` | `./data/signals.db` | No | Signal catalog database path |
| `BACKTEST_ENGINE_PATH` | `./data/backtests.db` | No | Backtest engine database path |
| `PROMOTION_WORKFLOW_PATH` | `./data/promotions.db` | No | Promotion workflow database path |
| `BANDIT_ALGORITHM` | `epsilon-greedy` | No | **(Planned)** Bandit algorithm type. Not yet wired into config. |
| `BANDIT_EXPLORATION_FACTOR` | `0.1` | No | **(Planned)** Exploration factor (0-1). Not yet wired into config. |
| `BANDIT_MIN_TRADE_COUNT` | `10` | No | **(Planned)** Minimum trades before allocation. Not yet wired into config. |

---

## 17. Metrics Configuration (0 variables functional, 2 planned)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `METRICS_ENABLED` | `true` | No | **(Planned)** Enable Prometheus metrics. Not yet wired into config. |
| `METRICS_ENDPOINT` | `/metrics` | No | **(Planned)** Metrics endpoint path. Not yet wired into config. |

**Note:** Prometheus metrics collection exists in the code but these env vars are not yet configurable.

---

## 18. WebSocket Configuration (0 variables functional, 3 planned)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `WS_RECONNECT_DELAY` | `1000` | No | **(Planned)** Initial reconnection delay in ms. Not yet wired into config. |
| `WS_MAX_RECONNECT_ATTEMPTS` | `Infinity` | No | **(Planned)** Maximum reconnection attempts. Not yet wired into config. |
| `WS_HEARTBEAT_INTERVAL` | `30000` | No | **(Planned)** Heartbeat interval in ms. Not yet wired into config. |

**Note:** WebSocket reconnection logic exists in the code but uses hardcoded defaults; these env vars are reserved for future configurability.

---

## Category Summary

| Category | Variable Count | Notes |
|----------|----------------|-------|
| API Configuration | 3 | Core Polymarket API endpoints (Data API URL hardcoded) |
| Market Feed | 1 | Token monitoring |
| Logging | 1 | Application logging |
| Trading Gates | 2 | Safety controls |
| Server | 2 | HTTP server settings |
| Secret Management | 11 | 2 functional methods (env, encrypted), 3 stubbed (AWS, Vault, Azure) |
| Retry | 3 | Retry logic configuration |
| Paper Trading | 6 | Simulation settings |
| Risk Management | 5 | Trading limits |
| Circuit Breaker | 3 | Fault tolerance |
| Admin Auth | 1 | API security |
| CORS | 1 | Cross-origin settings |
| Reconciliation | 1 | State verification |
| Rate Limiting | 3 | DoS protection |
| Alerting | 4 | Telegram notifications |
| Learning System | 8 | 4 functional (database paths), 4 planned (feature flags) |
| Metrics | 2 | Planned - not yet wired into config |
| WebSocket | 3 | Planned - not yet wired into config |
| **TOTAL** | **50** | **~37 functional, ~13 planned/stubbed** |

---

## Configuration by Environment

### Development (Local)
Recommended settings:
- `LOG_LEVEL=debug`
- `LIVE_TRADING=false`
- `COMPLIANCE_ACCEPTED=false`
- `SECRET_SOURCE=env`
- `ALLOWED_ORIGINS=*`
- `ADMIN_TOKEN=` (empty, endpoints disabled)

### Testing (CI/Codespaces)
Recommended settings:
- `LOG_LEVEL=info`
- `LIVE_TRADING=false`
- `COMPLIANCE_ACCEPTED=false`
- `SECRET_SOURCE=env` (with test credentials)
- `LEARNING_SYSTEM_ENABLED=true` (for feature testing)
- `METRICS_ENABLED=true` (for monitoring testing)

### Production
Required settings:
- `LOG_LEVEL=warn` or `info`
- `LIVE_TRADING=true` (if approved)
- `COMPLIANCE_ACCEPTED=true` (if approved)
- `SECRET_SOURCE=aws` or `vault` or `azure` (NOT env)
- `ADMIN_TOKEN=<secure-random-token>`
- `ALLOWED_ORIGINS=<specific-domains>` (NOT *)

---

## Validation

Core backend configuration variables defined in `apps/backend/src/config/index.ts` are validated at startup using Zod schemas. Invalid validated configuration will prevent the application from starting with clear error messages. Note that planned/future variables (metrics, websocket tuning, some learning system flags) are not yet part of the validated config schema.

---

**For more details:**
- See [.env.example](../.env.example) for complete documentation
- See [environment.md](./environment.md) for environment setup
- See [CODESPACES_SETUP.md](./CODESPACES_SETUP.md) for Codespaces configuration
