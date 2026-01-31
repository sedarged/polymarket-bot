# Environment Setup & Command Reference

This document provides a comprehensive overview of the development environment, tools, and commands used in the Polymarket Bot project.

## System Requirements

### Node.js & Package Manager

- **Node.js Version**: `>= 20.0.0` (Tested with v20.20.0)
- **npm Version**: `10.8.2` (or compatible)
- **Package Manager**: npm (using npm workspaces)

### TypeScript

- **TypeScript Version**: `5.9.3`
- **Configuration**: Strict mode enabled
- **Compiler Options**:
  - Target: ES2020
  - Module Resolution: Node
  - Strict type checking enabled
  - Source maps and declarations generated

## Project Architecture

### Monorepo Structure

This project uses **npm workspaces** to manage a monorepo with multiple packages:

```
polymarket-bot/
├── apps/
│   ├── backend/      # Main application (Node.js + TypeScript)
│   └── frontend/     # Web dashboard (minimal TypeScript + HTML)
├── packages/
│   └── shared/       # Shared types and utilities
└── package.json      # Root workspace configuration
```

### Workspaces

- **@polymarket/backend**: Main trading bot application
- **@polymarket/frontend**: Web-based trading dashboard
- **@polymarket/shared**: Shared code and type definitions

## Frameworks & Tools

### Runtime & Build Tools

- **tsx**: TypeScript execution for development (`4.21.0`)
  - Used for running TypeScript files directly without compilation
  - Enables fast development iteration

### Testing Framework

- **vitest**: Test runner (`4.0.18`)
  - Configuration: `apps/backend/vitest.config.ts`
  - Coverage provider: V8
  - Reporters: text, JSON, HTML
  - Test files: `apps/backend/tests/*.test.ts`

### Core Dependencies

#### Backend (@polymarket/backend)

- **@polymarket/clob-client** (`5.2.1`): Official Polymarket CLOB API client
- **axios** (`1.13.4`): HTTP client for API requests
- **ws** (`8.19.0`): WebSocket client for real-time market feeds
- **dotenv** (`17.2.3`): Environment variable management
- **zod** (`4.3.6`): Runtime type validation

#### Frontend (@polymarket/frontend)

- **http-server**: Simple HTTP server for serving static files
- Minimal TypeScript for type safety

## Database & Infrastructure

### Database

- **Type**: None (currently in-memory only)
- **Storage**: In-memory caches for:
  - Orderbook data
  - Market information
  - Trading state

### Docker

- **Status**: Not currently containerized
- **Configuration**: No Dockerfile or docker-compose.yml present

### CI/CD

- **Platform**: GitHub Actions
- **Workflows**:
  - **Test Coverage** (`.github/workflows/codecov.yml`):
    - Runs on: `push` to `main`, pull requests to `main`
    - Node.js: v20
    - Steps: Install dependencies → Run tests with coverage → Upload to Codecov
    - Coverage provider: @vitest/coverage-v8 (installed dynamically)

## Package.json Scripts

### Root Level Commands

Execute these from the repository root:

#### Installation

```bash
npm install
```

**Description**: Install all dependencies for all workspaces.

**What it does**:
- Installs dependencies for root package
- Installs dependencies for all workspace packages
- Creates package-lock.json with locked versions

#### Build

```bash
npm run build
```

**Description**: Build all workspaces that have a build script.

**What it does**:
- Executes `npm run build` in each workspace
- Compiles TypeScript to JavaScript using `tsc -b`
- Generates type declarations and source maps

**Output**:
- `apps/backend/dist/`: Compiled backend code
- `apps/frontend/dist/`: Compiled frontend code (if any)
- `packages/shared/dist/`: Compiled shared library

**Note**: Currently fails due to TypeScript compilation errors in backend. See Known Issues below.

#### Development

```bash
npm run dev
```

**Description**: Start the backend server in development mode with hot reload.

**What it does**:
- Runs `apps/backend/src/index.ts` using tsx
- Starts HTTP server on port 3000 (configurable via PORT env var)
- Initializes WebSocket market feed
- Loads environment variables from `.env`

**Endpoints**:
- `GET /health`: Health check
- `GET /feed/status`: WebSocket feed status
- `GET /orderbooks`: List cached orderbooks
- `GET /orderbook/:tokenId`: Get specific orderbook
- `GET /status`: Trading status (requires live trading)
- `GET /state`: Complete trading state
- `POST /kill-switch`: Cancel all orders (emergency)

