# Polymarket Trading Bot

An autonomous trading bot for Polymarket prediction markets. Currently features read-only data retrieval with a roadmap for full trading capabilities including market making, arbitrage, and advanced risk management.

## 📚 Documentation

- **[System Overview](./SYSTEM_OVERVIEW.md)** - Plain language explanation of how the system works (start here!)
- **[Master Development Plan](./MASTER_DEVELOPMENT_PLAN.md)** - Comprehensive task list with checkboxes and roadmap
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
```

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

**Phase:** MVP - Read-Only Data Retrieval ✅

**Completed:**
- ✅ Market data fetching
- ✅ Orderbook retrieval
- ✅ Retry logic and error handling
- ✅ Comprehensive documentation

**In Progress:**
- 🔄 WebSocket connectivity
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
3. Follow existing code style and patterns
4. Submit a Pull Request with clear description

## Support

- **Issues**: Open a GitHub issue for bugs or feature requests
- **Questions**: Use GitHub Discussions
- **Documentation**: See [SYSTEM_OVERVIEW.md](./SYSTEM_OVERVIEW.md) for detailed explanations

## License

ISC
