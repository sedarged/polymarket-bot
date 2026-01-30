# Polymarket Read-Only Starter

A read-only TypeScript client for fetching Polymarket markets and orderbook data. This is a starter project focused on data retrieval only - **no trading or authentication required**.

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

## Dashboard (Frontend)

The dashboard lives in `apps/frontend` and connects to a running backend that exposes status + control endpoints and a live stream (SSE or WebSocket). The backend implementation is **not** included in this repository; you must run your own backend service separately.

### How to run dashboard safely

1. **Run your backend bound to localhost only** (recommended). This allows admin controls without sending a token:
   ```bash
   # Example: ensure your backend listens only on 127.0.0.1
   HOST=127.0.0.1 PORT=3000 <your-backend-start-command>
   ```
2. **Start the dashboard** in a separate terminal:
   ```bash
   cd apps/frontend
   npm install
   npm run dev
   ```
3. **Confirm controls are protected**:
   - If the backend URL is `http://127.0.0.1:3000` or `http://localhost:3000`, controls are enabled without a token.
   - If you point the dashboard at a non-local backend, enter an `ADMIN_TOKEN` in the dashboard to enable controls.
4. **Never embed secrets in the frontend build**. The dashboard only accepts tokens at runtime via the UI and does not ship any secrets in source control.

### Expected backend endpoints

The frontend expects the following backend endpoints (adjust the frontend client if your paths differ):

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/status` | GET | Return bot status (LIVE_TRADING, paused, uptime, etc.). |
| `/api/control/pause` | POST | Pause **paper** trading only. |
| `/api/control/resume` | POST | Resume **paper** trading only. |
| `/api/control/kill` | POST | Trigger kill switch (requires confirmation). |
| `/api/stream` | GET (SSE) | Stream live updates. |
| `/ws` | GET (WS) | Optional WebSocket stream fallback. |

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

## Limitations

This is a **read-only** client:
- ❌ No trading functionality
- ❌ No authentication required
- ❌ No order placement
- ✅ Only data retrieval

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues or questions, please open an issue on the GitHub repository.
