# Environment Variable Coverage Summary

## Overview
This document provides an overview of environment variables used by the Polymarket bot at runtime, plus variables reserved for future use that are not yet wired into the codebase, organized by category.

**Total Variables (including planned):** 57  
**Last Updated:** 2026-02-10  
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
| `METRICS_PORT` | `9090` | No | Dedicated metrics server port (Research §7 Day 6). When different from PORT, GET /metrics is served on this port. Set to same as PORT for single-port mode. |
| `CHAIN_ID` | `137` | No | Blockchain chain ID (137 = Polygon Mainnet) |

---

## 6. Startup & Compliance (Research §9, §10) (3 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `MIN_BALANCE_USDC` | `0` | No | Minimum USDC balance (in USDC units). At startup, if balance &lt; this and LIVE_TRADING=true, process exits. Set to 0 to disable. |
| `BAN_STATUS_CHECK_INTERVAL_MS` | `86400000` | No | Ban-status check interval in ms (default 24h). Research §10.1: 24h; §9.2: optionally 1h (3600000). |
| `BAN_STATUS_EXIT_IF_CERT_REQUIRED` | `false` | No | If true, exit on startup when GET /ban-status returns cert_required (proof of residence within 14 days). If false, only log and send Telegram alert. |

---

## 7. Config Paths (2 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `MARKETS_CONFIG_PATH` | (empty) | No | Optional path to config/markets.json (e.g. `config/markets.json`). If set, tokenIds and per-market limits loaded from file. Copy from config/markets.json.example. |
| `STRATEGY_CONFIG_PATH` | (empty) | No | Optional path to config/strategy.json (Research §6.1). Copy from config/strategy.json.example. Loaded at startup via `ConfigManager`; hot-reload supported. |

---

## 8. Heartbeat & WebSocket Limits (2 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `HEARTBEAT_URL` | (empty) | No | If set, GET request sent every 1 min (e.g. healthchecks.io). Alert if 5 min missed (Research §9.7, §10.6). Example: `https://hc-ping.com/your-uuid`. |
| `WS_MAX_RECONNECT_ATTEMPTS` | `10` | No | Max WebSocket reconnect attempts before giving up; then critical alert and optional exit (Research §9.3). |

---

## 9. Secret Management (16 variables – 5 implemented)

**Status:** All five secret sources are implemented: `env`, `encrypted`, `aws`, `vault`, and `azure`. For most deployments, `encrypted` is the simplest production-ready option; cloud backends require platform credentials and network access at startup.

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `SECRET_SOURCE` | `env` | No | Secret source: `env`, `encrypted`, `aws`, `vault`, `azure`. |
| `PRIVATE_KEY` | - | Conditional | Private key (64 hex chars, optional 0x prefix). Required for live trading when `SECRET_SOURCE=env`. |
| `ENCRYPTION_KEY` | - | Conditional | Passphrase for encrypted storage (Method 2). |
| `ENCRYPTED_PRIVATE_KEY` | - | Conditional | Encrypted private key (Method 2). |
| `AWS_SECRET_NAME` | - | Conditional | AWS Secrets Manager secret name. Secret value can be a direct private-key string or JSON containing `privateKey` / `PRIVATE_KEY` / `private_key`. |
| `AWS_REGION` | `us-east-1` | No | AWS region (used by the AWS SDK client). Defaults to `us-east-1` if not specified. |
| `AWS_ACCESS_KEY_ID` | - | Conditional | Not in app schema by design — read automatically by the AWS SDK default credential chain (env → `~/.aws/credentials` → IAM role). |
| `AWS_SECRET_ACCESS_KEY` | - | Conditional | Not in app schema by design — read automatically by the AWS SDK default credential chain. |
| `VAULT_ADDR` | - | Conditional | Vault server address (e.g. `https://vault.example.com`). |
| `VAULT_TOKEN` | - | Conditional | Vault authentication token. |
| `VAULT_PATH` | - | Conditional | Vault secret path (KV v1 or KV v2 path). The code supports both KV v1 (`data.privateKey`) and KV v2 (`data.data.privateKey`). |
| `AZURE_KEY_VAULT_NAME` | - | Conditional | Azure Key Vault name (e.g. `my-keyvault`) or full URL (e.g. `https://my-keyvault.vault.azure.net`). |
| `AZURE_SECRET_NAME` | - | Conditional | Azure Key Vault secret name. |
| `AZURE_CLIENT_ID` | - | Conditional | Not in app schema by design — read automatically by Azure `DefaultAzureCredential` from environment. |
| `AZURE_CLIENT_SECRET` | - | Conditional | Not in app schema by design — read automatically by Azure `DefaultAzureCredential` from environment. |
| `AZURE_TENANT_ID` | - | Conditional | Not in app schema by design — read automatically by Azure `DefaultAzureCredential` from environment. |