#### Market Commands

```bash
npm run markets
```

**Description**: Fetch and display active markets from Polymarket.

**Options**:
- `-- --limit <n>`: Limit number of markets returned

**Example**:
```bash
npm run markets -- --limit 5
```

```bash
npm run book
```

**Description**: Fetch orderbook for a specific token.

**Options**:
- `-- --tokenId <TOKEN_ID>`: Specify token ID to fetch

**Example**:
```bash
npm run book -- --tokenId 0x1234567890abcdef
```

#### Testing

```bash
npm test
```

**Description**: Run all tests once.

**What it does**:
- Executes vitest in run mode (not watch)
- Runs all test files in `apps/backend/tests/`
- Reports test results and failures

**Current status**: ✅ All 116 tests passing (13 test files)

```bash
npm run test:watch
```

**Description**: Run tests in watch mode.

**What it does**:
- Starts vitest in watch mode
- Re-runs tests when files change
- Useful for TDD workflow

```bash
npm run test:coverage
```

**Description**: Run tests with coverage reporting.

**What it does**:
- Executes tests with V8 coverage provider
- Generates coverage reports in `apps/backend/coverage/`
- Formats: text (console), JSON, HTML

**Output**:
- `apps/backend/coverage/coverage-final.json`: JSON coverage data
- `apps/backend/coverage/index.html`: HTML coverage report

### Backend Workspace Commands

Execute these from `apps/backend/` or use workspace syntax from root:

```bash
# From root
npm run --workspace @polymarket/backend <command>

# Or from apps/backend/
npm run <command>
```

#### Available Commands

- **build**: `tsc -b` - Compile TypeScript
- **dev**: `tsx src/index.ts` - Run server in dev mode
- **markets**: `tsx src/index.ts markets` - List markets
- **book**: `tsx src/index.ts book` - Fetch orderbook
- **kill**: `tsx src/index.ts kill` - Emergency kill switch (cancel all orders)
- **test**: `vitest run` - Run tests once
- **test:watch**: `vitest` - Run tests in watch mode
- **test:coverage**: `vitest run --coverage` - Run tests with coverage

### Frontend Workspace Commands

Execute these from `apps/frontend/`:

```bash
# From root
npm run --workspace @polymarket/frontend <command>

# Or from apps/frontend/
npm run <command>
```

#### Available Commands

- **build**: `tsc -b` - Compile TypeScript
- **dev**: `npx http-server public -p 8080 -c-1` - Start dev server with no caching
- **start**: `npx http-server public -p 8080` - Start production server

**Access**: Open http://localhost:8080 in browser

### Shared Package Commands

Execute these from `packages/shared/`:

- **build**: `tsc -b` - Compile TypeScript

## Environment Variables

Configuration is managed via `.env` file. See `.env.example` for all available options.

### Core Configuration

```env
# API Endpoints
GAMMA_API_URL=https://gamma-api.polymarket.com
CLOB_API_URL=https://clob.polymarket.com
WS_MARKET_URL=wss://ws-subscriptions-clob.polymarket.com/ws/market

# Market Feed
TOKEN_IDS=                          # Comma-separated token IDs to monitor

# Logging
LOG_LEVEL=info                      # Logging level (debug, info, warn, error)

# Trading Gates (BOTH must be true for live trading)
LIVE_TRADING=false                  # Enable live trading
COMPLIANCE_ACCEPTED=false           # Confirm compliance understanding

# Trading Credentials (only for live trading)
# PRIVATE_KEY=0x...                 # Wallet private key
CHAIN_ID=137                        # Polygon Mainnet

# Server
PORT=3000                           # HTTP server port

# Retry Configuration
RETRY_ATTEMPTS=3                    # Number of retry attempts
RETRY_DELAY=1000                    # Initial retry delay (ms)

# Paper Trading
PAPER_TRADING_SLIPPAGE=0.01         # Simulated slippage (1%)
PAPER_TRADING_FEE_RATE=0.002        # Simulated fee rate (0.2%)

# Risk Management
RISK_MAX_EXPOSURE_PER_MARKET=1000   # Max exposure per market (USDC)
RISK_MAX_OPEN_ORDERS=50             # Max number of open orders
RISK_MAX_DRAWDOWN=0.20              # Max drawdown (20%)
RISK_ERROR_RATE_THRESHOLD=0.10      # Error rate threshold (10%)
RISK_ERROR_RATE_WINDOW=100          # Error rate window (orders)

# Admin Authentication
ADMIN_TOKEN=change_me_to_a_strong_random_admin_token
```

