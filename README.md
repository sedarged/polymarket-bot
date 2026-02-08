# Polymarket Trading Bot

An autonomous trading bot for Polymarket prediction markets. Currently features read-only data retrieval with a roadmap for full trading capabilities including market making, arbitrage, and advanced risk management.

---

## ⚠️ RISK DISCLAIMER & COMPLIANCE

**READ THIS BEFORE USING THIS SOFTWARE**

- **FINANCIAL RISK:** Trading involves substantial risk of loss. You can lose your entire investment. This software is provided "AS IS" with NO WARRANTY.
- **LEGAL COMPLIANCE:** You are solely responsible for compliance with all applicable laws. Trading may be illegal in your jurisdiction.
- **GEOGRAPHIC RESTRICTIONS:** Prohibited for U.S. residents and residents of sanctioned countries. See [Compliance Guide](./docs/compliance.md).
- **SECURITY WARNINGS:** Known critical security vulnerabilities exist. See [Security Audit](./REPORTS/AUDIT.md) - NOT PRODUCTION READY.
- **PAPER TRADING DEFAULT:** Live trading requires explicit opt-in via environment variables (`LIVE_TRADING=true` AND `COMPLIANCE_ACCEPTED=true`).

**📖 MANDATORY READING:** [docs/compliance.md](./docs/compliance.md) - Complete legal and compliance information

---

## 📚 Documentation

**Quick Start:**
- **[STATUS.md](./STATUS.md)** - Current work status and priorities (updated automatically from GitHub Issues)
- **[System Overview](./docs/architecture-overview.md)** - Plain language explanation of how the system works (start here!)
- **[Documentation Index](./docs/README.md)** - Complete documentation catalog and navigation

**Legal & Compliance (MUST READ):**
- **[Compliance Guide](./docs/compliance.md)** - 🚨 Geographic restrictions, ToS compliance, risk disclaimers
- **[Security Guide](./docs/security.md)** - Private key security and best practices

**For Contributors:**
- **[AGENTS.md](./AGENTS.md)** - Guidelines and contract for AI agents working on this project
- **[CHANGELOG.md](./CHANGELOG.md)** - Release history and notable changes

**Security & Audits:**
- **[Security Audit Report](./REPORTS/AUDIT.md)** - Comprehensive security & reliability audit (27 findings)
- **[Reports Index](./REPORTS/README.md)** - All audit and analysis reports

**Detailed Documentation:**
- **[Architecture Map](./docs/architecture.md)** - Technical architecture documentation with critical paths and module dependencies
- **[Environment Setup](./docs/environment.md)** - Complete development environment and command reference
- **[Master Development Plan](./docs/master-plan.md)** - Comprehensive task list with checkboxes and roadmap
- **[Runbook](./docs/runbook.md)** - Operational procedures for running the bot
- **[Implementation Checklist](./docs/implementation-checklist.md)** - Detailed development checklist
- **[Architecture Decisions](./docs/adr/0001-initial-architecture.md)** - Key architectural decisions and rationale

## Features

- 📊 Fetch active markets and events from Gamma API
- 📈 Retrieve orderbook data from CLOB API
- 🔄 Built-in retry logic with exponential backoff
- 📝 Comprehensive logging
- 🧪 Unit tests for core functionality
- ⚡ TypeScript strict mode
- 🛠️ Easy-to-use CLI commands
- 🌐 Real-time WebSocket market feed
- 💾 In-memory orderbook cache with automatic resync
- 🔌 Auto-reconnect with backoff + jitter strategy

## Requirements

- Node.js >= 20.0.0
- npm (v10+ recommended)

For complete environment details, see **[Environment Setup](./docs/environment.md)**.

## Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/polymarket-bot.git
cd polymarket-bot

# Install dependencies
npm install

# Copy environment file (optional - uses defaults)
cp .env.example .env

# Build the project
npm run build
```

## Configuration

The project uses environment variables for configuration. You can customize these in a `.env` file.

### Essential Configuration

```env
# Polymarket API Configuration
GAMMA_API_URL=https://gamma-api.polymarket.com
CLOB_API_URL=https://clob.polymarket.com
WS_MARKET_URL=wss://ws-subscriptions-clob.polymarket.com/ws/market

# Market Feed Configuration
# Comma-separated list of token IDs to monitor via WebSocket
TOKEN_IDS=

# Logging
LOG_LEVEL=info