**Note:** All three cloud backends (AWS, Vault, Azure) are **fully implemented** in `apps/backend/src/secrets/index.ts`. AWS and Azure credential variables are intentionally absent from the app schema because those SDKs manage their own credential chains — no wrapper in the Zod schema is needed or desired. Prefer IAM roles / managed identities over long-lived keys where possible.

---

## 10. Retry Configuration (3 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `RETRY_ATTEMPTS` | `3` | No | Number of retry attempts |
| `RETRY_DELAY` | `1000` | No | Initial retry delay in milliseconds |
| `RETRY_TOTAL_TIMEOUT` | `300000` | No | Total timeout for all retries (5 minutes) |

---

## 11. Paper Trading Configuration (6 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PAPER_TRADING_SLIPPAGE` | `0.01` | No | Base slippage percentage (1%) |
| `PAPER_TRADING_MAX_SLIPPAGE` | `0.05` | No | Maximum slippage percentage (5%) |
| `PAPER_TRADING_FEE_RATE` | `0.002` | No | Trading fee rate (0.2%) |
| `PAPER_TRADING_PARTIAL_FILL_RATE` | `0.0` | No | Probability of partial fills (0-1) |
| `PAPER_TRADING_MIN_FILL_RATIO` | `0.1` | No | Minimum fill ratio for partial fills |
| `PAPER_TRADING_MAX_FILL_RATIO` | `0.9` | No | Maximum fill ratio for partial fills |

---

## 12. Risk Management (5 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `RISK_MAX_EXPOSURE_PER_MARKET` | `1000` | No | Maximum exposure per market in USD |
| `RISK_MAX_OPEN_ORDERS` | `50` | No | Maximum number of open orders |
| `RISK_MAX_DRAWDOWN` | `0.20` | No | Maximum drawdown percentage (20%) |
| `RISK_ERROR_RATE_THRESHOLD` | `0.10` | No | Error rate threshold (10%) |
| `RISK_ERROR_RATE_WINDOW` | `100` | No | Window size for error rate calculation |

---

## 13. Circuit Breaker (3 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | `5` | No | Failures before opening circuit |
| `CIRCUIT_BREAKER_RESET_TIMEOUT_MS` | `60000` | No | Reset timeout in milliseconds (1 minute) |
| `CIRCUIT_BREAKER_SUCCESS_THRESHOLD` | `2` | No | Successes needed to close circuit |

---

## 14. Admin Authentication (1 variable)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `ADMIN_TOKEN` | (empty) | Conditional | Admin token for sensitive endpoints (required in production) |
| `ADMIN_TOKEN_NEXT` | (empty) | No | Optional “next” admin token for zero-downtime rotation; when set, both tokens are accepted for admin endpoints |

---

## 15. CORS Configuration (1 variable)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `ALLOWED_ORIGINS` | `http://localhost:3000` | No | Comma-separated list of allowed origins |

---

## 16. Reconciliation (1 variable)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `RECONCILIATION_INTERVAL_SECONDS` | `300` | No | Reconciliation interval in seconds (5 minutes) |

---

## 17. Rate Limiting (3 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `RATE_LIMIT_MAX_REQUESTS` | `100` | No | Max requests per IP per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | No | Rate limit window in milliseconds (1 minute) |
| `RATE_LIMIT_TRUST_PROXY` | `false` | No | Trust X-Forwarded-For headers |

---

## 18. Alerting Configuration (4 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | - | Conditional | Telegram bot token for alerts |
| `TELEGRAM_CHAT_ID` | - | Conditional | Telegram chat ID for alerts |
| `ALERT_ERROR_RATE_THRESHOLD` | `5` | No | Alert threshold for error rate (5%) |
| `ALERT_CIRCUIT_BREAKER_TRIPS` | `1` | No | Alert after N circuit breaker trips |

---

## 19. Learning System (11 variables — all implemented, GAP-003 resolved)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `LEARNING_SYSTEM_ENABLED` | `true` | No | Enable/disable learning system initialization. Set `false` to skip entirely. ✅ **Wired** |
| `EVENT_STORE_PATH` | `./data/events.db` | No | Event store database path |
| `SIGNAL_CATALOG_PATH` | `./data/signals.db` | No | Signal catalog database path |
| `BACKTEST_ENGINE_PATH` | `./data/backtests.db` | No | Backtest engine database path |
| `PROMOTION_WORKFLOW_PATH` | `./data/promotions.db` | No | Promotion workflow database path |
| `EVENT_STORE_MAX_EVENTS` | `0` (unlimited) | No | Max events retained in EventStore; 0 = unlimited. Oldest events pruned when limit reached. |
| `BACKTEST_MAX_CONCURRENT` | `3` | No | Max concurrent backtests. Requests over limit are rejected immediately. |
| `BACKTEST_MAX_DATE_RANGE_DAYS` | `365` | No | Max date range in days for a single backtest run. |
| `BANDIT_ALGORITHM` | `epsilon-greedy` | No | Bandit algorithm: `epsilon-greedy`, `ucb1`, `thompson-sampling`. ✅ **Wired** |
| `BANDIT_EXPLORATION_FACTOR` | `0.1` | No | Exploration factor (0.0–1.0). Higher = more exploration. ✅ **Wired** |
| `BANDIT_MIN_TRADE_COUNT` | `10` | No | Minimum trades before a strategy is eligible for bandit allocation. ✅ **Wired** |