### Security Notes

- Never commit `.env` file to git
- Use `.env.example` as template
- Keep `PRIVATE_KEY` secure and never share
- Use strong `ADMIN_TOKEN` for production

## Development Workflow

### Initial Setup

```bash
# Clone repository
git clone https://github.com/sedarged/polymarket-bot.git
cd polymarket-bot

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# (Optional) Edit .env with your configuration
nano .env

# Build project
npm run build
```

### Development Mode

```bash
# Start backend server
npm run dev

# In another terminal, start frontend dashboard
cd apps/frontend
npm run dev
```

### Testing Workflow

```bash
# Run tests once
npm test

# Run tests in watch mode (for TDD)
npm run test:watch

# Generate coverage report
npm run test:coverage
open apps/backend/coverage/index.html
```

### Read-Only Exploration

```bash
# List active markets
npm run markets

# Limit to 10 markets
npm run markets -- --limit 10

# Fetch orderbook for a token
npm run book -- --tokenId <TOKEN_ID>
```

## Known Issues

### Build Errors

The `npm run build` command currently fails with TypeScript errors:

1. **Unused variable** (`isSubscribed` in `marketFeed.ts`)
2. **API compatibility** (`getOrders` method not found in CLOB client)
3. **Type mismatches** (Side type, orderId type)
4. **Unused imports** (`sleep` in `websocket.ts`)
5. **Type conversion errors** (Server to Promise conversion)

**Status**: These are implementation issues that need to be resolved.

**Workaround**: Use `npm run dev` which uses tsx and doesn't require compilation.

### Tests Status

✅ **All tests passing**: 116 tests across 13 test files

## Proposed Improvements

### Missing Scripts

Consider adding these scripts to improve developer experience:

#### Root package.json

```json
{
  "scripts": {
    "lint": "npm run --workspaces --if-present lint",
    "typecheck": "npm run --workspaces --if-present typecheck",
    "clean": "npm run --workspaces --if-present clean",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,json,md}\""
  }
}
```

#### Backend package.json

```json
{
  "scripts": {
    "lint": "eslint src tests --ext .ts",
    "lint:fix": "eslint src tests --ext .ts --fix",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist coverage"
  }
}
```

### Linting

Currently, there is no linting configuration. Consider adding:

- **ESLint**: For code quality and style enforcement
- **Prettier**: For code formatting
- **Husky + lint-staged**: For pre-commit hooks

### Docker Support

For easier deployment and environment consistency:

```dockerfile
# Example Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "run", "dev"]
```

### CI/CD Enhancements

Consider adding:
- Lint check workflow
- Type check workflow
- Build verification workflow
- Multi-platform testing (Linux, macOS, Windows)

## Troubleshooting

### Installation Issues

**Problem**: npm install fails

**Solution**:
- Ensure Node.js >= 20.0.0: `node --version`
- Clear cache: `npm cache clean --force`
- Delete lock file and node_modules: `rm -rf package-lock.json node_modules`
- Reinstall: `npm install`

### Build Issues

**Problem**: npm run build fails with TypeScript errors

**Solution**:
- Use development mode instead: `npm run dev`
- Or fix TypeScript errors in the codebase

### Test Failures

**Problem**: Tests fail unexpectedly

**Solution**:
- Check environment variables are set correctly
- Ensure no conflicting processes on ports
- Clear test cache: `npm run test -- --clearCache`

### Port Already in Use

**Problem**: Port 3000 already in use

**Solution**:
- Change port: `PORT=3001 npm run dev`
- Or kill existing process: `lsof -ti:3000 | xargs kill -9`

## Additional Resources

- [System Overview](../SYSTEM_OVERVIEW.md) - Detailed system explanation
- [Master Development Plan](../MASTER_DEVELOPMENT_PLAN.md) - Roadmap and tasks
- [Runbook](./RUNBOOK.md) - Operational procedures
- [Implementation Checklist](./IMPLEMENTATION_CHECKLIST.md) - Development checklist
- [Architecture Decisions](./ADR-0001.md) - Key architectural decisions
- [README](../README.md) - Quick start guide

## Version History

- **2026-01-31**: Initial environment documentation created
  - Documented Node.js 20.20.0, TypeScript 5.9.3
  - Listed all canonical commands
  - Identified known build issues
  - Proposed improvements for linting and Docker support
