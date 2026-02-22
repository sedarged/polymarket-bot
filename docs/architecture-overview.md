# System Overview - Polymarket Trading Bot

**Version:** 1.1  
**Last Updated:** 2026-02-22  
**Audience:** Non-technical stakeholders, operators, and new developers

---

## 🎯 What is This System?

The Polymarket Trading Bot is an **autonomous trading system** designed to trade on Polymarket, a prediction market platform. Think of it as a robot trader that can automatically buy and sell positions in prediction markets (like "Will Bitcoin reach $100,000?" or "Who will win the election?") based on predefined strategies, without requiring constant human oversight.

The bot is designed for **small-scale trading** (starting with $20-$200 in capital) and prioritizes **safety and risk management** over aggressive profit-seeking.

---

## 🌍 What is Polymarket?

Polymarket is a **prediction market** where users can bet on the outcomes of real-world events. For example:
- "Will Bitcoin reach $100,000 by December 31, 2024?" (Yes/No)
- "Will it rain in New York tomorrow?" (Yes/No)
- "Who will win the next presidential election?" (Multiple candidates)

Each market has **shares** that you can buy:
- **YES shares**: Pay out $1 if the event happens, $0 otherwise
- **NO shares**: Pay out $1 if the event doesn't happen, $0 otherwise

The prices of these shares fluctuate based on what people think the probability is. If YES shares cost $0.60, the market thinks there's a 60% chance the event will happen.

### How Polymarket Works Technically

Polymarket uses a **hybrid CLOB (Central Limit Order Book)** system:
- **Off-chain matching**: Orders are matched quickly off the blockchain for speed
- **On-chain settlement**: Final trades are settled on the Polygon blockchain
- **No gas fees for most markets**: Trading is free for users in most cases
- **Maker rebates**: In some markets (like 15-minute crypto markets), you can earn small rebates for providing liquidity

### Market Resolution

Markets are resolved using **UMA's Optimistic Oracle**:
- **Normal resolution:** 2-24 hours after market closes
- **Disputed resolution:** 48-96 hours if outcome is challenged
- **Winning shares:** Redeemable for $1.00 USDC after resolution

**See [UMA Resolution Guide](./uma-resolution.md) for complete details on how market outcomes are determined and the dispute process.**

---

## 🤖 What Does This Bot Do?

### Core Functions

1. **Monitors Markets**: Constantly watches prediction markets for trading opportunities
2. **Executes Strategies**: Automatically places buy/sell orders based on programmed strategies
3. **Manages Risk**: Enforces strict limits to prevent losing too much money
4. **Tracks Performance**: Keeps detailed records of all trades and calculates profit/loss

### Trading Strategies

The bot uses several strategies to make money:

#### 1. Market Making
**What it does:** The bot acts like a mini-exchange, offering to buy at a slightly lower price and sell at a slightly higher price.

**How it makes money:** It profits from the difference (called the "spread") between the buy and sell prices.

**Example:**
- Market price for YES shares: $0.50
- Bot offers to buy at $0.49 and sell at $0.51
- If both orders fill, bot makes $0.02 per share (4% profit)

**Benefits:** Consistent small profits, provides liquidity to the market

**Risks:** Can get "stuck" with positions if market moves against it

#### 2. Internal Arbitrage
**What it does:** Exploits mathematical inefficiencies where YES + NO prices don't add up to $1.00.

**How it makes money:** Buys both YES and NO shares when their combined price is less than $1.00, guaranteeing a profit when the market settles.

**Example:**
- YES shares cost $0.48
- NO shares cost $0.48
- Combined cost: $0.96 (less than $1.00!)
- Buy both, guaranteed profit: $1.00 - $0.96 = $0.04 (4% profit)

**Benefits:** Low risk, guaranteed profit if executed correctly

**Risks:** Needs both orders to fill simultaneously (leg risk)

#### 3. Event-Driven Trading (Future)
**What it does:** Reacts to news events or external signals to take quick positions.

**How it makes money:** Captures price movements before the market fully reacts to news.

**Example:**
- News breaks: "Major company announces partnership"
- Bot quickly buys YES shares before price adjusts
- Sells when price rises

**Benefits:** Can capture large moves

**Risks:** Higher risk, requires fast execution, can be wrong about news interpretation

---

