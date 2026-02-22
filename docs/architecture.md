# Architecture Map - Polymarket Trading Bot

**Version:** 1.1  
**Last Updated:** 2026-02-22  
**Audience:** Developers, architects, technical leads

---

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Entrypoints](#entrypoints)
3. [Configuration Layer](#configuration-layer)
4. [Strategy Modules](#strategy-modules)
5. [Execution Layer](#execution-layer)
6. [Adapters](#adapters)
7. [Persistence Layer](#persistence-layer)
8. [Learning System](#learning-system)
9. [Sync & Reconciliation](#sync--reconciliation)
10. [Monitoring & Dashboard](#monitoring--dashboard)
11. [Infrastructure & Deployment](#infrastructure--deployment)
12. [API Endpoints](#api-endpoints)
13. [Critical Paths](#critical-paths)
14. [Technology Stack](#technology-stack)
15. [Module Dependency Graph](#module-dependency-graph)

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         POLYMARKET TRADING BOT                              │
│                           (Monorepo Structure)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                          ENTRYPOINTS                                  │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐   │ │
│  │  │ HTTP Server  │  │ CLI Router   │  │   Frontend App          │   │ │
│  │  │ (index.ts)   │  │ (cli/index)  │  │   (React - minimal)     │   │ │
│  │  └──────┬───────┘  └──────┬───────┘  └─────────────────────────┘   │ │
│  └─────────┼──────────────────┼────────────────────────────────────────┘ │
│            │                  │                                            │
│  ┌─────────▼──────────────────▼──────────────────────────────┐            │
│  │                   CONFIGURATION LAYER                     │            │
│  │         (Environment variables + Zod validation)          │            │
│  └─────────────────────────────┬─────────────────────────────┘            │
│                                │                                            │
│  ┌─────────────────────────────▼─────────────────────────────────────────┐ │
│  │                        STRATEGY MODULES                               │ │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │ │
│  │  │  Paper Trading   │  │   Risk Manager   │  │  Trading Client  │  │ │
│  │  │     Engine       │  │  (Circuit        │  │  (Live Trading)  │  │ │
│  │  │  (Simulation)    │  │   Breakers)      │  │                  │  │ │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │ │
│  └───────────────────────────────┬───────────────────────────────────────┘ │
│                                  │                                          │
│  ┌───────────────────────────────▼───────────────────────────────────────┐ │
│  │                        EXECUTION LAYER                                │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │  Order Management: Create, Cancel, Modify, Track, Reconcile    │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────┬───────────────────────────────────────┘ │
│                                  │                                          │
│  ┌───────────────────────────────▼───────────────────────────────────────┐ │
│  │                      ADAPTER LAYER                                    │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │ │
│  │  │ Gamma Client │  │ CLOB Client  │  │ Market Feed  │  │ WebSocket│ │ │
│  │  │  (Markets)   │  │ (Orderbook)  │  │  (Real-time) │  │  Base    │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────┘ │ │
│  └───────────────────────────────┬───────────────────────────────────────┘ │
│                                  │                                          │
│  ┌───────────────────────────────▼───────────────────────────────────────┐ │
│  │                   PERSISTENCE LAYER                                   │ │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │ │
│  │  │ In-Memory Cache  │  │  Trading State   │  │  Event Store DB  │  │ │
│  │  │  (Orderbooks)    │  │ (Orders, Fills,  │  │  (ML Training    │  │ │
│  │  │                  │  │  Positions, PnL) │  │   Data)          │  │ │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │ │
│  └───────────────────────────────┬───────────────────────────────────────┘ │
│                                  │                                          │
│  ┌───────────────────────────────▼───────────────────────────────────────┐ │
│  │                      LEARNING SYSTEM                                  │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │ │
│  │  │ Backtest     │  │ Bandit       │  │ Promotion    │  │  Signal  │ │ │
│  │  │ Engine       │  │ Allocator    │  │ Workflow     │  │ Catalog  │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────┘ │ │
│  └───────────────────────────────┬───────────────────────────────────────┘ │
│                                  │                                          │
│  ┌───────────────────────────────▼───────────────────────────────────────┐ │
│  │                   SYNC & RECONCILIATION                               │ │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │ │
│  │  │  Sync Manager    │  │  Discrepancy     │  │  Recovery        │  │ │
│  │  │  (Orchestrator)  │  │  Detector        │  │  Procedures      │  │ │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │ │
│  └───────────────────────────────┬───────────────────────────────────────┘ │
│                                  │                                          │
│  ┌───────────────────────────────▼───────────────────────────────────────┐ │
│  │                   MONITORING & OBSERVABILITY                          │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │ │
│  │  │  Prometheus  │  │   Grafana    │  │  Alerting    │  │  Kill    │ │ │
│  │  │   Metrics    │  │  Dashboard   │  │  (Telegram)  │  │  Switch  │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────────┐ ┌───────────┐ ┌─────────────┐
            │  Polymarket   │ │   CLOB    │ │  Polygon    │
            │  Gamma API    │ │    API    │ │ Blockchain  │
            │  (Markets)    │ │(Trading)  │ │  (Chain)    │
            └───────────────┘ └───────────┘ └─────────────┘
```

---

## Entrypoints

### 1. HTTP Server (Primary Entrypoint)
**Location:** `apps/backend/src/index.ts` → `apps/backend/src/server/index.ts`

**Startup:**
```bash
npm run dev  # Development mode with tsx
npm start    # Production mode (compiled)
```

**Responsibilities:**
- Starts HTTP server on configured port (default: 3000)
- Initializes MarketFeedService (WebSocket connections)
- Exposes REST API endpoints for monitoring and trading
- Handles graceful shutdown on SIGTERM/SIGINT

**Routes:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | System health check |
| `/status` | GET | Trading mode, wallet, connection status |
| `/state` | GET | Complete trading state (orders, fills, positions) |
| `/orders` | GET | List of active orders |
| `/fills` | GET | Trade fill history |
| `/orderbooks` | GET | All cached orderbooks |
| `/orderbook/:tokenId` | GET | Specific orderbook with summary |
| `/feed/status` | GET | Market feed connection status |
| `/kill` | POST | Emergency kill switch (admin auth required) |

### 2. CLI Router
**Location:** `apps/backend/src/cli/index.ts`

**Commands:**
```bash
npm run markets [--limit N]      # List active markets from Gamma
npm run book --tokenId <ID>      # Display orderbook for token
npm run kill                     # Trigger kill switch via API
```

**Responsibilities:**
- Parse CLI arguments
- Route to appropriate command handler
- Direct access to Gamma/CLOB clients for read operations
- HTTP client for control operations (kill switch)

### 3. Frontend Application
**Location:** `apps/frontend/`

**Status:** Minimal placeholder (can be extended to React dashboard)

**Current State:**
- Basic TypeScript setup
- Not currently integrated with backend
- Placeholder for future monitoring dashboard

---

## Configuration Layer

### Location
`apps/backend/src/config/index.ts`

### Configuration Method
- **Environment Variables** loaded from `.env` file
- **Zod Schema Validation** ensures type safety and required fields
- **Fail-fast** on invalid or missing required configuration

### Core Configuration Schema

```typescript
{
  // API Endpoints
  GAMMA_API_URL: string        // Default: https://gamma-api.polymarket.com
  CLOB_API_URL: string         // Default: https://clob.polymarket.com
  WS_MARKET_URL: string        // Default: wss://ws-subscriptions-clob.polymarket.com
  
  // Trading Configuration
  TOKEN_IDS: string[]          // Comma-separated list of token IDs to monitor
  LIVE_TRADING: boolean        // Default: false (paper trading)
  COMPLIANCE_ACCEPTED: boolean // Must be true with LIVE_TRADING
  
  // Blockchain
  CHAIN_ID: 137 | 80002        // 137=mainnet, 80002=testnet
  PRIVATE_KEY?: string         // Required for live trading
  
  // Server
  PORT: number                 // Default: 3000
  LOG_LEVEL: string            // error | warn | info | debug
  
  // Security
  ADMIN_TOKEN?: string         // Required for kill switch
  
  // Risk Limits
  RISK_MAX_EXPOSURE_PER_MARKET: number
  RISK_MAX_OPEN_ORDERS: number
  RISK_MAX_DRAWDOWN: number
  RISK_ERROR_RATE_THRESHOLD: number
  
  // Paper Trading Parameters
  PAPER_TRADING_SLIPPAGE: number    // Default: 0.01 (1%)
  PAPER_TRADING_FEE_RATE: number    // Default: 0.002 (0.2%)
}
```

### Configuration Access Pattern
```typescript
import { config } from './config';

// Type-safe access (camelCase properties)
const apiUrl = config.gammaApiUrl;
const isLive = config.liveTrading;
```

---

## Strategy Modules

### 1. Strategy Framework (Abstract Factory)
**Location:** `apps/backend/src/trading/strategies/`

**Purpose:** Extensible framework for implementing trading strategies

**Components:**
- **IStrategy Interface** - Contract for all trading strategies
- **BaseStrategy** - Abstract base class with common functionality
- **StrategyFactory** - Factory pattern for strategy instantiation
- **StrategyOrchestrator** - Coordinates multiple strategies running in parallel
- **StrategyManager** - Lifecycle management with hot-reload support
- **Built-in Strategies**:
  - ArbitrageStrategy - Exploit YES + NO price discrepancies
  - MeanReversionStrategy - Statistical approach for prediction markets
  - MarketMakingStrategy - Liquidity provision
  - RandomStrategy - Testing only

**Usage:**
```typescript
import { registerStrategies, StrategyFactory } from './trading/strategies';

// Register built-in strategies
registerStrategies();

// Create from config
const strategy = await StrategyFactory.create({
  strategyId: 'my-strategy',
  type: 'arbitrage',
  enabled: true,
  params: { minProfitBps: 50, feeRate: 0.02 }
});

// Evaluate market
const decision = await strategy.evaluate(marketContext);
```

**Extensibility:**
- Register custom strategies via `StrategyFactory.register()`
- Implement `IStrategy` interface or extend `BaseStrategy`
- Load strategies from configuration files

### 2. Signal Generation Framework (GAP-010)
**Location:** `apps/backend/src/trading/SignalEngine.ts`

**Purpose:** Central signal processing, prioritization, and risk validation

**Status:** Framework implemented and tested. Runtime integration into server signal/execution flow is planned for future work.

**Architecture:**
```
StrategyOrchestrator → SignalEngine → ExecutionService
  (Generate signals)   (Process)      (Execute orders)
```

**Components:**
- **SignalEngine** - Core signal processing engine
- **Signal Interface** - Wraps TradingDecision with metadata
- **SignalResult** - Processing outcome (approved/rejected)

**Features:**
- **Signal Collection** - Aggregate signals from multiple strategies
- **Confidence Filtering** - Filter signals below minimum confidence threshold
- **Conflict Resolution** - Three strategies:
  - `highest-confidence` - Select signal with highest confidence
  - `first-wins` - FIFO processing
  - `aggregate` - Combine multiple signals (average price, sum size)
- **Risk Validation** - Integration with RiskManager for pre-execution checks
- **Performance Tracking** - Per-strategy metrics and signal history
- **Event Emission** - Real-time monitoring of signal processing

**Usage:**
```typescript
import { SignalEngine } from './trading/SignalEngine';
import { RiskManager } from './trading/riskManager';

// Initialize risk manager
const riskManager = new RiskManager({
  maxExposurePerMarket: 1000,
  maxOpenOrders: 10,
  maxDrawdown: 0.2,
});

// Initialize signal engine
const signalEngine = new SignalEngine(
  {
    enabled: true,
    maxSignalsPerToken: 3,
    minConfidence: 0.5,
    conflictResolution: 'highest-confidence',
  },
  riskManager
);

// Process signals from strategies
const signals = evaluationResults.map(r => ({
  decision: r.decision,
  strategyId: r.strategyId,
  strategyName: r.strategyName,
  tokenId: marketContext.tokenId,
  timestamp: r.timestamp,
  qualityScore: r.decision.confidence,
}));

const results = await signalEngine.processSignals(signals);

// Execute approved signals
for (const result of results) {
  if (result.approved) {
    const orderId = await executeOrder(result.signal.decision);
    signalEngine.markExecuted(result.signal, orderId);
  }
}

// Monitor performance
const metrics = signalEngine.getMetrics();
console.log(`Approval rate: ${metrics.approvalRate}`);
```

**Conflict Resolution Examples:**

*Highest Confidence:*
- Strategy A: BUY @ 0.50 (confidence: 0.7)
- Strategy B: BUY @ 0.52 (confidence: 0.9) ← Selected
- Strategy C: BUY @ 0.51 (confidence: 0.8)

*Aggregate:*
- Strategy A: BUY @ 0.50, size 10 (confidence: 0.7)
- Strategy B: BUY @ 0.60, size 15 (confidence: 0.8)
- Result: BUY @ 0.55, size 25 (confidence: 0.75)

### 3. Paper Trading Engine
**Location:** `apps/backend/src/trading/paperTradingEngine.ts`

**Purpose:** Simulate trading without real funds

**Features:**
- Deterministic order fills based on orderbook crossing
- Simulated slippage and fees (configurable)
- Position tracking (long/short)
- PnL calculation (realized + unrealized)
- Balance management (virtual USDC balance)

**State Management:**
```typescript
interface EngineState {
  orders: Order[]                     // Active orders
  fills: Fill[]                       // Trade history
  positions: Map<string, Position>    // Current positions per token
  balance: number                     // Current available USDC
  initialBalance: number              // Starting virtual USDC balance
  realizedPnl: number                 // Closed position P&L
}
```

**Fill Logic:**
1. Check if order price crosses current best bid/ask
2. Apply slippage to fill price
3. Deduct fees from fill
4. Update position and balance
5. Calculate PnL

### 4. Risk Manager
**Location:** `apps/backend/src/trading/riskManager.ts`

**Purpose:** Enforce risk limits and circuit breakers

**Circuit Breakers:**

| Limit | Default | Action When Breached |
|-------|---------|---------------------|
| Max Exposure per Market | $1000 | Reject new orders |
| Max Open Orders | 50 | Reject new orders |
| Max Drawdown | 20% | Halt all trading |
| Error Rate Threshold | 10% | Enter cooldown period |

**Kill Switch:**
- Emergency stop mechanism
- Cancels all open orders
- Disables new order placement
- Requires manual reset via admin API
- Triggered by: POST `/kill` with `ADMIN_TOKEN`

**Pre-Trade Checks:**
```typescript
interface RiskCheckResult {
  allowed: boolean
  reason?: string
  metrics: {
    currentExposure: number
    openOrderCount: number
    currentDrawdown: number
    errorRate: number
  }
}
```

### 5. Trading Client (Live)
**Location:** `apps/backend/src/clients/tradingClient.ts`

**Purpose:** Interface for live trading on Polymarket

**Dependencies:**
- `@polymarket/clob-client` - Official Polymarket SDK
- `ethers` - Ethereum wallet management

**Capabilities:**
- Create limit orders (BUY/SELL)
- Cancel orders
- Fetch open orders
- Fetch trade fills
- Fetch positions and balances
- State reconciliation on startup

**Authentication Flow:**
1. Load private key from environment
2. Create ethers Wallet
3. Initialize ClobClient with wallet
4. Sign orders with L2 API credentials

**State Reconciliation:**
On startup, fetch from CLOB API:
- All open orders
- Current positions
- Account balances
- Compare with local state
- Alert on discrepancies > threshold

---

## Execution Layer

### Order Management Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    ORDER LIFECYCLE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. SIGNAL GENERATION                                       │
│     ↓                                                       │
│  2. RISK CHECKS (Pre-trade validation)                     │
│     ├─ Exposure limits                                     │
│     ├─ Position limits                                     │
│     ├─ Drawdown limits                                     │
│     └─ Circuit breaker status                              │
│     ↓                                                       │
│  3. ORDER CREATION                                          │
│     ├─ Validate tick size                                  │
│     ├─ Validate min order size                             │
│     └─ Generate order ID                                   │
│     ↓                                                       │
│  4. ORDER SUBMISSION                                        │
│     ├─ [Live] Sign with API credentials                    │
│     ├─ [Live] Submit to CLOB API                           │
│     ├─ [Paper] Add to simulated orderbook                  │
│     └─ Store in local state                                │
│     ↓                                                       │
│  5. ORDER TRACKING                                          │
│     ├─ WebSocket updates (user channel)                    │
│     ├─ Status: OPEN → MATCHED → FILLED                     │
│     └─ Partial fills supported                             │
│     ↓                                                       │
│  6. FILL PROCESSING                                         │
│     ├─ Update position                                      │
│     ├─ Update balance                                       │
│     ├─ Calculate PnL                                        │
│     └─ Emit fill event                                      │
│     ↓                                                       │
│  7. POST-TRADE                                              │
│     ├─ Update metrics                                       │
│     ├─ Check risk limits                                    │
│     └─ Strategy reacts to fill                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Order Data Model

```typescript
interface Order {
  orderId: string              // Unique order identifier
  clientOrderId?: string       // Optional client-assigned ID
  tokenId: string              // Market token ID
  side: 'BUY' | 'SELL'        // Order direction
  price: string                // Limit price (decimal string)
  size: string                 // Order quantity (decimal string)
  status: OrderStatus          // OPEN | MATCHED | CANCELLED
  createdAt: number            // Unix timestamp
  filledSize?: string          // Quantity filled so far (optional)
}

interface Fill {
  orderId: string              // Associated order ID
  tokenId: string              // Market token ID
  side: 'BUY' | 'SELL'        // Fill direction
  price: string                // Execution price
  size: string                 // Fill quantity
  timestamp: number            // Unix timestamp
  fee?: string                 // Trading fee paid (optional)
}

interface Position {
  tokenId: string              // Market token ID
  size: string                 // Net position (positive=long, negative=short)
  averagePrice: string         // Average entry price
  marketValue?: string         // Current market value (optional)
  unrealizedPnl?: string       // Open position P&L (optional)
}
```

### Reconciliation Process

**Trigger:** Server startup or WebSocket reconnect

**Steps:**
1. Fetch remote state from CLOB API:
   - `GET /orders` - All open orders
   - `GET /positions` - Current positions
   - `GET /balances` - Account balances
2. Compare with local state
3. Identify discrepancies:
   - Orders exist remotely but not locally
   - Orders exist locally but not remotely
   - Position size mismatch
   - Balance mismatch
4. Resolution strategy:
   - **Remote state is source of truth**
   - Update local state to match remote
   - Log all discrepancies
   - Alert if discrepancy > threshold

---

## Adapters

### 1. Gamma Client (Market Discovery)
**Location:** `apps/backend/src/clients/gamma.ts`

**API Base:** `https://gamma-api.polymarket.com`

**Endpoints:**
- `GET /markets` - Fetch all active markets
- `GET /events` - Fetch market events

**Features:**
- Retry logic with exponential backoff
- Timeout handling (30s default)
- Response validation

**Usage:**
```typescript
const gamma = new GammaClient();
const markets = await gamma.getActiveMarkets();
```

**Market Data Model:**
```typescript
interface Market {
  id: string
  question: string
  active: boolean
  closed: boolean
  marketSlug: string
  outcomes: string[]
  outcomePrices: string[]
  tokens: Token[]
}
```

### 2. CLOB Client (Orderbook)
**Location:** `apps/backend/src/clients/clob.ts`

**API Base:** `https://clob.polymarket.com`

**Endpoints:**
- `GET /book` - Fetch orderbook snapshot
- `POST /order` - Create order (via SDK)
- `DELETE /order` - Cancel order (via SDK)

**Features:**
- Wraps `@polymarket/clob-client` SDK
- Retry logic
- Timeout handling
- Authentication with API credentials

**Usage:**
```typescript
const clob = new ClobClient();
const orderbook = await clob.getOrderbook(tokenId);
```

**Orderbook Data Model:**
```typescript
interface Orderbook {
  market: string
  asset_id: string
  bids: OrderbookLevel[]    // Buy orders (descending by price)
  asks: OrderbookLevel[]    // Sell orders (ascending by price)
  timestamp: number
}

interface OrderbookLevel {
  price: string         // Limit price
  size: string          // Total quantity at this price
}
```

### 3. Market Feed (Real-time Data)
**Location:** `apps/backend/src/clients/marketFeed.ts`

**WebSocket URL:** `wss://ws-subscriptions-clob.polymarket.com`

**Channels:**
- `market` - Orderbook updates for specific tokens

**Message Types:**
```typescript
type MarketMessage = {
  event_type: 'book' | 'last_trade_price'
  market: string
  asset_id: string
  timestamp: number
  // ... message-specific fields
}
```

**Features:**
- Auto-subscribe to configured tokens
- Event-driven message handling
- Integration with OrderbookCache
- Automatic resync on reconnect
- **Message deduplication (A-010):** LRU cache prevents duplicate processing

**Usage:**
```typescript
const feed = new MarketFeedClient(tokenIds, orderbookCache);
feed.on('orderbook', (tokenId, orderbook) => {
  // Handle orderbook update
});
await feed.connect();
```

### 4. WebSocket Base Client
**Location:** `apps/backend/src/clients/websocket.ts`

**Purpose:** Abstract WebSocket connection management

**Features:**
- **Auto-reconnect** with exponential backoff + jitter
- **State management:** DISCONNECTED → CONNECTING → CONNECTED → CLOSED
- **Heartbeat/ping-pong** support
- **Event emitter** pattern
- **Configurable reconnect delays**

**Connection States:**
```typescript
enum WebSocketState {
  DISCONNECTED,  // Initial or after disconnect
  CONNECTING,    // Connection attempt in progress
  CONNECTED,     // Active connection
  RECONNECTING,  // Scheduled reconnect after disconnect
  CLOSED         // Intentionally closed (no reconnect)
}
```

**Reconnect Logic:**
```typescript
// Exponential backoff with jitter
delay = min(baseDelay * 2^attempt + random(0, jitter), maxDelay)

// Default config:
baseDelay: 1000ms
maxDelay: 30000ms
maxReconnectAttempts: Infinity
```

**Events:**
- `open` - Connection established
- `message` - Message received
- `close` - Connection closed
- `error` - Error occurred
- `reconnecting` - Reconnect attempt starting

### WebSocket State Machine Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                    WEBSOCKET CONNECTION STATE MACHINE                  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                         ┌──────────────┐                              │
│                         │              │                              │
│                    ┌────│ DISCONNECTED │                              │
│                    │    │  (Initial)   │                              │
│                    │    └──────┬───────┘                              │
│                    │           │                                       │
│           close()  │           │ connect()                            │
│                    │           │                                       │
│                    │           ▼                                       │
│                    │    ┌──────────────┐                              │
│                    │    │              │                              │
│                    │    │  CONNECTING  │                              │
│                    │    │  (Handshake) │                              │
│                    │    └──────┬───────┘                              │
│                    │           │                                       │
│                    │      ┌────┴────┐                                 │
│                    │      │         │                                 │
│                    │  onopen    error/close                           │
│                    │      │         │                                 │
│                    │      ▼         ▼                                 │
│                    │  ┌─────────┐ ┌──────────────┐                   │
│                    │  │         │ │              │                   │
│                    └─▶│CONNECTED│ │ RECONNECTING │◀─┐                │
│                       │(Active) │ │ (Backoff)    │  │                │
│                       └────┬────┘ └──────┬───────┘  │                │
│                            │             │          │                │
│                     error/ │             │ timeout  │                │
│                     close  │             │          │                │
│                            └─────────────┴──────────┘                │
│                            │                                          │
│                            │ close(manual)                            │
│                            ▼                                          │
│                     ┌──────────────┐                                 │
│                     │              │                                 │
│                     │    CLOSED    │                                 │
│                     │  (Terminal)  │                                 │
│                     └──────────────┘                                 │
│                                                                        │
│  TRANSITIONS:                                                          │
│  • DISCONNECTED → CONNECTING: User calls connect()                    │
│  • CONNECTING → CONNECTED: WebSocket handshake succeeds               │
│  • CONNECTING → RECONNECTING: Connection fails, scheduleReconnect()   │
│  • CONNECTED → RECONNECTING: Connection lost, scheduleReconnect()     │
│  • RECONNECTING → CONNECTING: After backoff delay expires             │
│  • {CONNECTING, CONNECTED, RECONNECTING} → CLOSED: User calls close() │
│                                                                        │
│  RECONNECT BEHAVIOR:                                                   │
│  • RECONNECTING state schedules reconnect after backoff delay         │
│  • Exponential backoff: delay *= backoffMultiplier each attempt       │
│  • Jitter applied as multiplier: delay *= (1 + random(-0.1, +0.1))   │
│  • Capped at maxDelay: delay = min(delay * jitter, maxDelay)         │
│  • On CONNECTED, reset reconnect counter and current delay            │
│  • On CLOSED, no further reconnect attempts                           │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Order Lifecycle State Machine

```
┌────────────────────────────────────────────────────────────────────────┐
│                     ORDER LIFECYCLE STATE MACHINE                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                        ┌──────────────┐                               │
│                        │              │                               │
│                   ┌────│   CREATED    │                               │
│                   │    │  (Pre-submit)│                               │
│                   │    └──────┬───────┘                               │
│                   │           │                                        │
│                   │           │ Submit to exchange                     │
│                   │           │                                        │
│                   │           ▼                                        │
│                   │    ┌──────────────┐                               │
│      Risk check   │    │              │                               │
│      fails        │    │     OPEN     │◀──┐                           │
│                   │    │ (On exchange)│   │                           │
│                   │    └──────┬───────┘   │                           │
│                   │           │            │ Partial fill             │
│                   │           │            │                           │
│                   │    ┌──────┴───────┬────┴─────┐                    │
│                   │    │              │          │                     │
│        Cancel     │    ▼              ▼          │                     │
│                   │  ┌──────┐    ┌─────────┐    │                     │
│                   └─▶│      │    │         │    │                     │
│                      │REJECT│    │ MATCHED │    │                     │
│                      │ ED   │    │(Partial)│────┘                     │
│                      │      │    │         │                           │
│                      └──────┘    └────┬────┘                           │
│                          │            │                                │
│                          │            │ Complete fill                  │
│                          │            │                                │
│                          │            ▼                                │
│                          │     ┌──────────────┐                        │
│                          │     │              │                        │
│                          │     │    FILLED    │                        │
│                          │     │  (Complete)  │                        │
│                          │     └──────────────┘                        │
│                          │            │                                │
│                          │            │                                │
│                          │            ▼                                │
│                          │     ┌──────────────┐                        │
│                          │     │              │                        │
│                          └────▶│   TERMINAL   │                        │
│                                │   (Final)    │                        │
│                                └──────────────┘                        │
│                                       ▲                                │
│                                       │                                │
│                                       │                                │
│                                ┌──────┴───────┐                        │
│                                │              │                        │
│                                │  CANCELLED   │                        │
│                                │ (User action)│                        │
│                                └──────────────┘                        │
│                                                                        │
│  STATES:                                                               │
│  • CREATED: Order validated, awaiting submission                      │
│  • REJECTED: Failed risk checks or validation                         │
│  • OPEN: Successfully submitted to exchange, awaiting match           │
│  • MATCHED: Partially or fully matched, awaiting settlement           │
│  • FILLED: Order fully executed                                       │
│  • CANCELLED: Order cancelled by user or system                       │
│  • TERMINAL: Final state (FILLED, CANCELLED, or REJECTED)             │
│                                                                        │
│  TRANSITIONS:                                                          │
│  • CREATED → REJECTED: Risk check fails                               │
│  • CREATED → OPEN: Successfully submitted to exchange                 │
│  • OPEN → MATCHED: Counterparty found, fill in progress               │
│  • OPEN → CANCELLED: User or system cancels order                     │
│  • MATCHED → MATCHED: Partial fill, order still active                │
│  • MATCHED → FILLED: Order fully executed                             │
│  • MATCHED → CANCELLED: Remaining quantity cancelled                  │
│  • {FILLED, CANCELLED, REJECTED} → TERMINAL: Final state reached      │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Persistence Layer

### Current State: In-Memory Only ⚠️

**Implications:**
- All state lost on server restart
- No audit trail persistence
- Cannot replay or backtest historical data
- Reconciliation required on every startup

### 1. Orderbook Cache
**Location:** `apps/backend/src/clients/orderbookCache.ts`

**Data Structure:**
```typescript
class OrderbookCache {
  private cache: Map<string, Orderbook>
  
  set(tokenId: string, orderbook: Orderbook): void
  get(tokenId: string): Orderbook | undefined
  clear(): void
}
```

**Lifecycle:**
- Populated by MarketFeedClient on orderbook updates
- Cleared on WebSocket disconnect
- Used by paper trading engine for fill simulation

### 2. Trading State (In-Memory)
**Location:** `apps/backend/src/trading/paperTradingEngine.ts` and `apps/backend/src/clients/tradingClient.ts`

**Stored State:**
- Active orders (Map)
- Fill history (Array)
- Positions (Map)
- Balances (Object)
- PnL metrics

**Reconciliation:** 
- Live trading client reconciles with CLOB API on startup
- Paper trading state is lost on restart (no persistence)

### 3. Future Persistence Requirements

**Needed:**
- Database for audit trail (orders, fills, positions)
- Time-series database for metrics (PnL, exposure, etc.)
- Object storage for orderbook snapshots
- Event log for replay and debugging

**Candidates:**
- PostgreSQL for relational data (orders, fills, positions)
- TimescaleDB or InfluxDB for time-series metrics
- Redis for caching and session state
- S3/GCS for orderbook snapshots

---

## Learning System

The Learning System provides an advanced framework for strategy optimization, backtesting, and automated allocation using machine learning techniques. This subsystem enables data-driven strategy selection and performance optimization.

**Location:** `apps/backend/src/learning/`

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      LEARNING SYSTEM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐   │
│  │ Event Store │─────▶│  Backtest   │─────▶│  Metrics    │   │
│  │  (SQLite)   │      │   Engine    │      │   Gating    │   │
│  └─────────────┘      └─────────────┘      └──────┬──────┘   │
│         │                                           │          │
│         │             ┌─────────────┐              │          │
│         └────────────▶│   Signal    │              │          │
│                       │  Catalog    │              │          │
│                       └─────────────┘              │          │
│                                                     ▼          │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐   │
│  │   Bandit    │◀─────│  Promotion  │◀─────│  Strategy   │   │
│  │ Allocator   │      │  Workflow   │      │  Selection  │   │
│  └─────────────┘      └─────────────┘      └─────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1. Event Store

**Purpose:** Persistent event database for ML training data and audit trail

**Location:** `apps/backend/src/learning/eventStore.ts`

**Implementation:**
- SQLite database for event sourcing
- Stores all trading events: orders, fills, market data, signals
- Enables replay and historical backtesting

**Schema:**
```typescript
// Event envelope - common fields for all events
// See apps/backend/src/learning/types.ts for full definition
interface EventEnvelope<T = unknown> {
  eventId: string;           // UUID
  eventType: EventType;      // 'MarketEvent' | 'OrderBookUpdateEvent' | 'SignalEvent' | etc.
  eventVersion: number;
  occurredAt: string;        // ISO timestamp
  receivedAt: string;        // ISO timestamp
  marketId: string;
  source: EventSource;       // 'websocket' | 'rest' | 'strategy' | 'simulation'
  payload: T;
}
```

**Key Operations:**
- `writeEvent(...)`: Append new event to the store
- `writeEventsIdempotent(...)`: Write multiple events with deduplication
- `queryEvents(filters)`: Retrieve events with filtering (by type, market, time range)
- Export functionality for offline analysis

### 2. Backtest Engine

**Purpose:** Historical backtesting framework for strategy validation

**Location:** `apps/backend/src/learning/backtestEngine.ts`

**Features:**
- Replays historical events from EventStore
- Simulates strategy execution with historical data
- Calculates performance metrics (Sharpe, drawdown, win rate)
- Validates strategies before live deployment

**Workflow:**
```
1. Load historical events from EventStore
2. Initialize strategy with backtest configuration
3. Replay events chronologically
4. Collect strategy signals and simulated trades
5. Calculate performance metrics
6. Generate backtest report
```

**Configuration:**
```typescript
// See apps/backend/src/learning/types.ts for full definition
interface BacktestConfig {
  backtestId: string;
  strategyId: string;
  strategyConfig?: Record<string, unknown>; // Strategy-specific params
  startDate: string;         // ISO timestamp
  endDate: string;           // ISO timestamp
  markets: string[];         // Market IDs
  initialBalance: number;
  slippage: number;
  feeRate: number;
  seed?: number;             // For reproducibility
}
```

### 3. Signal Catalog

**Purpose:** Catalog of trading signals with validation and metadata

**Location:** `apps/backend/src/learning/signalCatalog.ts`

**Features:**
- Registry of available trading signals
- Signal validation and schema enforcement
- Performance tracking per signal type
- Signal discovery and documentation

**Signal Schema:**
```typescript
// See apps/backend/src/learning/types.ts for full definition
interface SignalEvent {
  signalId: string;
  signalName: string;
  signalValue: number | string | boolean;
  signalVersion: string;
  featureSetId: string;
  metadata: Record<string, unknown>;
}
```

### 4. Bandit Allocator

**Purpose:** Multi-armed bandit strategy allocation for adaptive optimization

**Location:** `apps/backend/src/learning/banditAllocator.ts`

**Algorithms Supported:**
- **Epsilon-Greedy**: Explore with probability ε, exploit best strategy otherwise
- **UCB1 (Upper Confidence Bound)**: Balance exploration vs exploitation with confidence intervals
- **Thompson Sampling**: Bayesian approach using beta distributions

**How It Works:**
1. Track performance metrics for each strategy
2. Calculate allocation weights using selected algorithm
3. Dynamically adjust capital allocation based on recent performance
4. Explore underperforming strategies to detect improvements
5. Exploit high-performing strategies with larger allocations

**Configuration:**
```typescript
// See apps/backend/src/learning/types.ts for full definition
interface AllocationConfig {
  totalCapital: number;      // Total capital the allocator can distribute
  minAllocation: number;     // Minimum fraction or amount per strategy
  maxAllocation: number;     // Maximum fraction or amount per strategy
  algorithm?: 'epsilon-greedy' | 'ucb1' | 'thompson-sampling';
  epsilon?: number;          // For epsilon-greedy
  explorationFactor?: number; // For UCB1
}
```

### 5. Promotion Workflow

**Purpose:** Automated strategy promotion pipeline from backtest to production

**Location:** `apps/backend/src/learning/promotionWorkflow.ts`

**Stages:**
1. **Backtest**: Validate strategy with historical data
2. **Metrics Gating**: Check performance against thresholds
3. **Paper Trading**: Test in simulation mode
4. **Shadow Mode**: Run alongside live strategies without execution
5. **Staged Rollout**: Gradual capital allocation increase
6. **Production**: Full allocation

**Promotion Gates:**
```typescript
interface PromotionGates {
  minSharpeRatio: number;
  maxDrawdown: number;
  minWinRate: number;
  minTrades: number;
  minBacktestDays: number;
  minPaperTradingDays: number;
}
```

**Workflow:**
```
Backtest → Pass Gates? → Paper Trade → Pass Gates? → Shadow → Production
             ↓ No                        ↓ No
          Reject                      Demote to Backtest
```

### 6. Metrics Gating

**Purpose:** Performance gate validation for strategy promotion

**Location:** `apps/backend/src/learning/metricsGating.ts`

**Metrics Evaluated:**

_Note: Thresholds below show default values from `apps/backend/src/learning/metricsGating.ts`. These can be overridden via configuration._

- **Sharpe Ratio**: Risk-adjusted return (default: > 1.0)
- **Maximum Drawdown**: Peak-to-trough decline (default: < 10%)
- **Trade Count**: Statistical significance (default: > 30 trades)
- **Minimum Days**: Data collection period (default: > 30 days)
- **Error Rate**: Maximum error rate (default: < 1%)

**Decision Logic:**
```typescript
interface GateDecision {
  passed: boolean;
  metrics: {
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    profitFactor: number;
    tradeCount: number;
  };
  failedGates: string[];
}
```

### Integration with Trading System

**Data Flow:**
1. Trading events → EventStore (persistent log)
2. EventStore → BacktestEngine (historical validation)
3. BacktestEngine → MetricsGating (performance check)
4. MetricsGating → PromotionWorkflow (advance stage)
5. BanditAllocator → StrategyManager (dynamic allocation)

**API Endpoints:**
- `GET /api/learning/experiments` - List learning experiments
- `GET /api/learning/strategies` - List strategies in learning system
- `GET /api/learning/best` - Get current best strategy/allocation
- `GET /api/learning/status` - Get learning system status

**Related Documentation:**
- [Strategy Hot Reload](./STRATEGY_HOT_RELOAD.md)
- [Signal Engine](./SIGNAL_ENGINE.md)
- [Backtest Integration](./BACKTEST_INTEGRATION.md)
- [Learning System](./learning-system.md)

---

## Sync & Reconciliation

The Sync & Reconciliation subsystem ensures consistency between the bot's local state and the external exchange state. It detects discrepancies and performs automated recovery procedures.

**Location:** `apps/backend/src/sync/`

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                  SYNC & RECONCILIATION SYSTEM                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐   │
│  │   Local     │      │    Sync     │      │  Exchange   │   │
│  │   State     │─────▶│  Manager    │◀─────│   State     │   │
│  │  (Memory)   │      │             │      │  (CLOB API) │   │
│  └─────────────┘      └──────┬──────┘      └─────────────┘   │
│                              │                                 │
│                              ▼                                 │
│                       ┌─────────────┐                          │
│                       │ Discrepancy │                          │
│                       │  Detector   │                          │
│                       └──────┬──────┘                          │
│                              │                                 │
│                              ▼                                 │
│                       ┌─────────────┐                          │
│                       │  Recovery   │                          │
│                       │ Procedures  │                          │
│                       └─────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1. Sync Manager

**Purpose:** Orchestrates state reconciliation between local and exchange state

**Location:** `apps/backend/src/sync/syncManager.ts`

**Key Responsibilities:**
- Schedule periodic sync checks
- Trigger sync on startup and reconnection
- Coordinate discrepancy detection and recovery
- Emit sync events for monitoring

**Sync Triggers:**
- **Startup**: Initial reconciliation on bot start
- **Reconnection**: After WebSocket reconnect
- **Scheduled**: Periodic checks (e.g., every 5 minutes)
- **Manual**: Triggered via API or CLI
- **Event-Driven**: On fill notifications or order updates

**Workflow:**
```
1. Fetch local state (orders, positions, balances)
2. Fetch exchange state via CLOB API
3. Compare and detect discrepancies
4. Execute recovery procedures if needed
5. Update local state to match exchange
6. Log reconciliation results
7. Emit sync completion event
```

### 2. Discrepancy Detector

**Purpose:** Detects differences between local and exchange state

**Location:** `apps/backend/src/sync/discrepancyDetector.ts`

**Discrepancy Types:**

**Order Discrepancies:**
- **Phantom Orders**: Local order missing on exchange (likely cancelled)
- **Ghost Orders**: Exchange order missing locally (missed notification)
- **Status Mismatch**: Order status differs (e.g., local=OPEN, exchange=FILLED)
- **Attribute Mismatch**: Price, size, or side differs

**Position Discrepancies:**
- **Size Mismatch**: Local position size differs from exchange
- **Missing Position**: Position exists on exchange but not locally
- **Phantom Position**: Position exists locally but not on exchange

**Balance Discrepancies:**
- **Balance Drift**: Available balance differs from exchange
- **Reserved Mismatch**: Locked funds differ from open orders

**Detection Algorithm:**
```typescript
interface Discrepancy {
  type: 'ORDER' | 'POSITION' | 'BALANCE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  local: any;
  exchange: any;
  action: 'UPDATE_LOCAL' | 'UPDATE_EXCHANGE' | 'MANUAL_REVIEW';
}
```

### 3. Recovery Procedures

**Purpose:** Automated recovery workflows to resolve discrepancies

**Location:** `apps/backend/src/sync/recoveryProcedures.ts`

**Recovery Actions:**

**For Order Discrepancies:**
- **Phantom Orders**: Mark local order as cancelled, update state
- **Ghost Orders**: Fetch order details from exchange, add to local state
- **Status Mismatch**: Update local status to match exchange
- **Attribute Mismatch**: Log error, prefer exchange state (source of truth)

**For Position Discrepancies:**
- **Size Mismatch**: Update local position to match exchange
- **Missing Position**: Add position to local state with exchange data
- **Phantom Position**: Remove from local state, log warning

**For Balance Discrepancies:**
- **Balance Drift**: Update local balance from exchange
- **Reserved Mismatch**: Recalculate based on current open orders

**Recovery Workflow:**
```
1. Classify discrepancy by type and severity
2. Determine appropriate recovery action
3. Execute recovery procedure
4. Verify recovery success
5. Log recovery results
6. Alert if manual review needed
```

**Safety Guardrails:**
- Critical discrepancies trigger alerts
- Large position mismatches require manual approval
- Recovery actions are logged to audit trail
- Failed recoveries escalate to operators

### Integration with Trading System

**Sync Points:**
1. **Startup**: Full reconciliation before trading begins
2. **WebSocket Reconnect**: Re-sync after connection loss
3. **Order Fill**: Verify fill matches expectation
4. **Periodic Check**: Regular state validation
5. **Error Recovery**: After API errors or timeouts

**Data Sources:**
- **Local State**: In-memory trading state, EventStore
- **Exchange State**: CLOB API endpoints (orders, positions, balances)
- **Blockchain State**: Optional on-chain verification (future)

**Integration:**

_Note: Sync operations are currently integrated within the trading system. Dedicated API endpoints are planned for future releases._

- Automatic reconciliation on startup and WebSocket reconnect
- Periodic scheduled checks (configured via `RECONCILIATION_INTERVAL_SECONDS`)
- Accessed programmatically through `SyncManager` in code

**Related Documentation:**
- [Sync Module Test Procedure](./SYNC_MODULE_TEST_PROCEDURE.md)
- [Order State Machine](./order-state-machine.md)
- [Runbook - Reconciliation](./runbook.md#reconciliation-procedures)

---

## Monitoring & Dashboard

### 1. Structured Logging
**Location:** `apps/backend/src/utils/logger.ts`

**Format:** JSON-based structured logging

**Log Levels:**
- `ERROR` - Critical failures
- `WARN` - Warning conditions
- `INFO` - Informational messages
- `DEBUG` - Detailed debug information

**Configuration:**
```typescript
LOG_LEVEL=debug  # Set via environment variable
```

**Log Structure:**
```json
{
  "level": "info",
  "timestamp": "2026-01-31T20:00:00.000Z",
  "message": "Order filled",
  "orderId": "abc123",
  "tokenId": "456",
  "side": "BUY",
  "price": "0.50",
  "size": "10"
}
```

**Usage:**
```typescript
import { logger } from './utils/logger';

logger.info('Order submitted', { orderId, tokenId });
logger.error('API error', { error: err.message });
```

### 2. Health Check
**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "ok",
  "uptime": 3600,
  "memory": {
    "used": 50000000,
    "total": 100000000
  },
  "timestamp": 1738357200000
}
```

### 3. Status Endpoints

**Trading Status:** `GET /status`
```json
{
  "mode": "live" | "paper",
  "liveTradingEnabled": true,
  "walletAddress": "0x...",
  "feedConnected": true,
  "killSwitchActive": false
}
```

**Trading State:** `GET /state`
```json
{
  "orders": [...],
  "fills": [...],
  "positions": [...],
  "balances": {...},
  "pnl": {
    "realized": "123.45",
    "unrealized": "67.89",
    "total": "191.34"
  }
}
```

**Market Feed Status:** `GET /feed/status`
```json
{
  "connected": true,
  "tokenIds": ["token1", "token2", "token3"],
  "cachedOrderbooks": 5
}
```

### 4. Kill Switch
**Endpoint:** `POST /kill`

**Authentication:** Requires `Authorization: Bearer <ADMIN_TOKEN>` header

**Response:**
```json
{
  "success": true,
  "message": "Kill switch activated",
  "cancelledOrders": 10
}
```

**Effects:**
- Cancels all open orders
- Sets `killSwitchActive = true`
- Blocks all new order submissions
- Requires manual reset to resume

### 5. Frontend Dashboard (Future)
**Location:** `apps/frontend/`

**Planned Features:**
- Real-time PnL chart
- Active orders table
- Position summary
- Risk metrics gauges
- Connection status indicators
- Kill switch button
- Log viewer

---

## Infrastructure & Deployment

The bot includes comprehensive infrastructure components for containerization, monitoring, and deployment automation.

### 1. Docker Infrastructure

**Multi-Stage Dockerfile:**
- **Builder Stage**: Compiles TypeScript, installs dependencies
- **Production Stage**: Minimal runtime image with compiled code only
- Size optimization: ~200MB final image

**Location:** `Dockerfile`

**Build:**
```bash
docker build -t polymarket-bot:latest .
```

### 2. Docker Compose Services

**Location:** `docker-compose.yml`

**Services:**

| Service | Port | Purpose |
|---------|------|---------|
| **backend** | 3000 | Trading bot HTTP API |
| **frontend** | 8080 | Static dashboard UI (served via http-server) |
| **prometheus** | 9092 | Metrics collection |
| **grafana** | 3001 | Monitoring dashboard |

**Network:** All services on `polymarket-network` bridge

**Volumes:**
- `./data` (bind mount): Backend persistent state (EventStore, logs, artifacts)
- `frontend-static`: Built frontend assets served by the frontend container
- `prometheus-data`: Prometheus time-series database storage
- `grafana-data`: Grafana dashboards and configuration

**Health Checks:**
- Backend: HTTP `GET /health` every 30s
- Frontend: HTTP GET healthcheck (wget) every 30s
- Prometheus & Grafana: No healthchecks configured in `docker-compose.yml`

**Start all services:**
```bash
docker-compose up -d
```

### 3. Monitoring Stack

**Prometheus Configuration:**
- **Metrics Endpoint**: `http://backend:9090/metrics`
- **Scrape Interval**: 15 seconds
- **Retention**: 15 days
- **Storage**: Local TSDB in container

**Grafana Dashboard:**
- **Location**: `grafana/polymarket-dashboard.json`
- **Datasource**: Prometheus
- **Panels**:
  - Trading volume and PnL
  - Order success/failure rates
  - WebSocket connection health
  - API latency percentiles
  - Circuit breaker status
  - Active positions by market
  - Strategy performance comparison

**Alerting:**
- **Service**: AlertingService (Telegram integration)
- **Location**: `apps/backend/src/utils/alerting.ts`
- **Triggers**:
  - Trading losses exceed threshold
  - Circuit breaker activates
  - WebSocket disconnect
  - Kill switch activated
  - API error rate spike

### 4. Deployment Options

**Cloud Deployment:**

**Terraform (AWS EC2):**
- **Location**: `infrastructure/terraform/`
- **Resources**: EC2 instance, security groups, EBS volumes
- **Region**: Configurable
- **Instance Type**: t3.medium (2 vCPU, 4GB RAM)

**Kubernetes:**
- **Location**: `infrastructure/kubernetes/`
- **Manifests**: Deployment, Service, ConfigMap, Secret
- **Scaling**: HPA (Horizontal Pod Autoscaler) configured
- **Storage**: PersistentVolumeClaim for EventStore

**Ansible Playbooks:**
- **Location**: `infrastructure/ansible/`
- **Playbooks**:
  - `setup.yml`: Install dependencies
  - `deploy.yml`: Deploy application
  - `backup.yml`: Backup state and logs

**Deployment Commands:**
```bash
# Terraform
cd infrastructure/terraform
terraform init
terraform apply

# Kubernetes
kubectl apply -f infrastructure/kubernetes/

# Ansible
cd infrastructure/ansible
ansible-playbook -i inventory setup.yml
ansible-playbook -i inventory deploy.yml
```

### 5. Environment Configuration

**Environment Files:**
- `.env.example`: Template with all variables documented
- `.env.codespaces.example`: GitHub Codespaces configuration
- `.env`: Local development (not committed)

**Key Variables:**
- `LIVE_TRADING`: Enable live trading mode
- `COMPLIANCE_ACCEPTED`: Compliance acknowledgment
- `LOG_LEVEL`: Logging verbosity
- `TELEGRAM_BOT_TOKEN`: Alerting integration
- API credentials (see [Secret Management](./SECRET_MANAGEMENT_QUICK_REFERENCE.md))

**Related Documentation:**
- [Deployment Guide](./deployment-guide.md)
- [Docker Implementation Summary](./docker-implementation-summary.md)
- [Infrastructure](./infrastructure.md)
- [Observability](./observability.md)

---

## API Endpoints

The HTTP server exposes REST API endpoints for system control, monitoring, and configuration.

**Server:** `apps/backend/src/server/index.ts`

**Base URL:** `http://localhost:3000`

### Health & Status

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check (liveness probe) |
| `/ready` | GET | Readiness check (system initialized) |
| `/status` | GET | System status and metrics |

### Trading Operations

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/state` | GET | View current trading state (orders, fills, positions, balances) |
| `/orders` | GET | List active orders |
| `/orders` | POST | Place new order (requires admin auth) |
| `/fills` | GET | View fill history |

### Strategy Management

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/strategies` | GET | List loaded strategies |
| `/strategies/:id/enable` | POST | Enable strategy |
| `/strategies/:id/disable` | POST | Disable strategy |
| `/strategies/reload` | POST | Hot-reload strategies |

### Learning System

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/learning/experiments` | GET | List learning experiments and their configurations |
| `/api/learning/strategies` | GET | List strategies participating in learning/experiments |
| `/api/learning/best` | GET | Retrieve currently selected "best" strategy/allocation |
| `/api/learning/status` | GET | Get learning system health and experiment status |

### Sync & Reconciliation

_Note: Sync operations are currently integrated within the trading system. Dedicated API endpoints are planned for future releases._

**Current Integration:**
- Automatic reconciliation on startup and WebSocket reconnect
- Periodic scheduled checks (configured via `RECONCILIATION_INTERVAL_SECONDS`)
- Accessed programmatically through `SyncManager` in code

### Configuration

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/config` | GET | View current config |
| `/api/config/:type` | GET | Get specific config file (strategies, signals, markets) |
| `/api/config/:type` | PUT | Update config file (hot-reload) |
| `/api/config/:type` | DELETE | Delete config file |
| `/api/config/validate/:type` | POST | Validate config before applying |
| `/api/config/reload` | POST | Reload all config from environment |
| `/api/config/watching` | GET | Get config file watching status |
| `/api/config/watching/start` | POST | Start watching config files |
| `/api/config/watching/stop` | POST | Stop watching config files |

### Safety & Control

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/kill-switch` | POST | Emergency stop |
| `/circuit-breaker/status` | GET | Circuit breaker status |
| `/circuit-breaker/reset` | POST | Reset circuit breakers |

### Monitoring

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/metrics` | GET | Prometheus metrics |
| `/logs` | GET | Recent logs (query params) |

**Authentication:**
- **Public endpoints**: `/health`, `/ready`, `/metrics` (no auth required)
- **Admin endpoints**: Most operational endpoints require `Authorization: Bearer <ADMIN_TOKEN>` header
  - Examples: `/orders` (POST), `/kill-switch`, `/api/config/*`, `/api/learning/*`
- Token configured via `ADMIN_TOKEN` environment variable

**Rate Limiting:**
- 100 requests per minute per client (configurable)
- Circuit breaker protects backend

**Example Requests:**
```bash
# Public endpoint - no auth
curl http://localhost:3000/health

# Admin endpoint - requires token
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3000/state

# Config management - requires token
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3000/api/config
```

**Related Documentation:**
- [API Alignment Verification](./api-alignment-verification.md)
- [Dashboard Usage Guide](./dashboard-usage-guide.md)

---

## Critical Paths

### Path 1: Market Discovery → Data Ingest
```
┌──────────────────────────────────────────────────────────────┐
│  CRITICAL PATH 1: MARKET DISCOVERY → DATA INGEST            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. MARKET DISCOVERY                                         │
│     ↓                                                        │
│     GammaClient.getActiveMarkets()                          │
│     ├─ GET https://gamma-api.polymarket.com/markets        │
│     ├─ Parse response (markets + tokens)                    │
│     └─ Filter by criteria (volume, liquidity, etc.)         │
│     ↓                                                        │
│  2. TOKEN SELECTION                                          │
│     ↓                                                        │
│     Extract TOKEN_IDS from config or discovery              │
│     ├─ Validate token format                                │
│     └─ Store token metadata                                 │
│     ↓                                                        │
│  3. ORDERBOOK BOOTSTRAP                                      │
│     ↓                                                        │
│     ClobClient.getOrderbook(tokenId)                        │
│     ├─ GET https://clob.polymarket.com/book                │
│     ├─ Parse bids/asks arrays                               │
│     └─ Populate OrderbookCache                              │
│     ↓                                                        │
│  4. WEBSOCKET SUBSCRIPTION                                   │
│     ↓                                                        │
│     MarketFeedClient.connect()                              │
│     ├─ WebSocket handshake                                  │
│     ├─ Subscribe to market channel for each token           │
│     └─ Start receiving real-time updates                    │
│     ↓                                                        │
│  5. DATA INGEST LOOP                                         │
│     ↓                                                        │
│     On WebSocket message:                                    │
│     ├─ Parse orderbook update                               │
│     ├─ Update OrderbookCache                                │
│     ├─ Emit 'orderbook' event                               │
│     └─ Strategy consumes update                             │
│                                                              │
│  FAILURE MODES:                                              │
│  • Gamma API unavailable → Retry or use fallback list       │
│  • CLOB API unavailable → Cannot bootstrap, wait & retry    │
│  • WebSocket disconnect → Auto-reconnect + resync           │
│  • Invalid orderbook data → Log error, skip update          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Path 2: Signal → Risk Check → Order
```
┌──────────────────────────────────────────────────────────────┐
│  CRITICAL PATH 2: SIGNAL GENERATION → ORDER PLACEMENT       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. SIGNAL GENERATION                                        │
│     ↓                                                        │
│     Strategy analyzes orderbook update                      │
│     ├─ Market making: Calculate bid/ask quotes              │
│     ├─ Arbitrage: Detect YES+NO price inefficiency          │
│     └─ Generate order intent (side, price, size)            │
│     ↓                                                        │
│  2. PRE-TRADE VALIDATION                                     │
│     ↓                                                        │
│     Validate order parameters                                │
│     ├─ Price aligns with tick size (e.g., $0.01)           │
│     ├─ Size meets minimum order size (e.g., 1 share)       │
│     ├─ Side is valid (BUY or SELL)                          │
│     └─ Token ID is valid                                     │
│     ↓                                                        │
│  3. RISK CHECKS                                              │
│     ↓                                                        │
│     RiskManager.checkOrder(order)                           │
│     ├─ Check exposure: position + order ≤ max exposure      │
│     ├─ Check order count: open orders < max open orders     │
│     ├─ Check drawdown: current drawdown < max drawdown      │
│     ├─ Check error rate: recent errors < threshold          │
│     ├─ Check kill switch: not activated                     │
│     └─ Return RiskCheckResult                               │
│     ↓                                                        │
│     If any check fails → REJECT order, log reason           │
│     ↓                                                        │
│  4. ORDER CREATION                                           │
│     ↓                                                        │
│     Create Order object                                      │
│     ├─ Generate unique order ID                             │
│     ├─ Set status = OPEN                                    │
│     ├─ Set timestamp                                         │
│     └─ Store in local state                                 │
│     ↓                                                        │
│  5. ORDER SUBMISSION                                         │
│     ↓                                                        │
│     [LIVE MODE]                                              │
│     TradingClient.createOrder(order)                        │
│     ├─ Sign order with API credentials (HMAC)               │
│     ├─ POST to CLOB API                                     │
│     ├─ Receive order confirmation                           │
│     └─ Update order status                                  │
│     ↓                                                        │
│     [PAPER MODE]                                             │
│     PaperTradingEngine.createOrder(order)                   │
│     ├─ Add to simulated order list                          │
│     ├─ Check if order crosses orderbook (immediate fill)    │
│     └─ Update simulated state                               │
│     ↓                                                        │
│  6. POST-SUBMISSION                                          │
│     ↓                                                        │
│     Emit 'order_created' event                              │
│     ├─ Update metrics                                        │
│     ├─ Log order details                                     │
│     └─ Wait for fill updates                                │
│                                                              │
│  FAILURE MODES:                                              │
│  • Risk check fails → Order rejected, log reason            │
│  • API error → Retry with backoff, alert on repeated fails  │
│  • Order rejected by exchange → Log, analyze, adjust        │
│  • Kill switch active → Block order, alert operator         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Path 3: Order Lifecycle → PnL/Reporting
```
┌──────────────────────────────────────────────────────────────┐
│  CRITICAL PATH 3: ORDER LIFECYCLE → PNL → REPORTING         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. ORDER SUBMITTED (from Path 2)                            │
│     ↓                                                        │
│     Order status: OPEN                                       │
│     ├─ Order sits on orderbook                              │
│     ├─ Wait for counterparty                                │
│     └─ Subscribe to order updates (WebSocket user channel)  │
│     ↓                                                        │
│  2. ORDER MATCHING                                           │
│     ↓                                                        │
│     [LIVE MODE]                                              │
│     ├─ CLOB engine matches order                            │
│     ├─ WebSocket sends 'order_matched' message              │
│     └─ Update order status: MATCHED                         │
│     ↓                                                        │
│     [PAPER MODE]                                             │
│     ├─ On orderbook update, check if order crosses          │
│     ├─ Simulate matching against best bid/ask               │
│     └─ Update order status: MATCHED                         │
│     ↓                                                        │
│  3. ORDER FILLING                                            │
│     ↓                                                        │
│     Create Fill object                                       │
│     ├─ fillId: unique identifier                            │
│     ├─ orderId: reference to order                          │
│     ├─ price: execution price                               │
│     ├─ size: filled quantity                                │
│     ├─ fee: trading fee (if any)                            │
│     └─ timestamp: fill time                                 │
│     ↓                                                        │
│     Update Order                                             │
│     ├─ filledSize += fill.size                              │
│     ├─ remainingSize -= fill.size                           │
│     └─ If remainingSize == 0 → status = FILLED              │
│     ↓                                                        │
│  4. POSITION UPDATE                                          │
│     ↓                                                        │
│     Update Position for tokenId                             │
│     ├─ BUY: size += fill.size                               │
│     ├─ SELL: size -= fill.size                              │
│     ├─ Recalculate averagePrice                             │
│     └─ Update lastUpdate timestamp                          │
│     ↓                                                        │
│  5. BALANCE UPDATE                                           │
│     ↓                                                        │
│     Update USDC balance                                      │
│     ├─ BUY: balance -= (fill.price * fill.size + fill.fee) │
│     ├─ SELL: balance += (fill.price * fill.size - fill.fee)│
│     └─ Validate balance remains non-negative                │
│     ↓                                                        │
│  6. PNL CALCULATION                                          │
│     ↓                                                        │
│     If position closed (size = 0):                           │
│     ├─ Calculate realized PnL                               │
│     ├─ realizedPnL = sellValue - buyValue - fees            │
│     └─ Update cumulative realized PnL                       │
│     ↓                                                        │
│     If position still open:                                  │
│     ├─ Calculate unrealized PnL                             │
│     ├─ unrealizedPnL = currentValue - costBasis             │
│     └─ Update unrealized PnL                                │
│     ↓                                                        │
│  7. METRICS UPDATE                                           │
│     ↓                                                        │
│     Update trading metrics                                   │
│     ├─ Total fills count                                    │
│     ├─ Total volume traded                                  │
│     ├─ Win rate (profitable trades / total trades)          │
│     ├─ Average fill price                                   │
│     └─ Current drawdown                                     │
│     ↓                                                        │
│  8. REPORTING & LOGGING                                      │
│     ↓                                                        │
│     Log fill event                                           │
│     ├─ Structured JSON log                                  │
│     ├─ Include all fill details                             │
│     └─ Include PnL impact                                   │
│     ↓                                                        │
│     Emit 'fill' event                                        │
│     ├─ Strategy reacts to fill                              │
│     ├─ Risk manager updates exposure                        │
│     └─ Monitoring dashboard updates                         │
│     ↓                                                        │
│     Expose via API endpoints                                 │
│     ├─ GET /state - Full trading state                      │
│     ├─ GET /fills - Fill history                            │
│     └─ GET /orders - Order status                           │
│                                                              │
│  FAILURE MODES:                                              │
│  • Fill notification missed → Reconciliation detects gap    │
│  • PnL calculation error → Log error, alert, manual review  │
│  • Balance goes negative → Circuit breaker triggers         │
│  • Position size mismatch → Reconciliation corrects         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Complete Critical Path Visualization
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        COMPLETE CRITICAL PATH                               │
│                   (Market → Order → Fill → PnL → Report)                    │
└─────────────────────────────────────────────────────────────────────────────┘

    MARKET DISCOVERY           DATA INGEST              SIGNAL GENERATION
    ===============            ===========              =================
           │                        │                          │
           ▼                        ▼                          ▼
    ┌──────────────┐       ┌──────────────┐          ┌──────────────┐
    │ Gamma API:   │       │ CLOB REST:   │          │ Strategy     │
    │ Get Active   │──────▶│ Bootstrap    │─────────▶│ Analyzes     │
    │ Markets      │       │ Orderbooks   │          │ Orderbook    │
    └──────────────┘       └──────────────┘          └──────┬───────┘
                                   │                         │
                                   ▼                         ▼
                           ┌──────────────┐          ┌──────────────┐
                           │ WebSocket:   │          │ Generate     │
                           │ Real-time    │          │ Order Intent │
                           │ Updates      │          │ (side, $, Ø) │
                           └──────┬───────┘          └──────┬───────┘
                                  │                         │
                                  ▼                         │
                           ┌──────────────┐                │
                           │ Orderbook    │                │
                           │ Cache        │                │
                           └──────────────┘                │
                                                            │
    RISK CHECKS                ORDER SUBMISSION            FILL PROCESSING
    ===========                ================            ===============
           │                          │                          │
           ▼                          ▼                          ▼
    ┌──────────────┐         ┌──────────────┐          ┌──────────────┐
    │ Risk Manager │         │ [LIVE]       │          │ WebSocket:   │
    │ Validates:   │────────▶│ CLOB API     │─────────▶│ Fill         │
    │ • Exposure   │         │ Submit Order │          │ Notification │
    │ • Limits     │         │              │          └──────┬───────┘
    │ • Drawdown   │         │ [PAPER]      │                 │
    │ • Kill SW    │         │ Simulate     │                 ▼
    └──────────────┘         │ Fill         │          ┌──────────────┐
           │                 └──────┬───────┘          │ Update:      │
           │                        │                  │ • Position   │
           ▼                        ▼                  │ • Balance    │
    ┌──────────────┐         ┌──────────────┐         │ • PnL        │
    │ If PASS:     │         │ Order Status │         └──────┬───────┘
    │ Continue     │         │ = OPEN       │                │
    │              │         └──────────────┘                ▼
    │ If FAIL:     │                                  ┌──────────────┐
    │ Reject Order │                                  │ Realized PnL │
    └──────────────┘                                  │ Unrealized   │
                                                      │ PnL          │
                                                      └──────┬───────┘
                                                             │
    REPORTING & MONITORING                                   │
    ======================                                   │
           │                                                 │
           ▼                                                 ▼
    ┌──────────────┐         ┌──────────────┐       ┌──────────────┐
    │ Structured   │         │ HTTP API     │       │ Metrics      │
    │ Logs (JSON)  │◀────────│ Endpoints    │◀──────│ Update       │
    └──────────────┘         │ /state       │       │ • Volume     │
           │                 │ /fills       │       │ • Win Rate   │
           │                 │ /orders      │       │ • Exposure   │
           │                 └──────────────┘       └──────────────┘
           ▼
    ┌──────────────┐
    │ Dashboard    │
    │ (Future)     │
    └──────────────┘

    ⚠️  FAILURE RECOVERY POINTS:
    • WebSocket disconnect → Auto-reconnect + resync from REST API
    • API error → Exponential backoff retry
    • Risk check fail → Order rejected, log reason
    • Kill switch → Cancel all orders, halt trading
    • State mismatch → Reconciliation on startup/reconnect
```

---

## Data Flow Diagrams

### Complete System Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           COMPLETE SYSTEM DATA FLOW                                 │
│                     (External APIs → Internal State → Reports)                      │
└─────────────────────────────────────────────────────────────────────────────────────┘

EXTERNAL SOURCES                 INGESTION LAYER              PROCESSING LAYER
================                 ===============              ================

┌──────────────────┐            ┌──────────────────┐        ┌──────────────────┐
│  Gamma API       │────────────│  GammaClient     │───────▶│ Market Registry  │
│  (Markets)       │  HTTP GET  │  (REST)          │        │ (Active Markets) │
└──────────────────┘            └──────────────────┘        └────────┬─────────┘
                                                                      │
                                                                      │ Market metadata
                                                                      ▼
┌──────────────────┐            ┌──────────────────┐        ┌──────────────────┐
│  CLOB API        │────────────│  ClobClient      │───────▶│ Orderbook Cache  │
│  (Orderbook)     │  HTTP GET  │  (REST)          │        │ Map<ID, OB>      │
└──────────────────┘            └──────────────────┘        └────────┬─────────┘
                                                                      │
                                                                      │ Price data
                                                                      ▼
┌──────────────────┐            ┌──────────────────┐        ┌──────────────────┐
│  WS Market Feed  │════════════│ MarketFeedClient │═══════▶│  Event Stream    │
│  (Real-time)     │  WebSocket │ (Subscriptions)  │        │  (Orderbook      │
└──────────────────┘            └──────────────────┘        │   Updates)       │
                                                             └────────┬─────────┘
                                                                      │
                                                                      │ Live updates
                                                                      ▼
                                        
STRATEGY LAYER                   EXECUTION LAYER              STATE MANAGEMENT
==============                   ===============              ================

┌──────────────────┐            ┌──────────────────┐        ┌──────────────────┐
│  Strategy Logic  │            │  RiskManager     │        │  Trading State   │
│  (Signal Gen)    │───────────▶│  (Pre-trade      │───────▶│  • Orders        │
│  • Market Making │  Order     │   Validation)    │ Pass   │  • Fills         │
│  • Arbitrage     │  Intent    │  • Limits        │        │  • Positions     │
│  • Signals       │            │  • Drawdown      │        │  • Balances      │
└──────────────────┘            │  • Kill Switch   │        └────────┬─────────┘
        ▲                       └────────┬─────────┘                 │
        │                                │                            │
        │ Market data                    │ Reject                     │
        │                                ▼                            ▼
        │                       ┌──────────────────┐        ┌──────────────────┐
        └───────────────────────│  Log & Alert     │        │  PnL Calculator  │
                                │  (Rejected)      │        │  • Realized      │
                                └──────────────────┘        │  • Unrealized    │
                                                            │  • Total         │
                                                            └────────┬─────────┘
                                         │                           │
                                         │ If Pass                   │
                                         ▼                           ▼

TRADING LAYER                    RECONCILIATION               OUTPUT LAYER
=============                    ==============               ============

┌──────────────────┐            ┌──────────────────┐        ┌──────────────────┐
│  [LIVE MODE]     │            │  Startup         │        │  HTTP API        │
│  TradingClient   │◀───────────│  Reconciliation  │        │  • /state        │
│  • Create order  │  Compare   │  • Fetch remote  │        │  • /orders       │
│  • Cancel order  │            │  • Compare local │        │  • /fills        │
│  • Sign + submit │            │  • Update state  │        │  • /orderbooks   │
└────────┬─────────┘            └──────────────────┘        └────────┬─────────┘
         │                                                            │
         │ Order confirmation                                         │
         ▼                                                            ▼
┌──────────────────┐                                        ┌──────────────────┐
│  [PAPER MODE]    │                                        │  Dashboard UI    │
│  PaperEngine     │                                        │  (Future)        │
│  • Simulate fill │                                        │  • Live PnL      │
│  • Apply slippage│                                        │  • Orders table  │
│  • Update state  │                                        │  • Kill switch   │
└────────┬─────────┘                                        └──────────────────┘
         │
         │ Fill events
         ▼
┌──────────────────┐                                        ┌──────────────────┐
│  Fill Processing │                                        │  Structured Logs │
│  • Update pos    │───────────────────────────────────────▶│  (JSON)          │
│  • Update bal    │   Log all events                      │  • Trades        │
│  • Calculate PnL │                                        │  • Errors        │
└──────────────────┘                                        │  • Metrics       │
                                                            └──────────────────┘

DATA FLOW SUMMARY:
1. Market data flows: Gamma → Markets, CLOB/WS → Orderbooks → Strategy
2. Order flow: Strategy → Risk → Execution → State
3. Fill flow: Execution → State → PnL → Logs/API
4. State flow: All changes → Trading State → API/Dashboard
5. Reconciliation: Startup/Reconnect → Fetch Remote → Update Local → Log
```

### WebSocket Reconnection and Resync Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WEBSOCKET RECONNECTION & RESYNC FLOW                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. NORMAL OPERATION                                                        │
│     ┌─────────────┐                                                        │
│     │ WS CONNECTED│───▶ Receiving real-time orderbook updates              │
│     └──────┬──────┘                                                        │
│            │                                                                │
│            ▼                                                                │
│     ┌─────────────────────────────────────────────────────────┐           │
│     │  CONNECTION LOST (Network issue, server restart, etc.)  │           │
│     └──────┬──────────────────────────────────────────────────┘           │
│            │                                                                │
│            ▼                                                                │
│  2. DETECTION & LOGGING                                                     │
│     ┌─────────────┐                                                        │
│     │ onclose()   │───▶ Log: "WebSocket disconnected"                      │
│     │ event fires │───▶ Set state: RECONNECTING                            │
│     └──────┬──────┘───▶ Clear orderbook cache (stale data)                │
│            │                                                                │
│            ▼                                                                │
│  3. BACKOFF CALCULATION                                                     │
│     ┌──────────────────────────────────────────────────────┐              │
│     │ Calculate delay = min(currentDelay * jitter, maxDelay)│              │
│     │ - jitter: random multiplier (1 ± reconnectJitter)     │              │
│     │   e.g., jitter=0.1 → multiplier between 0.9 and 1.1  │              │
│     │ - currentDelay increases after each attempt:          │              │
│     │   currentDelay *= backoffMultiplier (default 2x)      │              │
│     │ Log: "Scheduling reconnect in {delay}ms (attempt {N})"│              │
│     └──────┬───────────────────────────────────────────────┘              │
│            │                                                                │
│            ▼                                                                │
│  4. RECONNECTION ATTEMPT                                                    │
│     ┌─────────────┐                                                        │
│     │ setTimeout  │───▶ Call connect() again                               │
│     │ (delay)     │───▶ Set state: CONNECTING                              │
│     └──────┬──────┘                                                        │
│            │                                                                │
│     ┌──────┴───────┐                                                       │
│     │              │                                                        │
│     ▼              ▼                                                        │
│  SUCCESS        FAILURE                                                     │
│     │              │                                                        │
│     │              └──▶ Increment attempt counter                           │
│     │                  Go back to step 3 (exponential backoff)             │
│     │                                                                       │
│     ▼                                                                       │
│  5. RESYNC STATE (Critical)                                                 │
│     ┌─────────────┐                                                        │
│     │ onopen()    │───▶ Log: "WebSocket reconnected"                       │
│     │ event fires │───▶ Set state: CONNECTED                               │
│     └──────┬──────┘───▶ Reset reconnect counter = 0                        │
│            │                                                                │
│            ▼                                                                │
│     ┌──────────────────────────────────────────────────────┐              │
│     │ ORDERBOOK RESYNC (Bootstrap from REST API)           │              │
│     │                                                       │              │
│     │  For each tokenId in subscriptions:                  │              │
│     │    1. GET /book?token_id={tokenId} (CLOB REST API)   │              │
│     │    2. Parse orderbook snapshot                       │              │
│     │    3. Update OrderbookCache with fresh data          │              │
│     │    4. Log: "Resynced orderbook for {tokenId}"       │              │
│     │                                                       │              │
│     └──────┬───────────────────────────────────────────────┘              │
│            │                                                                │
│            ▼                                                                │
│     ┌──────────────────────────────────────────────────────┐              │
│     │ RE-SUBSCRIBE TO CHANNELS                             │              │
│     │                                                       │              │
│     │  For each tokenId:                                   │              │
│     │    1. Send subscribe message to market channel       │              │
│     │    2. Log: "Subscribed to {tokenId}"                │              │
│     │                                                       │              │
│     └──────┬───────────────────────────────────────────────┘              │
│            │                                                                │
│            ▼                                                                │
│  6. RESUME NORMAL OPERATION                                                 │
│     ┌─────────────┐                                                        │
│     │ FULLY SYNCED│───▶ Resume receiving real-time updates                 │
│     │ & CONNECTED │───▶ Strategy can safely trade again                    │
│     └─────────────┘                                                        │
│                                                                             │
│  FAILURE HANDLING:                                                          │
│  • If resync fails → Log error, retry resync (with backoff)                │
│  • If max reconnect attempts reached → Enter CLOSED state, alert operator   │
│  • During resync, trading is paused to prevent stale data trades           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Risk Check Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RISK CHECK DATA FLOW                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  INPUT: Order Intent                                                    │
│  ┌────────────────────────────────────────────────────────┐           │
│  │ { tokenId, side, price, size, strategy }               │           │
│  └───────────────────────┬────────────────────────────────┘           │
│                          │                                             │
│                          ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ RISK MANAGER: checkOrder(order)                                │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                          │                                             │
│            ┌─────────────┼─────────────┬─────────────┐                │
│            │             │             │             │                │
│            ▼             ▼             ▼             ▼                │
│   ┌───────────────┐ ┌────────────┐ ┌──────────┐ ┌──────────┐        │
│   │ CHECK 1:      │ │ CHECK 2:   │ │ CHECK 3: │ │ CHECK 4: │        │
│   │ Kill Switch   │ │ Circuit    │ │ Max Open │ │ Max      │        │
│   │ Active?       │ │ Breaker    │ │ Orders   │ │ Exposure │        │
│   │               │ │ (Error     │ │          │ │ Per      │        │
│   │               │ │  Rate)     │ │          │ │ Market   │        │
│   └───────┬───────┘ └─────┬──────┘ └────┬─────┘ └────┬─────┘        │
│           │               │              │            │               │
│           │               │              │            │               │
│   Is kill switch    Error rate     Open order   Current pos         │
│   active?           < threshold?   count < max?  + order < max      │
│   └──NO───┐         └──YES──┐      └──YES──┐    exposure?          │
│           │                 │              │     └──YES──┐           │
│           │                 │              │             │           │
│           └─────────────────┴──────────────┴─────────────┘           │
│                                │                                      │
│                                ▼                                      │
│                    ┌───────────────────────┐                         │
│                    │ ALL CHECKS PASSED     │                         │
│                    └───────────┬───────────┘                         │
│                                │                                      │
│                                ▼                                      │
│  OUTPUT: RiskCheckResult                                             │
│  ┌────────────────────────────────────────────────────────┐          │
│  │ {                                                       │          │
│  │   allowed: true                                         │          │
│  │ }                                                       │          │
│  └───────────────────────┬────────────────────────────────┘          │
│                          │                                            │
│                          ▼                                            │
│              ┌───────────────────────┐                               │
│              │ PROCEED TO ORDER      │                               │
│              │ SUBMISSION            │                               │
│              └───────────────────────┘                               │
│                                                                       │
│  REJECTION FLOW (Any check fails):                                   │
│  ┌────────────────────────────────────────────────────────┐          │
│  │ {                                                       │          │
│  │   allowed: false,                                       │          │
│  │   reason: "Trading is killed by risk manager" |         │          │
│  │           "Circuit breaker tripped: error rate" |       │          │
│  │           "Max open orders limit reached" |             │          │
│  │           "Max exposure per market exceeded"            │          │
│  │ }                                                       │          │
│  └───────────────────────┬────────────────────────────────┘          │
│                          │                                            │
│                          ▼                                            │
│              ┌───────────────────────┐                               │
│              │ REJECT ORDER          │                               │
│              │ LOG REASON            │                               │
│              │ EMIT REJECTION EVENT  │                               │
│              └───────────────────────┘                               │
│                                                                       │
│  NOTE: Drawdown check is separate (checkDrawdown method)             │
│  Balance validation happens at order submission, not risk check      │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Runtime & Language
- **Node.js** >= 20.0.0
- **TypeScript** (strict mode)
- **tsx** (development execution)

### HTTP & Networking
- **Native http module** (server)
- **axios** (HTTP client)
- **ws** (WebSocket client)

### Blockchain & Trading
- **ethers.js** v6 (wallet management)
- **@polymarket/clob-client** (official Polymarket SDK)

### Configuration & Validation
- **Zod** (schema validation)
- **dotenv** (environment variables)

### Logging & Monitoring
- **Pino** (structured logging with rotation)
- **prom-client** (Prometheus metrics)
- **Grafana** (visualization and dashboards)

### Persistence & Data
- **SQLite** (EventStore for learning system)
- **In-memory** (orderbooks, trading state)

### Machine Learning & Optimization
- **Custom bandit algorithms** (epsilon-greedy, UCB1, Thompson sampling)
- **Backtest engine** (historical validation)
- **Signal catalog** (trading signal registry)

### Testing
- **Vitest** (unit and integration tests)
- **@vitest/coverage-v8** (code coverage)

### Build & Tooling
- **TypeScript Compiler** (tsc)
- **npm workspaces** (monorepo management)
- **eslint** (linting with TypeScript support)

### Deployment & Infrastructure
- **Docker** - Containerization with multi-stage builds
  - Base: `node:20-alpine` (minimal footprint)
  - Init: `tini` (proper signal handling)
  - Security: Non-root user (`polymarket:1001`)
- **Docker Compose** - Local orchestration (4 services)
  - backend (port 3000)
  - frontend (port 8080)
  - prometheus (port 9092)
  - grafana (port 3001)
- **GitHub Actions** - CI/CD with security scanning
  - Trivy (vulnerability scanning)
  - TruffleHog (secret detection)
- **Terraform** - Infrastructure as Code (AWS EC2)
- **Kubernetes** - Production orchestration with HPA
- **Ansible** - Configuration management and deployment automation

**Deployment Options:**
1. **Docker (Recommended):** `docker-compose up -d`
2. **Native:** Direct Node.js execution
3. **Kubernetes:** Production-grade with manifests

**See [Docker Deployment Guide](./docker.md) for details.**

### Monorepo Structure
```
polymarket-bot/
├── apps/
│   ├── backend/          # Node.js + TypeScript
│   └── frontend/         # React (minimal)
├── packages/
│   └── shared/           # Shared TypeScript types
├── Dockerfile            # Production deployment
├── docker-compose.yml    # Local development
└── docs/                 # Documentation
```

---

## Module Dependency Graph

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         MODULE DEPENDENCIES                              │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                          apps/backend/src/                               │
│                                                                          │
│                        ┌─────────────────┐                              │
│                        │   index.ts      │ (Entry point)                │
│                        └────────┬────────┘                              │
│                                 │                                        │
│                  ┌──────────────┼──────────────┐                        │
│                  │              │              │                         │
│         ┌────────▼────────┐    │    ┌────────▼────────┐                │
│         │ server/index.ts │    │    │  cli/index.ts   │                │
│         └────────┬────────┘    │    └────────┬────────┘                │
│                  │             │             │                          │
│                  │             │             │                          │
│    ┌─────────────┼─────────────┼─────────────┼─────────────┐           │
│    │             │             │             │             │           │
│    ▼             ▼             ▼             ▼             ▼           │
│ ┌──────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌────────┐      │
│ │config│   │  logger │   │ clients │   │ trading │   │ server │      │
│ └──┬───┘   └─────────┘   └────┬────┘   └────┬────┘   └────────┘      │
│    │                           │             │                         │
│    │                           │             │                         │
│    │         ┌─────────────────┼─────────────┤                         │
│    │         │                 │             │                         │
│    │         ▼                 ▼             ▼                         │
│    │   ┌──────────┐     ┌──────────┐  ┌──────────────┐               │
│    │   │  gamma   │     │   clob   │  │ paperTrading │               │
│    │   │  Client  │     │  Client  │  │   Engine     │               │
│    │   └──────────┘     └──────────┘  └──────────────┘               │
│    │         │                 │             │                         │
│    │         │                 │             │                         │
│    │         ▼                 ▼             ▼                         │
│    │   ┌──────────┐     ┌──────────┐  ┌──────────────┐               │
│    │   │ websocket│     │  market  │  │ riskManager  │               │
│    │   │   Base   │     │   Feed   │  └──────────────┘               │
│    │   └──────────┘     └────┬─────┘                                  │
│    │         │               │                                         │
│    │         │               ▼                                         │
│    │         │         ┌──────────┐                                    │
│    │         │         │orderbook │                                    │
│    │         │         │  Cache   │                                    │
│    │         │         └──────────┘                                    │
│    │         │                                                          │
│    │         └────────── Uses WebSocket Base                           │
│    │                                                                    │
│    └─────────── Provides config to all modules                         │
│                                                                          │
│                                                                          │
│                      packages/shared/src/                               │
│                                                                          │
│                        ┌─────────────┐                                  │
│                        │  index.ts   │                                  │
│                        │  (types)    │                                  │
│                        └──────┬──────┘                                  │
│                               │                                          │
│                Used by all backend modules                              │
│                (Token, Market, Orderbook, Order, Fill, Position)        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

DEPENDENCY RULES:
1. config/ has no dependencies (leaf module)
2. types/ (shared) has no dependencies
3. utils/ (logger) has minimal dependencies
4. clients/ depend on config, logger, types
5. trading/ depends on clients, config, logger, types
6. server/ depends on all modules (top-level orchestration)
7. cli/ depends on clients, config, logger
8. index.ts depends on server and cli (router)

CIRCULAR DEPENDENCY PREVENTION:
- All modules import from config (one-way)
- Types in shared package (no backend imports)
- Logger is utility only (imported, never imports business logic)
- Clients don't import from trading
- Trading imports from clients (one-way)
```

---

## Detailed Data Flow Diagrams

For operational procedures using these flows, see [Runbook](./runbook.md).  
For troubleshooting data flow issues, see [Troubleshooting Guide](./troubleshooting.md).

### WebSocket Connection & Market Data Flow

**Purpose:** Real-time market data ingestion and orderbook maintenance

**Connection Flow:**
```
┌──────────┐              ┌─────────────┐              ┌──────────────┐
│  Server  │─────init────▶│  WebSocket  │─────conn────▶│ Polymarket   │
│  Start   │              │   Client    │              │  WS Server   │
└──────────┘              └──────┬──────┘              └───────┬──────┘
                                 │                             │
                          STATE: CONNECTING              Handshake
                                 │                             │
                          STATE: CONNECTED◀───────────────────┘
                                 │
                          Subscribe to markets
                          {type: "market", markets: [...]}
                                 │
                          STATE: SUBSCRIBED
                                 │
                         ┌───────▼────────────────────────────────────┐
                         │  Market Updates (price, book, trades)      │
                         └───────┬────────────────────────────────────┘
                                 │
                         ┌───────▼─────────┐
                         │  MarketFeed     │
                         │  Service        │
                         │  - Parse msgs   │
                         │  - Validate     │
                         │  - Cache update │
                         └───────┬─────────┘
                                 │
                         ┌───────▼────────┐
                         │  Orderbook     │
                         │    Cache       │
                         │  (in-memory)   │
                         │  - getBest()   │
                         │  - getMid()    │
                         └────────────────┘
```

**Reconnection Flow (Audit Findings A-007, A-016 addressed):**
```
Disconnect → Exponential Backoff → Reconnect → Re-subscribe → Resync
   │            (1s, 2s, 4s...)        │            │             │
   │                                   │            │      CLOB REST API
   │                              New WebSocket  Resubscribe  /book endpoint
   │                                   │            │             │
   └─────────────────────────────STATE: RECONNECTING─────────────┘
                                       │
                                STATE: CONNECTED
                                    (resumed)
```

**Key Implementation Details:**
- Exponential backoff prevents thundering herd (Audit Finding A-023 - needs jitter implementation)
- Resync prevents stale data (Audit Finding A-015 - cache TTL needed)
- Message deduplication via sequence numbers (Audit Finding A-010 - RESOLVED in ADR-0008)
- Race condition prevention (Audit Finding A-007 - per-token lock needed)
- Reconnect timer cleanup (Audit Finding A-016 - timer leak needs fix)

_Note:_ The audit report (dated 2026-02-01) listed some findings as Open. Some have since been addressed in the codebase (e.g., A-010 message deduplication). Refer to individual ADRs and recent commits for current implementation status.

### Order Placement Data Flow

**Live Trading Path:**
```
┌───────────┐
│ Strategy  │ Generate signal (BUY/SELL, price, size)
└─────┬─────┘
      │
┌─────▼──────┐
│ Gate Check │ LIVE_TRADING=true AND COMPLIANCE_ACCEPTED=true?
└─────┬──────┘
      │ Yes (or Paper mode)
┌─────▼──────┐
│ Risk Check │ Exposure, Position, Drawdown, Kill Switch, Circuit Breaker
└─────┬──────┘
      │ Pass
┌─────▼──────────┐
│ Validation     │ Tick size, Min/max size, Side, Token ID
│ (Zod schema)   │ Generate UUID order ID (Audit Finding A-006 RESOLVED)
└─────┬──────────┘
      │ Valid
┌─────▼──────────┐
│ Sign Order     │ Wallet private key signature
│ (ethers.js)    │ L2 API credentials
└─────┬──────────┘
      │
┌─────▼──────────┐
│ CLOB API       │ POST /order
│ Submission     │ Response: {orderId, status: "OPEN"}
└─────┬──────────┘
      │
┌─────▼──────────┐
│ Store in       │ orders Map: clientOrderId → {orderId, status, ...}
│ Tracking       │ Monitor via WebSocket for fills
└────────────────┘
```

**Paper Trading Path:**
```
┌───────────┐
│ Strategy  │ Generate signal
└─────┬─────┘
      │
┌─────▼──────┐
│ Gate Check │ LIVE_TRADING=false → Paper mode
└─────┬──────┘
      │
┌─────▼──────┐
│ Risk Check │ Same as live
└─────┬──────┘
      │
┌─────▼──────────┐
│ Validation     │ Same as live, UUID order ID
└─────┬──────────┘
      │
┌─────▼──────────────────┐
│ Simulate Fill          │
│ 1. Check if price      │
│    crosses orderbook   │
│ 2. Apply slippage      │
│    (default 1%)        │
│ 3. Apply fees          │
│    (default 0.2%)      │
│ 4. Update position     │
│ 5. Update balance      │
│ 6. Calculate PnL       │
└─────┬──────────────────┘
      │
┌─────▼──────────┐
│ Update State   │ orders[], fills[], positions, balance, pnl
└────────────────┘
```

**Key Differences:**
- Live: Real CLOB API, blockchain signatures, actual funds
- Paper: Simulated fills, virtual balance, realistic slippage/fees

### Kill Switch Data Flow

**Activation Flow (Audit Finding A-002 RESOLVED with persistence):**
```
┌──────────┐
│ Trigger  │ Manual (POST /kill-switch) or Auto (risk breach)
└─────┬────┘
      │
┌─────▼────────────┐
│ Auth Check       │ Validate ADMIN_TOKEN (Audit Finding A-004)
└─────┬────────────┘
      │ Authorized
┌─────▼────────────┐
│ Validate Scope   │ "all", "market" (requires tokenId), or "risk-only"
└─────┬────────────┘
      │ Valid
┌─────▼────────────────────┐
│ RiskManager              │
│ 1. Set killed = true     │
│ 2. Store scope, reason   │
│ 3. Record timestamp      │
└─────┬────────────────────┘
      │
┌─────▼────────────────────┐
│ Persist to Disk          │
│ File: .state/kill-switch.json
│ {killed: true,           │
│  timestamp, reason}      │
└─────┬────────────────────┘
      │
      ├──────────────┬──────────────┐
      │              │              │
┌─────▼────────┐ ┌──▼──────┐ ┌─────▼─────────┐
│ Cancel All   │ │ Block   │ │ Return HTTP   │
│ Open Orders  │ │ New     │ │ 200 Success   │
│ (if live)    │ │ Orders  │ │ {cancelled: N}│
└──────────────┘ └─────────┘ └───────────────┘
```

**Persistence on Restart:**
```
┌──────────┐
│ Restart  │ Server initialization
└─────┬────┘
      │
┌─────▼────────────────────┐
│ Load State from Disk     │
│ Read: .state/kill-switch.json
└─────┬────────────────────┘
      │
┌─────▼────────────────────┐
│ Validate with Zod Schema │
│ Schema: {killed, timestamp, reason}
│ Invalid → Fail closed    │
│ (killed = true)          │
└─────┬────────────────────┘
      │ Valid
┌─────▼────────────────────┐
│ Restore RiskManager      │
│ killed = loaded.killed   │
│ If true → Trading DISABLED
│ If false → Trading enabled
└──────────────────────────┘
```

_Note:_ The persisted state schema (see [apps/backend/src/utils/statePersistence.ts](../apps/backend/src/utils/statePersistence.ts)) stores `{killed, timestamp, reason}`. The `scope` field shown in earlier documentation is not currently persisted and would need to be added to the schema if selective kill-switch persistence is required.

**Deactivation:**
```
Manual: Delete .state/kill-switch.json + restart backend
        (No HTTP DELETE endpoint is currently implemented)
```

### Balance Reconciliation Data Flow

**Startup & Periodic (every 5 minutes):**
```
┌──────────────┐
│ Timer Tick   │ Startup or periodic (Gap RE-001)
└──────┬───────┘
       │
┌──────▼────────────────────┐
│ TradingClient.reconcile() │
└──────┬────────────────────┘
       │
       ├────────────────┬────────────────┬────────────────┐
       │                │                │                │
┌──────▼──────┐  ┌──────▼──────┐  ┌─────▼──────┐  ┌─────▼──────┐
│ Fetch Wallet│  │ Fetch Open  │  │ Fetch      │  │ Fetch      │
│ Balance     │  │ Orders      │  │ Fills      │  │ Positions  │
│ (Polygon)   │  │ (CLOB API)  │  │ (CLOB API) │  │ (Calculate)│
└──────┬──────┘  └──────┬──────┘  └─────┬──────┘  └─────┬──────┘
       │                │                │                │
       └────────────────┴────────────────┴────────────────┘
                        │
               ┌────────▼─────────┐
               │ Compare with     │
               │ Local State      │
               └────────┬─────────┘
                        │
        ┌───────────────┼───────────────┬──────────────┐
        │               │               │              │
┌───────▼────────┐ ┌────▼─────────┐ ┌──▼──────────┐ ┌─▼────────────┐
│ Missing Orders │ │ Orphaned     │ │ Balance     │ │ Position     │
│ (Gap RE-002)   │ │ Orders       │ │ Drift       │ │ Drift        │
│ In local but   │ │ On CLOB but  │ │ (Gap RE-003)│ │ Size mismatch│
│ not on CLOB    │ │ not in local │ │ >10% alert  │ │ >5% alert    │
└───────┬────────┘ └────┬─────────┘ └──┬──────────┘ └─┬────────────┘
        │               │               │              │
        │ Log warning   │ Add to local  │ Update local │ Recalculate
        │ Remove from   │ OR cancel     │ balance      │ positions
        │ local state   │               │              │
        └───────────────┴───────────────┴──────────────┘
                        │
               ┌────────▼─────────┐
               │ Log Summary      │
               │ - Orders: N      │
               │ - Balance drift: │
               │ - Position drift:│
               │ - Action taken   │
               └──────────────────┘
                        │
                  Drift > critical?
                        │
                 ┌──────┴──────┐
                 │ Yes         │ No → Done
          ┌──────▼──────┐      
          │ Alert       │      
          │ Kill switch?│      
          └─────────────┘      
```

**Reconciliation Outcomes:**
- **Success:** Drift < threshold, log summary
- **Warning:** Drift 5-10%, alert operator
- **Critical:** Drift >10%, activate kill switch + alert

**Audit Findings Addressed:**
- A-011 (HIGH): Balance fetch throws errors (RESOLVED)
- A-014 (MEDIUM): Position includes partial fills
- Gap RE-001: Periodic reconciliation every 5 minutes
- Gap RE-002: Missing/orphaned order detection
- Gap RE-003: Balance drift monitoring

---

## Compliance & Safety

### Hard Rules (Non-Negotiable)

1. **Compliance First**
   - No VPN/proxy/geo-bypass implementation
   - Respect geoblocking and ToS
   - Compliance checks before live trading

2. **Default Paper Trading**
   - System starts in paper trading mode
   - Explicit flags required for live trading

3. **Live Trading Gates**
   - Requires `LIVE_TRADING=true`
   - Requires `COMPLIANCE_ACCEPTED=true`
   - Both must be set, or orders are blocked (fail closed)

4. **Secret Management**
   - Never commit secrets to repository
   - Use `.env` files (gitignored)
   - Provide `.env.example` template
   - Frontend never receives secrets

5. **Reliability**
   - WebSocket reconnect with resync
   - Idempotent order operations
   - Startup reconciliation
   - Circuit breakers for safety
   - Kill switch for emergencies

6. **Testing**
   - PR not done until `npm test` passes
   - Maintain existing test coverage
   - Add tests for new features

---

## Future Architecture Improvements

### Short-Term
- [ ] Add database persistence (PostgreSQL)
- [ ] Implement time-series metrics (TimescaleDB/InfluxDB)
- [ ] Build React monitoring dashboard
- [ ] Add Redis caching layer
- [ ] Implement audit trail logging

### Medium-Term
- [ ] Multi-strategy support with plugin architecture
- [ ] Advanced risk analytics
- [ ] Machine learning signal integration
- [ ] Multi-market portfolio optimization
- [ ] Automated backtesting framework

### Long-Term
- [ ] Distributed system for high availability
- [ ] Cross-exchange arbitrage
- [ ] Cloud-native deployment (Kubernetes)
- [ ] Advanced monitoring with Grafana/Prometheus
- [ ] Mobile app for monitoring and alerts

---

## References

- [System Overview (Non-technical)](./architecture-overview.md)
- [Compliance Guide](./compliance.md)
- [Troubleshooting Guide](./troubleshooting.md)
- [Runbook (Operational Procedures)](./runbook.md)
- [ADR-0001: Architecture Decisions](./adr/0001-initial-architecture.md)
- [Security Audit Report](../REPORTS/AUDIT.md)
- [Gap Analysis](../REPORTS/GAP_ANALYSIS.md)
- [Implementation Checklist](./implementation-checklist.md)
- [Master Development Plan](./master-plan.md)

---

**Document End**