---

## 20. Data Pipeline / Ingestion (8 variables)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATA_PIPELINE_ENABLED` | `true` | No | Enable/disable real-time ingestion pipeline (starts only when TOKEN_IDS/markets config provides markets) |
| `DATA_PIPELINE_FLUSH_INTERVAL_MS` | `1000` | No | Flush interval for buffered market data writes to EventStore (ms) |
| `DATA_PIPELINE_ORDERBOOK_LEVELS` | `10` | No | Top N levels stored per side for `OrderBookUpdateEvent` |
| `DATA_PIPELINE_STORE_ORDERBOOK_EVENTS` | `true` | No | If `false`, only store `MarketEvent` summaries (skip `OrderBookUpdateEvent`) |
| `DATA_PIPELINE_ALERT_AFTER_CONSECUTIVE_FAILURES` | `3` | No | Send alert after N consecutive flush failures (Telegram if configured) |
| `DATA_PIPELINE_CIRCUIT_BREAKER_FAILURE_THRESHOLD` | `5` | No | Failures before opening ingestion EventStore write circuit breaker |
| `DATA_PIPELINE_CIRCUIT_BREAKER_RESET_TIMEOUT_MS` | `60000` | No | Circuit breaker reset timeout (ms) |
| `DATA_PIPELINE_CIRCUIT_BREAKER_SUCCESS_THRESHOLD` | `2` | No | Successes required in half-open to close circuit |

---

## 21. Metrics Configuration (0 variables functional, 2 planned)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `METRICS_ENABLED` | `true` | No | **(Planned)** Enable Prometheus metrics. Not yet wired into config. |
| `METRICS_ENDPOINT` | `/metrics` | No | **(Planned)** Metrics endpoint path. Not yet wired into config. |

**Note:** Prometheus metrics collection exists in the code but these env vars are not yet configurable.

---

## 22. WebSocket Configuration (2 variables — all implemented, GAP-005 resolved)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `WS_RECONNECT_DELAY` | `1000` | No | Initial reconnection delay in ms. Passed to `WebSocketClient` via `MarketFeedClient`. ✅ **Wired** |
| `WS_HEARTBEAT_INTERVAL_MS` | `30000` | No | Heartbeat ping/pong interval in ms. Replaces hardcoded constant in `WebSocketClient`. ✅ **Wired** |

**Note:** `WS_MAX_RECONNECT_ATTEMPTS` is documented in [§8. Heartbeat & WebSocket Limits](#8-heartbeat--websocket-limits-2-variables). All three WS tuning variables are now wired into the config schema.

---

## Category Summary

| Category | Variable Count | Notes |
|----------|----------------|-------|
| API Configuration | 3 | Core Polymarket API endpoints (Data API URL hardcoded) |
| Market Feed | 1 | Token monitoring |
| Logging | 1 | Application logging |
| Trading Gates | 2 | Safety controls |
| Server | 2 | HTTP server settings |
| Startup & Compliance | 3 | MIN_BALANCE, ban-status (Research §9, §10) |
| Config Paths | 2 | markets.json, strategy.json paths |
| Heartbeat & WebSocket Limits | 2 | HEARTBEAT_URL, WS_MAX_RECONNECT_ATTEMPTS |
| Secret Management | 11 | 5 implemented sources (env, encrypted, AWS, Vault, Azure) |
| Retry | 3 | Retry logic configuration |
| Paper Trading | 6 | Simulation settings |
| Risk Management | 5 | Trading limits |
| Circuit Breaker | 3 | Fault tolerance |
| Admin Auth | 1 | API security |
| CORS | 1 | Cross-origin settings |
| Reconciliation | 1 | State verification |
| Rate Limiting | 3 | DoS protection |
| Alerting | 4 | Telegram notifications |
| Learning System | 11 | All implemented (GAP-003 resolved) |
| Data Pipeline / Ingestion | 8 | Real-time market ingestion to EventStore (GAP-021) |
| Metrics | 2 | Always enabled — METRICS_ENABLED/METRICS_ENDPOINT vars not needed in schema |
| WebSocket | 2 | WS_RECONNECT_DELAY and WS_HEARTBEAT_INTERVAL_MS fully wired (GAP-005 resolved) |
| **TOTAL** | **65** | **~65 functional, ~0 genuinely not-yet-wired, ~3 not-in-schema by design (AWS/Azure credential chains)** |

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