# Server
PORT=3000
```

### Trading Configuration

```env
# Trading gates (default to paper mode)
LIVE_TRADING=false
COMPLIANCE_ACCEPTED=false

# Trading credentials (optional - only required for live trading)
# See .env.example for multiple secret storage options:
# - Direct env variable (development only)
# - Encrypted local storage
# - AWS Secrets Manager
# - HashiCorp Vault
# - Azure Key Vault
PRIVATE_KEY=your_wallet_private_key_here
CHAIN_ID=137
```

### Security Configuration

```env
# Admin Authentication (required for production/live trading)
# Generate with: openssl rand -hex 32
ADMIN_TOKEN=

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_TRUST_PROXY=false
```

### Advanced Configuration

See `.env.example` for complete configuration options including:
- Paper trading parameters (slippage, fees, partial fills)
- Risk management limits
- Circuit breaker settings
- Reconciliation intervals
- Alerting configuration (Telegram)
- Learning system database paths

For detailed configuration guide, see **[Environment Setup](./docs/environment.md)**.

### Live Trading Setup

⚠️ **WARNING**: Live trading involves real money and real risk. Only enable after thorough testing in paper mode.

To enable live trading:

1. **Set up wallet credentials**: Export your private key from your wallet (e.g., MetaMask) and add it to `.env`:
   ```env
   PRIVATE_KEY=0x...your_private_key_here
   CHAIN_ID=137  # Polygon Mainnet
   ```

2. **Enable trading gates**: Both flags must be set to `true`:
   ```env
   LIVE_TRADING=true
   COMPLIANCE_ACCEPTED=true
   ```

3. **Fund your wallet**: Ensure your wallet has sufficient USDC on Polygon for trading

4. **Verify setup**: Start the server and check `/status` endpoint to confirm trading is enabled

**Security Notes:**
- Never commit your private key to git
- Use environment variable management tools (e.g., dotenv, secret managers)
- Rotate keys regularly
- Use a dedicated trading wallet with limited funds

## Usage

### List Active Markets

Fetch and display active markets from Polymarket:

```bash
# List all active markets
npm run markets

# Limit the number of markets returned
npm run markets -- --limit 5
```

Output includes:
- Market question/title
- Token IDs for each outcome
- Outcome names

### Fetch Orderbook Data

Get orderbook information for a specific token:

```bash
# Fetch orderbook for a token ID
npm run book -- --tokenId <TOKEN_ID>
```

Output includes:
- Best Bid
- Best Ask
- Mid Price (average of best bid and ask)
- Spread (difference between best ask and bid)

### Development Mode

Run commands directly without building:

```bash
# Using tsx for development
npm run dev markets -- --limit 5
npm run dev book -- --tokenId <TOKEN_ID>

# Start server with WebSocket market feed
npm run dev
```

### Real-Time Market Feed Server

Start the HTTP server with WebSocket market feed integration:

```bash
npm run dev
```

The server provides the following endpoints:

**Public Endpoints:**
- `GET /health` - Server health status
- `GET /ready` - Readiness check
- `GET /metrics` - Prometheus metrics
- `GET /orderbooks` - List all cached orderbooks with summaries
- `GET /orderbook/:tokenId` - Get full orderbook for a specific token
- `GET /feed/status` - WebSocket feed connection status

**Admin Endpoints (require ADMIN_TOKEN):**
- `GET /status` - Trading status and wallet information
- `GET /state` - Complete trading state (orders, positions, balances)
- `GET /orders` - List all orders
- `POST /orders` - Batch create orders (max 15)
- `GET /fills` - List all fills
- `POST /kill` - Cancel orders (supports query params: tokenId, assetId, scope)
- `POST /kill-switch` - Legacy: cancel all open orders
- `GET /api/learning/experiments` - ML experiments
- `GET /api/learning/strategies` - Strategy list
- `GET /api/learning/best` - Best performing strategy
- `GET /api/learning/status` - Learning system status

**Authentication:** Admin endpoints require the `Authorization` header:
```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" http://localhost:3000/status
```

Configure which tokens to monitor via the `TOKEN_IDS` environment variable.

### Trading Dashboard

Access the production-ready web-based trading dashboard:

```bash
# Terminal 1: Start backend server
npm run dev