## 🏗️ System Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                    POLYMARKET TRADING BOT                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Market     │  │   Order      │  │    Risk      │    │
│  │  Data Feed   │  │  Manager     │  │  Controls    │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
│         │                  │                  │            │
│         ▼                  ▼                  ▼            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              Strategy Engine                        │  │
│  │  (Market Making, Arbitrage, Event-Driven)          │  │
│  └─────────────────────────────────────────────────────┘  │
│         │                                                  │
│         ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │         Learning System (ML Optimization)           │  │
│  │  (Backtest, Bandit Allocation, Auto-Promotion)     │  │
│  └─────────────────────────────────────────────────────┘  │
│         │                                                  │
│         ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │      Sync & Reconciliation (State Consistency)      │  │
│  │  (Discrepancy Detection, Auto-Recovery)            │  │
│  └─────────────────────────────────────────────────────┘  │
│         │                                                  │
│         ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │         Monitoring & Alerting                       │  │
│  │  (Prometheus, Grafana, Telegram Alerts)            │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │                         │
         ▼                         ▼
┌──────────────────┐    ┌──────────────────┐
│  Polymarket API  │    │   Polygon        │
│  (REST + WS)     │    │   Blockchain     │
└──────────────────┘    └──────────────────┘
```

### Component Breakdown

#### 1. Market Data Feed
**Purpose:** Gathers real-time information about markets and prices

**How it works:**
- Connects to Polymarket's servers via two methods:
  - **REST API**: For initial data and snapshots (like checking your bank balance on a website)
  - **WebSocket**: For instant updates (like a live stock ticker)
- Builds a local copy of the "order book" (list of all buy/sell orders)
- Automatically reconnects if connection drops

**Key Features:**
- Real-time price updates
- Automatic reconnection if disconnected
- Validates data to avoid acting on stale or corrupt information

#### 2. Order Manager
**Purpose:** Handles all buying and selling of shares

**How it works:**
- Submits orders to Polymarket's exchange
- Tracks order status (pending, filled, cancelled)
- Handles modifications and cancellations
- Manages order queues and rate limits

**Key Features:**
- Batches multiple orders for efficiency
- Enforces minimum/maximum order sizes
- Respects tick sizes (minimum price increments)
- Throttles order rate to avoid overwhelming the API

#### 3. Risk Controls
**Purpose:** Acts as the "safety net" to prevent catastrophic losses

**How it works:**
- Checks every order before it's placed
- Monitors positions and profit/loss in real-time
- Triggers "circuit breakers" to pause trading when things go wrong
- Enforces hard limits on position sizes and losses

**Key Safety Features:**

**Inventory Caps:** Maximum position size per market (e.g., no more than 100 shares)

**Daily Loss Limits:** Maximum loss per day (e.g., stop trading if down $50 today)

**Circuit Breakers:** Automatic pause triggers:
- Too many API errors (system might be broken)
- WebSocket disconnected (missing critical data)
- Sudden large loss (something unexpected happened)

**Kill Switch:** Emergency stop button that:
- Cancels all open orders immediately
- Halts all trading
- Requires manual intervention to restart

**Compliance Checks:**
- Blocks trading in geo-restricted markets
- Respects Polymarket's certification requirements

#### 4. Strategy Engine
**Purpose:** The "brain" that decides when to buy and sell

**How it works:**
- Runs multiple strategies simultaneously
- Each strategy analyzes market data independently
- Generates buy/sell signals
- All signals pass through risk controls before execution

**Strategy Lifecycle:**
1. **Initialize**: Load configuration and prepare
2. **Observe**: Watch market data and positions
3. **Decide**: Determine if action is needed
4. **Act**: Submit orders (after risk checks)
5. **React**: Respond to fills and market changes

#### 5. Position & PnL Tracking
**Purpose:** Keeps track of what we own and how much money we're making/losing

**How it works:**
- Records every trade
- Calculates average entry price for positions
- Tracks realized PnL (from closed positions)
- Tracks unrealized PnL (from open positions)
- Persists state to disk for crash recovery

**Metrics Tracked:**
- **Positions**: How many shares of each market
- **Realized PnL**: Profit/loss from completed trades
- **Unrealized PnL**: Current profit/loss on open positions
- **Daily PnL**: Today's total profit/loss
- **Win Rate**: Percentage of profitable trades
- **Average Hold Time**: How long positions are held

#### 6. Monitoring & Alerting
**Purpose:** Keeps humans informed about what's happening

**How it works:**
- Collects metrics on system health and performance
- Logs all important events
- Sends alerts when something needs attention

**Alert Levels:**
- **SEV-1 (Critical)**: Immediate action required (kill switch activated, loss limit breached)
- **SEV-2 (High)**: Prompt attention needed (WebSocket unstable, high error rate)
- **SEV-3 (Low)**: Informational (minor retries, performance degradation)

**Alert Destinations:** Telegram, Slack, Discord, email, or SMS (configurable)

**Monitoring Stack:**
- **Prometheus**: Metrics collection and time-series database
- **Grafana**: Real-time dashboards with alerts
- **Structured Logging**: JSON logs for debugging and audit

#### 7. Learning System (Advanced)
**Purpose:** Data-driven strategy optimization using machine learning

**How it works:**
- Records all trading events to a persistent database (EventStore)
- Backtests strategies against historical data
- Uses multi-armed bandit algorithms to allocate capital dynamically
- Automatically promotes successful strategies from testing to production

**Key Components:**
- **Backtest Engine**: Validates strategies with historical data
- **Bandit Allocator**: Adjusts capital allocation based on performance
- **Promotion Workflow**: Gradual rollout from backtest → paper → production
- **Metrics Gating**: Performance gates (Sharpe ratio, drawdown, win rate)

**Benefits:** Adaptive optimization, data-driven decisions, automated strategy selection

#### 8. Sync & Reconciliation
**Purpose:** Ensures bot's local state matches exchange state

**How it works:**
- Periodically compares local state (orders, positions, balances) with exchange
- Detects discrepancies (phantom orders, missing fills, position mismatches)
- Automatically resolves differences using recovery procedures
- Alerts operators when manual intervention is needed

**Sync Triggers:**
- Bot startup (initial reconciliation)
- WebSocket reconnection (after disconnect)
- Scheduled checks (every 5 minutes)
- After suspicious events (fills, errors)

**Benefits:** Prevents state corruption, automatic error recovery, operational reliability

---

## 🔐 Authentication & Security

### Two-Tier Authentication

The bot uses a **two-level security system** to protect your funds:

#### Level 1 (L1): Wallet Signature
- Uses your Ethereum wallet's private key
- **Only used once** to create API credentials
- Like showing your passport to get an ID card
- Private key is never sent over the network

#### Level 2 (L2): API Key Authentication
- Uses API key, secret, and passphrase
- Used for all trading operations
- Like using your ID card for daily activities
- If compromised, you can revoke and create new credentials without exposing your wallet

### Security Best Practices

1. **Never commit secrets**: Private keys and API credentials are stored only in environment variables
2. **Rotate credentials**: Periodically create new API keys
3. **Minimal permissions**: API keys have limited scope (trading only, no withdrawals)
4. **Secure storage**: Use secret managers (AWS Secrets Manager, etc.) in production
5. **Audit logs**: All authentication attempts are logged

---

## 🔄 How a Trade Happens (Step-by-Step)

Let's walk through what happens when the bot makes a trade:

### Example: Market Making Trade

**Setup:**
- Market: "Will Bitcoin reach $100,000?"
- Current mid-price: $0.50
- Bot's spread configuration: 2% (1% on each side)

**Step 1: Market Data Update**
1. WebSocket receives orderbook update
2. Bot calculates mid-price: $0.50
3. Bot calculates inventory position: Currently own 20 YES shares

**Step 2: Strategy Decision**
1. Market making strategy activates
2. Calculates target prices:
   - Bid (buy): $0.49 (1% below mid)
   - Ask (sell): $0.51 (1% above mid)
3. Adjusts for inventory: Since we already own shares, skew quotes to sell more
   - Bid: $0.485 (slightly lower)
   - Ask: $0.505 (slightly lower)
4. Determines order sizes: 10 shares each

**Step 3: Risk Checks**
1. Check inventory cap: 20 shares + 10 new = 30 shares ✓ (under 100 limit)
2. Check daily loss: Currently +$2 ✓ (not near -$50 limit)
3. Check tick size: Prices align to $0.01 increments ✓
4. Check minimum size: 10 shares > 1 minimum ✓
5. Check circuit breakers: All systems normal ✓

**Step 4: Order Submission**
1. Cancel existing orders (if any)
2. Create new orders:
   - Buy 10 YES shares @ $0.485
   - Sell 10 YES shares @ $0.505
3. Sign orders with API credentials
4. Submit to Polymarket API
5. Receive order confirmations with IDs

**Step 5: Order Lifecycle**
1. Orders are "open" and on the order book
2. WebSocket sends user channel updates
3. Another trader sells shares; our buy order fills partially (5 shares)
4. Update position: Now own 25 YES shares
5. Update PnL: Spent $2.425 (5 × $0.485)

**Step 6: Fill Response**
1. Strategy sees fill notification
2. Cancels corresponding sell order
3. Recalculates new quotes
4. Submits updated orders
5. Cycle continues...

**Step 7: Position Close**
1. Eventually, sell order fills
2. Sold 10 shares @ $0.505 = $5.05
3. Compare to average cost: Bought 25 shares at average $0.49 = $12.25 / 25 = $0.49 per share
4. Profit on 10 shares: (0.505 - 0.49) × 10 = $0.15
5. Update realized PnL: +$0.15

---

## 🏃 Operating Modes

The bot has two primary operating modes:

### 1. Paper Trading Mode (Simulation)
**Purpose:** Test strategies without risking real money

**How it works:**
- Uses real market data (actual prices and orderbook)
- Simulates order fills and PnL
- No actual orders placed with Polymarket
- No real money at risk

**When to use:**
- Testing new strategies
- Learning how the bot works
- Validating configuration changes
- Training operators

**Limitations:**
- Fill simulation may not match real execution perfectly
- No impact on actual market
- Can't test authentication issues

### 2. Live Trading Mode
**Purpose:** Trade with real money for actual profit/loss

**How it works:**
- Places real orders with Polymarket
- Uses real money
- Fills result in actual position changes
- PnL is real money gained/lost

**Prerequisites before enabling:**
- ✅ Authentication tested and working
- ✅ Risk controls verified
- ✅ Kill switch tested
- ✅ State reconciliation working
- ✅ Monitoring and alerts configured
- ✅ Runbook completed
- ✅ Paper trading successful for at least 24 hours

**Safety Features:**
- Starts with small position sizes
- Daily loss limits enforced
- Circuit breakers active
- Manual approval required to start

---

## 🛠️ Day-to-Day Operations

### Startup Procedure

1. **Pre-flight checks**
   - Verify system clock is synchronized
   - Confirm network connectivity
   - Check Polymarket API status
   - Validate secrets are loaded

2. **Authentication**
   - Load API credentials from environment
   - Verify credentials with test API call

3. **State Reconciliation**
   - Fetch open orders from Polymarket
   - Fetch current positions from Polymarket
   - Compare with saved local state
   - Resolve any discrepancies (alert on large mismatches)

4. **Market Data Connection**
   - Connect to REST API
   - Fetch market metadata
   - Connect to WebSocket
   - Subscribe to market data channels
   - Verify orderbook updates are flowing

5. **Strategy Activation**
   - Load strategy configurations
   - Initialize strategies for each market
   - Wait for orderbook snapshots to complete
   - Enable trading (or stay in read-only mode)

6. **Monitor & Trade**
   - Strategies run continuously
   - Monitor logs and metrics
   - Respond to alerts as needed

### Graceful Shutdown

1. **Initiate Shutdown**
   - Trigger via CLI command or SIGTERM signal

2. **Stop Strategies**
   - Disable new order placement
   - Cancel all open orders
   - Wait for cancellations to confirm

3. **Save State**
   - Persist positions to disk
   - Save order history
   - Flush logs

4. **Disconnect**
   - Close WebSocket connections
   - Close database connections (if any)

5. **Exit**
   - Log shutdown completion
   - Exit process cleanly

### Emergency Procedures

#### Kill Switch Activation
**When to use:** Something is going very wrong and you need to stop immediately

**How to trigger:**
- CLI command: `npm run kill-switch`
- API endpoint: `POST /kill-switch`
- Manual script/alert integration

**What happens:**
1. All open orders cancelled immediately
2. All strategy loops halted
3. New orders blocked
4. Critical alert sent to operators
5. System enters safe mode
6. Manual reset required to resume

#### WebSocket Disconnection
**What happens automatically:**
1. Bot detects disconnection
2. Pause trading immediately
3. Attempt reconnection with exponential backoff
4. On reconnection, re-sync orderbook from REST
5. Verify data integrity
6. Resume trading if successful
7. Alert if reconnection fails after N attempts

#### Large Unexpected Loss
**What happens automatically:**
1. Circuit breaker detects PnL drop exceeds threshold
2. Cancel all open orders
3. Stop all trading
4. Send critical alert to operators
5. Require manual investigation and approval to resume

#### API Error Spike
**What happens automatically:**
1. Bot detects elevated error rate (e.g., >10 errors/minute)
2. Enter cooldown period (stop placing orders)
3. Retry with exponential backoff
4. If errors persist, alert operator
5. Automatic recovery when error rate normalizes

---

## 📊 Performance Metrics

### Key Performance Indicators (KPIs)

**Profitability:**
- **Realized PnL**: Total profit/loss from closed positions
- **Unrealized PnL**: Current profit/loss on open positions
- **Daily PnL**: Today's total profit/loss
- **Sharpe Ratio**: Risk-adjusted return (higher is better)
- **Win Rate**: Percentage of profitable trades

**Operational:**
- **Uptime**: Percentage of time bot is running and trading
- **Fill Rate**: Percentage of orders that get filled
- **Average Spread Captured**: Profit per market making trade
- **Order Latency**: Time from decision to order submission
- **WebSocket Health**: Connection stability metrics

**Risk:**
- **Maximum Drawdown**: Largest peak-to-trough decline
- **Current Exposure**: Total position value across markets
- **Largest Position**: Biggest single position size
- **Circuit Breaker Triggers**: How often safety limits are hit

---

## ⚠️ Risks & Limitations

### Technical Risks

1. **Market Data Lag**: Decisions based on delayed data can lose money
2. **API Downtime**: Can't trade if Polymarket's API is down
3. **WebSocket Instability**: Frequent disconnections hurt performance
4. **Order Rejection**: Orders may be rejected for various reasons
5. **State Corruption**: Software bugs could corrupt position tracking

**Mitigations:**
- Redundant data sources
- Automatic reconnection logic
- State reconciliation on startup
- Comprehensive testing
- Circuit breakers

### Market Risks

1. **Market Volatility**: Rapid price moves can cause losses
2. **Liquidity Risk**: May not be able to exit positions quickly
3. **Adverse Selection**: Trading against informed participants
4. **Market Microstructure**: Small markets can be manipulated
5. **Event Risk**: Unexpected news causes large price moves

**Mitigations:**
- Position size limits
- Daily loss limits
- Spread widening in volatile markets
- Market selection criteria (avoid low liquidity)
- Conservative strategies

### Operational Risks

1. **Configuration Errors**: Wrong settings can cause losses
2. **Authentication Issues**: Lost API access stops trading
3. **Network Problems**: Internet outages prevent trading
4. **Human Error**: Operator mistakes
5. **Insufficient Monitoring**: Problems go unnoticed

**Mitigations:**
- Configuration validation
- Credential backup and rotation
- Redundant network connections
- Comprehensive documentation and training
- Proactive alerting

### Financial Risks

1. **Capital Loss**: Can lose all invested capital
2. **Opportunity Cost**: Capital tied up in positions
3. **Fee Accumulation**: Trading fees reduce profits
4. **Slippage**: Execution price worse than expected

**Mitigations:**
- Start with small capital
- Strict risk limits
- Fee-aware strategy selection
- Order type optimization (post-only)

---

## 🎓 Learning Curve

### For Non-Technical Operators

**What you need to know:**
- How to start/stop the bot
- How to read logs and metrics
- How to trigger the kill switch
- When to escalate issues
- Basic troubleshooting

**What you don't need to know:**
- Programming or code
- Blockchain internals
- Complex mathematics
- System architecture details

**Recommended Path:**
1. Read this overview (you're doing it! 🎉)
2. Read the runbook (docs/runbook.md)
3. Practice starting/stopping in paper mode
4. Monitor paper trading for a week
5. Shadow an experienced operator
6. Participate in incident response drills
7. Graduate to supervised live trading

### For Developers

**What you need to know:**
- TypeScript/JavaScript programming
- Async programming patterns
- REST and WebSocket APIs
- Basic trading concepts
- Git and version control

**Recommended Path:**
1. Read all documentation in docs/
2. Set up local development environment
3. Run unit and integration tests
4. Make a small code change and test it
5. Run bot in paper mode locally
6. Review existing code modules
7. Start with small bug fixes or features
8. Work up to larger components

---

## 🔮 Future Roadmap

### Short-Term (Next 3 Months)
- ✅ Complete MVP (paper trading)
- ✅ Implement authentication
- ✅ Build live trading engine
- ✅ Deploy risk controls
- ✅ Learning system with backtesting
- ✅ State reconciliation subsystem
- 🔄 Test in production with small capital

### Medium-Term (3-6 Months)
- ✅ Multi-market support
- ✅ Advanced market making strategies
- ✅ Internal arbitrage optimization
- ✅ Web dashboard for monitoring (Grafana)
- ✅ Alert system (Telegram integration)
- 🔄 Mobile app for alerts
- 🔄 Automated strategy promotion
- 🔄 Multi-armed bandit allocation

### Long-Term (6-12 Months)
- 🔄 Machine learning strategies (in progress)
- Cross-platform arbitrage
- Portfolio optimization
- Automated share redemption
- Community features (strategy sharing)

---

## 🤝 Getting Help

### Documentation
- **This Overview**: High-level system understanding
- **Master Development Plan**: Detailed task list and roadmap
- **Runbook** (docs/runbook.md): Operational procedures
- **Implementation Checklist** (docs/implementation-checklist.md): Detailed technical checklist
- **ADR-0001** (docs/adr/0001-initial-architecture.md): Architecture decisions
- **README.md**: Quick start and usage

### Support Channels
- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and ideas
- **Documentation**: For detailed technical information

### Common Questions

**Q: How much money can I lose?**
A: The bot has hard limits configured in the risk controls. By default, it will stop trading if it loses more than the configured daily loss limit (e.g., $50/day). The absolute maximum loss is your total capital if all safety systems fail, but this is extremely unlikely with properly configured risk controls.

**Q: Can I manually override the bot?**
A: Yes, you can always use the kill switch to stop trading immediately. You can also manually adjust positions via the Polymarket website independently of the bot.

**Q: What happens if my computer loses power?**
A: The bot saves its state periodically. On restart, it will reconcile its saved state with Polymarket's API to ensure consistency. Any open orders will still exist on Polymarket and will be detected during reconciliation.

**Q: Does the bot trade 24/7?**
A: Yes, as long as it's running and markets are available. However, you can configure trading hours or pause specific markets.

**Q: How do I know if it's making money?**
A: Check the PnL metrics in the logs or dashboard. The bot tracks both realized PnL (from closed trades) and unrealized PnL (from open positions).

**Q: Is this legal?**
A: Using trading bots is generally legal, but you must comply with Polymarket's terms of service and local regulations. Consult a lawyer if unsure.

**Q: What if Polymarket changes their API?**
A: The bot would need to be updated to support API changes. Monitor Polymarket's developer announcements and be prepared to update the bot or pause trading if breaking changes occur.

---

## 📝 Glossary

**Arbitrage**: Exploiting price differences to make risk-free profit

**Ask**: The price someone is willing to sell at (sell order)

**Bid**: The price someone is willing to buy at (buy order)

**Circuit Breaker**: Automatic pause mechanism when something goes wrong

**CLOB**: Central Limit Order Book - the system that matches buy and sell orders

**Fill**: When an order successfully trades (executes)

**FOK (Fill or Kill)**: Order type that either fills completely immediately or cancels

**Inventory**: Current positions held by the bot

**Kill Switch**: Emergency stop button for all trading

**L1/L2**: Layer 1 (blockchain wallet) vs Layer 2 (API credentials)

**Latency**: Delay between action and response

**Limit Order**: Order to buy/sell at specific price or better

**Liquidity**: How easily you can buy/sell without moving the price

**Market Order**: Order to buy/sell immediately at best available price

**Mid-Price**: Average of best bid and best ask prices

**Order Book**: List of all buy and sell orders waiting to be matched

**PnL (Profit and Loss)**: How much money you've made or lost

**Position**: Amount of shares you currently own

**Post-Only**: Order type that adds liquidity (doesn't take existing orders)

**Realized PnL**: Profit/loss from closed positions

**Reconciliation**: Comparing local state with API state to ensure consistency

**Slippage**: Difference between expected and actual execution price

**Spread**: Difference between best ask and best bid

**Tick Size**: Minimum price increment (e.g., $0.01)

**Unrealized PnL**: Profit/loss from open positions (not yet closed)

**WebSocket**: Real-time communication protocol (like a phone call vs email)

---

**Document End**

For technical implementation details, see [master-plan.md](./master-plan.md)
