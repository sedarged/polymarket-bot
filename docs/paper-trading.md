# Paper Trading Engine and Risk Management

This document describes the paper trading engine, risk management features, circuit breakers, and kill switch implemented in this bot.

## Paper Trading Engine

The paper trading engine provides a deterministic simulator for testing trading strategies without risking real capital.

### Features

- **Deterministic fills**: Orders are filled based on crossing the best bid/ask prices from the orderbook
- **Size-based slippage**: Simulates realistic market impact that scales with order size relative to available liquidity
- **Fee tracking**: Tracks trading fees for realistic PnL calculation
- **Position tracking**: Maintains long/short positions with weighted average cost basis
- **PnL calculation**: Tracks both realized and unrealized PnL

### Configuration

Add these environment variables to your `.env` file:

```env
# Paper Trading Configuration
PAPER_TRADING_SLIPPAGE=0.01      # Base slippage (1%) for small orders
PAPER_TRADING_MAX_SLIPPAGE=0.05  # Maximum slippage (5%) for large orders
PAPER_TRADING_FEE_RATE=0.002     # 0.2% fee per trade
```

#### Slippage Calculation

The paper trading engine uses a **size-based slippage model** to simulate realistic market impact:

- **Small orders** (< 10% of available liquidity): Apply approximately base slippage
- **Medium orders** (50% of available liquidity): Apply slippage halfway between base and max
- **Large orders** (100%+ of available liquidity): Apply maximum slippage

**Formula**: `slippage = baseSlippage + (maxSlippage - baseSlippage) × min(1, orderSize / availableLiquidity)`

**Example**:
- Base slippage: 1% (0.01)
- Max slippage: 5% (0.05)
- Order size: 50 tokens
- Available liquidity at best price: 100 tokens
- Calculated slippage: 0.01 + (0.05 - 0.01) × 0.5 = **3%**

This approach ensures:
- Small orders experience minimal slippage (realistic for liquid markets)
- Large orders relative to liquidity experience higher slippage (realistic market impact)
- Orders larger than available liquidity are capped at maximum slippage

**Note**: This addresses audit finding A-020 by making paper trading simulation more realistic, especially for larger orders.

### Usage

The paper trading engine is automatically initialized when `LIVE_TRADING=false` (the default).

The backend exposes the current trading **client** state (which will reflect paper trading when `LIVE_TRADING=false`, and live trading when `LIVE_TRADING=true` and `COMPLIANCE_ACCEPTED=true`) via these endpoints:

- `GET /status` - Get overall trading status, including whether the bot is in paper or live mode
- `GET /state` - Get current trading client state (orders, fills, positions, balances)
- `GET /orders` - Get all known orders from the trading client
- `GET /fills` - Get all known fills from the trading client

## Risk Manager

The risk manager enforces trading limits and includes circuit breakers to prevent runaway losses.

### Features

1. **Max Exposure Per Market**: Limits position size in any single market
2. **Max Open Orders**: Limits the number of concurrent open orders
3. **Max Drawdown**: Monitors drawdown from initial balance and stops trading if exceeded
4. **Error Rate Circuit Breaker**: Automatically stops trading if error rate exceeds threshold

### Configuration

Add these environment variables to your `.env` file:

```env
# Risk Management Configuration
RISK_MAX_EXPOSURE_PER_MARKET=1000   # Max position size per market
RISK_MAX_OPEN_ORDERS=50              # Max number of open orders
RISK_MAX_DRAWDOWN=0.20               # Max 20% drawdown before stopping
RISK_ERROR_RATE_THRESHOLD=0.10       # Trip circuit breaker at 10% error rate
RISK_ERROR_RATE_WINDOW=100           # Calculate error rate over last 100 operations
```

### Circuit Breaker Logic

The circuit breaker monitors the error rate over a sliding window of operations:
- Tracks both successful and failed operations
- Calculates error rate as: `errors / total_operations` over the last N operations
- Trips when error rate **exceeds** the threshold
- Once tripped, no new orders are allowed until reset

## Kill Switch

The kill switch provides emergency shutdown capabilities to cancel all orders and stop trading immediately.

### Configuration

Set an admin token to protect the kill switch endpoint:

```env
# Admin Authentication
ADMIN_TOKEN=your-secret-token-here
```

### Usage

#### Via API

```bash
curl -X POST http://localhost:3000/kill \
  -H "Authorization: Bearer your-secret-token-here"
```

#### Via CLI

```bash
npm run kill
```

The kill switch will:
1. Cancel all open orders (both paper and live)
2. Activate the risk manager kill flag
3. Prevent any new orders from being placed
4. Return status including risk manager metrics

### Legacy Endpoint

A legacy `/kill-switch` endpoint is available for backward compatibility. **In production, this endpoint is protected with the same `ADMIN_TOKEN` authentication as `/kill` to prevent unauthorized access.**

```bash
# Example authenticated usage
curl -X POST http://localhost:3000/kill-switch \
  -H "Authorization: ******
```

**Security Warning**: Never expose the kill switch endpoint without authentication on any network-accessible interface.

## WebSocket Reconnection

The market feed client automatically handles WebSocket disconnections:

- **Automatic reconnection**: Reconnects with exponential backoff on connection loss
- **State preservation**: Orderbook cache is preserved across reconnections
- **Safe resume**: After reconnection, the system resyncs orderbooks from REST API
- **Graceful degradation**: Continues operating with cached data during brief outages

## Testing

Run the test suite to verify all components:

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- tests/paperTradingEngine.test.ts
npm test -- tests/riskManager.test.ts
npm test -- tests/integration-reconnect.test.ts
```

## Security Considerations

- **Admin Token**: Always set `ADMIN_TOKEN` in production to protect the kill switch
- **CORS**: The API allows all origins (`*`) for development. Restrict this in production
- **Rate Limiting**: Consider adding rate limiting to prevent API abuse
- **Input Validation**: All inputs are validated, but additional sanitization may be needed

## Production Checklist

Before deploying to production:

- [ ] Set `ADMIN_TOKEN` to a strong, random value
- [ ] Review and adjust risk limits for your use case
- [ ] Configure CORS to restrict origins
- [ ] Set up monitoring and alerting for circuit breaker trips
- [ ] Test kill switch functionality
- [ ] Verify WebSocket reconnection behavior
- [ ] Enable appropriate logging levels