# Terminal 2: Start frontend dashboard
cd apps/frontend
npm run dev
```

Then open http://localhost:8080/dashboard.html in your browser.

**Dashboard Features:**
- **Overview Tab**: Wallet, orders, positions, real-time PnL, watched markets
- **Monitoring Tab**: Detailed orders, positions, fills, real-time event feed
- **Controls Tab**: Risk configuration, strategy parameters, reconnect settings
- **Alerts & Logs Tab**: Active alerts, log viewer with filtering, system metrics
- **Learning System Tab**: Experiment status and integration points

**Key Capabilities:**
- Auto-refresh every 5 seconds
- Kill switch with admin token authentication
- Configuration change tracking
- Export logs as .txt from the Alerts & Logs tab
- Responsive design for desktop and tablet
- Persistent safety banner showing trading mode

For complete dashboard documentation, see **[Dashboard Usage Guide](./docs/dashboard-usage-guide.md)**.


## Project Structure

```
src/
├── cli/          # CLI command handlers
│   └── index.ts
├── clients/      # API clients
│   ├── gamma.ts  # Gamma API client (markets/events)
│   └── clob.ts   # CLOB API client (orderbooks)
├── config/       # Configuration
│   └── index.ts
├── domain/       # Domain models
│   ├── market.ts
│   └── orderbook.ts
├── utils/        # Utilities
│   ├── logger.ts    # Logging utility
│   ├── retry.ts     # Retry/backoff logic
│   └── orderbook.ts # Orderbook calculations
└── index.ts      # CLI entry point

tests/
├── orderbook.test.ts  # Orderbook math tests
└── retry.test.ts      # Retry logic tests
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## API Documentation

### Gamma API

The Gamma API provides market and event information:
- **Base URL**: https://gamma-api.polymarket.com
- **Purpose**: Market discovery and metadata
- **Documentation**: https://docs.polymarket.com/developers/gamma-markets-api/overview
- **Endpoints Used**:
  - `GET /markets` - List markets
  - `GET /events` - List events

### CLOB API

The CLOB (Central Limit Order Book) API provides orderbook data and trading capabilities:
- **Base URL**: https://clob.polymarket.com
- **Purpose**: Orderbook and trading
- **Documentation**: https://docs.polymarket.com/developers/CLOB/introduction
- **Endpoints Used**:
  - `GET /book?token_id=<TOKEN_ID>` - Get orderbook for token
  - `POST /order` - Create new order (live trading)
  - `DELETE /order/:orderId` - Cancel order (live trading)
  - `GET /orders` - Get user orders (live trading)

**Note**: Trading endpoints require authentication via wallet signature.

### WebSocket API
- **URL**: wss://ws-subscriptions-clob.polymarket.com/ws/market
- **Purpose**: Real-time market data
- **Documentation**: https://docs.polymarket.com/developers/CLOB/websocket/wss-overview

### Implementation Alignment
For a comprehensive review of how this repository aligns with official Polymarket API documentation, see [REPORTS/RESEARCH_REVIEW.md](./REPORTS/RESEARCH_REVIEW.md).

**Summary:**
- ✅ Fully aligned with official CLOB, Gamma, and WebSocket APIs
- ✅ Uses official `@polymarket/clob-client` SDK for trading
- ✅ Implements best practices: reconnection, resync, idempotency
- ⚠️ Recommended enhancements: Rate limiting awareness, structured error handling

See also:
- [ADR-0002: Rate Limiting Strategy](./docs/adr/0002-rate-limiting-strategy.md)
- [ADR-0003: API Error Handling](./docs/adr/0003-api-error-handling.md)

## Example Workflow

### Read-Only Mode
1. **Find Markets**: Use `npm run markets` to discover available markets
2. **Get Token IDs**: Note the token IDs for outcomes you're interested in
3. **Check Orderbook**: Use `npm run book -- --tokenId <TOKEN_ID>` to see current prices
4. **Monitor Live**: Start server with `npm run dev` and view dashboard at http://localhost:8080

