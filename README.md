# Polymarket Trading Bot

An autonomous trading bot for Polymarket prediction markets. Currently features read-only data retrieval with a roadmap for full trading capabilities including market making, arbitrage, and advanced risk management.

## 📚 Documentation

- **[System Overview](./SYSTEM_OVERVIEW.md)** - Plain language explanation of how the system works (start here!)
- **[Master Development Plan](./MASTER_DEVELOPMENT_PLAN.md)** - Comprehensive task list with checkboxes and roadmap
- **[GitHub Marketplace Setup](./docs/GITHUB_MARKETPLACE_SETUP.md)** - Setup guide for GitHub Apps, AI code review tools, and development automation
- **[Runbook](./docs/RUNBOOK.md)** - Operational procedures for running the bot
- **[Implementation Checklist](./docs/IMPLEMENTATION_CHECKLIST.md)** - Detailed development checklist
- **[Architecture Decisions](./docs/ADR-0001.md)** - Key architectural decisions and rationale

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
- npm or yarn

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

The project uses environment variables for configuration. You can customize these in a `.env` file:

```env
# Polymarket API Configuration
GAMMA_API_URL=https://gamma-api.polymarket.com
CLOB_API_URL=https://clob.polymarket.com
WS_MARKET_URL=wss://ws-subscriptions-clob.polymarket.com/ws/market

# Market Feed Configuration
# Comma-separated list of token IDs to monitor via WebSocket
# Example: TOKEN_IDS=0x123abc,0x456def
TOKEN_IDS=

# Logging
LOG_LEVEL=info

# Trading gates (default to paper mode)
LIVE_TRADING=false
COMPLIANCE_ACCEPTED=false

# Server
PORT=3000

# Retry Configuration (optional)
RETRY_ATTEMPTS=3
RETRY_DELAY=1000
```

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

- `GET /health` - Server health status
- `GET /feed/status` - WebSocket feed connection status
- `GET /orderbooks` - List all cached orderbooks with summaries
- `GET /orderbook/:tokenId` - Get full orderbook for a specific token

Configure which tokens to monitor via the `TOKEN_IDS` environment variable.

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
- **Endpoints Used**:
  - `GET /markets` - List markets
  - `GET /events` - List events

### CLOB API

The CLOB (Central Limit Order Book) API provides orderbook data:
- **Base URL**: https://clob.polymarket.com
- **Endpoints Used**:
  - `GET /book?token_id=<TOKEN_ID>` - Get orderbook for token

## Example Workflow

1. **Find Markets**: Use `npm run markets` to discover available markets
2. **Get Token IDs**: Note the token IDs for outcomes you're interested in
3. **Check Orderbook**: Use `npm run book -- --tokenId <TOKEN_ID>` to see current prices

## Development

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

**Phase:** MVP - Real-Time Data Streaming ✅

**Completed:**
- ✅ Market data fetching
- ✅ Orderbook retrieval
- ✅ Retry logic and error handling
- ✅ Comprehensive documentation
- ✅ WebSocket market feed client
- ✅ In-memory orderbook cache
- ✅ Auto-reconnect with backoff strategy
- ✅ HTTP server with orderbook API endpoints

**In Progress:**
- 🔄 Risk management framework
- 🔄 Paper trading engine

**Planned:**
- ⏳ Authentication (L1/L2)
- ⏳ Live trading engine
- ⏳ Market making strategy
- ⏳ Arbitrage detection
- ⏳ Multi-market orchestration

See [Master Development Plan](./MASTER_DEVELOPMENT_PLAN.md) for complete roadmap.

## Limitations

Current version is **read-only**:
- ❌ No trading functionality yet
- ❌ No authentication required
- ❌ No order placement
- ✅ Only data retrieval

Full trading capabilities are planned in upcoming phases.

## Contributing

Contributions are welcome! Please:
1. Read the [System Overview](./SYSTEM_OVERVIEW.md) to understand the system
2. Check the [Master Development Plan](./MASTER_DEVELOPMENT_PLAN.md) for open tasks
3. Set up development tools using the [GitHub Marketplace Setup Guide](./docs/GITHUB_MARKETPLACE_SETUP.md)
4. Follow existing code style and patterns
5. Submit a Pull Request with clear description

### Development Setup for Contributors

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run tests:**
   ```bash
   npm test
   ```

3. **Start development mode:**
   ```bash
   npm run dev
   ```

4. **Set up GitHub Apps** (for repository maintainers):
   - Follow the [GitHub Marketplace Setup Guide](./docs/GITHUB_MARKETPLACE_SETUP.md)
   - Install Qodo Merge for AI code reviews: https://github.com/apps/qodo-merge
   - Enable Dependabot and Code Scanning for security

## Support

- **Issues**: Open a GitHub issue for bugs or feature requests
- **Questions**: Use GitHub Discussions
- **Documentation**: See [SYSTEM_OVERVIEW.md](./SYSTEM_OVERVIEW.md) for detailed explanations

## License

ISC