### Live Trading Mode
1. **Complete setup**: Follow [Live Trading Setup](#live-trading-setup) instructions
2. **Start server**: Run `npm run dev` with trading enabled
3. **Open dashboard**: Navigate to http://localhost:8080
4. **Monitor status**: Verify "LIVE TRADING" badge and wallet address
5. **View markets**: Check watched markets for opportunities
6. **Place orders**: Use trading client API (programmatic) or integrate with dashboard
7. **Monitor positions**: Track open orders, positions, and PnL in real-time
8. **Emergency stop**: Use kill switch button to cancel all orders if needed

## Development

### Automated Workflows

This project includes comprehensive GitHub automation for code quality and security:

#### 🔄 Continuous Integration

**Runs automatically on every push and PR:**
- Type checking and builds (`npm run build`)
- Unit tests (`npm test`)
- Test coverage reporting
- Security audits (`npm audit`)
- Secret scanning (TruffleHog)

**View results:** Check the Actions tab on GitHub after pushing

**Local testing before push:**
```bash
npm ci
npm run build
npm test
npm audit --audit-level=high
```

#### 📦 Dependency Management

**Dependabot runs daily security scans** on trading packages:
- Backend (daily) - CRITICAL for trading code
- Frontend (weekly)
- GitHub Actions (monthly)

**Action required:** Review Dependabot PRs weekly and merge security updates immediately.

#### 📝 Automated Releases

**Release Please** generates changelogs and releases automatically:
- Uses conventional commits (`feat:`, `fix:`, `security:`)
- Auto-generates CHANGELOG.md (never edit manually!)
- Creates GitHub releases with version tags
- Builds and uploads release artifacts

**Commit format:**
```bash
feat: add new feature
fix: resolve bug
security: fix vulnerability (A-015)
```

See [Conventional Commits](https://www.conventionalcommits.org/) for details.

#### 🏷️ Smart PR Automation

**Automatic PR enhancements:**
- Auto-labeling by component (backend, frontend, trading, etc.)
- Security review flags for sensitive files
- Size labeling (xs/s/m/l/xl)
- Quality checks (description length, test mentions, issue links)
- Large PR warnings (>500 lines)

#### 📋 Issue Templates

**Bug Report Template** includes trading-specific fields:
- Severity (Critical/High/Medium/Low)
- Area (Trading Logic, WebSocket, Order Management, etc.)
- Trading Mode (Paper vs Live)
- Audit references for known findings

**Complete guide:** See [docs/automation.md](./docs/automation.md) for full documentation.

**For AI agents:** See [AGENTS.md](./AGENTS.md) for automation requirements and best practices.

### Building

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### Code Style

The project uses TypeScript's strict mode with the following compiler options:
- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noImplicitReturns: true`
- `noFallthroughCasesInSwitch: true`

## Error Handling

- All API calls include automatic retry with exponential backoff
- Configurable retry attempts and delays
- Comprehensive error logging
- Graceful handling of network failures

## Current Status

**Phase:** Live Trading Integration ✅

**Completed:**
- ✅ Market data fetching
- ✅ Orderbook retrieval
- ✅ Retry logic and error handling
- ✅ Comprehensive documentation
- ✅ WebSocket market feed client
- ✅ In-memory orderbook cache
- ✅ Auto-reconnect with backoff strategy
- ✅ HTTP server with orderbook API endpoints
- ✅ Live trading integration with CLOB client
- ✅ Idempotency via clientOrderId
- ✅ Startup reconciliation (orders, balances, positions)
- ✅ Trading API endpoints (/status, /state, /orders, /fills)
- ✅ Web-based trading dashboard
- ✅ Kill switch for emergency order cancellation

**In Progress:**
- 🔄 Risk management framework
- 🔄 Paper trading engine

**Planned:**
- ⏳ Market making strategy
- ⏳ Arbitrage detection
- ⏳ Multi-market orchestration

See [Master Development Plan](./docs/master-plan.md) for complete roadmap.

## Limitations

**Safety and Compliance:**
- ⚠️ Live trading is disabled by default - requires explicit opt-in via two environment flags
- ⚠️ No VPN/proxy/geo-bypass capabilities - respects Polymarket's regional restrictions
- ⚠️ User is responsible for compliance with local laws and regulations

**Current Limitations:**
- ❌ No paper trading simulation yet (on roadmap)
- ❌ No automated trading strategies yet (on roadmap)
- ❌ No risk management framework yet (on roadmap)

See [Master Development Plan](./docs/master-plan.md) for complete roadmap.

## Contributing

Contributions are welcome! Please:
1. Read the [System Overview](./docs/architecture-overview.md) to understand the system
2. Check the [Master Development Plan](./docs/master-plan.md) for open tasks
3. Follow existing code style and patterns
4. Submit a Pull Request with clear description

## Support

- **Issues**: Open a GitHub issue for bugs or feature requests
- **Questions**: Use GitHub Discussions
- **Documentation**: See [System Overview](./docs/architecture-overview.md) for detailed explanations

## License

ISC
