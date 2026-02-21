# Trading Cost Scenarios (GAP-020)

This document explains typical trading cost scenarios for the Polymarket bot, including spread costs, trading fees, slippage, and withdrawal costs. Understanding these costs is essential for setting realistic profit expectations and making informed trading decisions.

**Last Updated:** February 2026 | **Next Review:** February 2027 or after major release

## Table of Contents

- [Trading Costs Overview](#trading-costs-overview)
- [1. Spread Costs](#1-spread-costs)
- [2. Trading Fees](#2-trading-fees)
- [3. Slippage](#3-slippage)
- [4. Withdrawal Costs](#4-withdrawal-costs)
- [Infrastructure Costs](#infrastructure-costs)
- [Total Cost Examples](#total-cost-examples)
- [Related Documentation](#related-documentation)

---

## Trading Costs Overview

When trading on Polymarket, you'll encounter several types of costs that impact your profitability:

1. **Spread Costs**: The difference between buy (ask) and sell (bid) prices
2. **Trading Fees**: Fees charged by Polymarket for certain markets (most are 0%)
3. **Slippage**: Price impact when executing large orders
4. **Withdrawal Costs**: Polygon network gas fees for moving funds on/off the platform

Understanding and minimizing these costs is crucial for profitable trading, especially for high-frequency or market-making strategies.

---

## 1. Spread Costs

### What is Spread?

The **spread** is the difference between the best bid (buy) price and the best ask (sell) price in the order book. When you place market orders or cross the spread with limit orders, you pay this implicit cost.

**Formula:**
```
Spread = Ask Price - Bid Price
Spread (%) = ((Ask - Bid) / Mid Price) × 100
```

### Example Calculation

**Scenario:** You want to trade a market where:
- Best Bid: $0.48
- Best Ask: $0.52
- Mid Price: $0.50

**Spread Calculation:**
```
Spread = $0.52 - $0.48 = $0.04
Spread (%) = ($0.04 / $0.50) × 100 = 8%
```

**Cost Impact:**
If you buy 100 shares at $0.52 and immediately sell at $0.48:
```
Buy Cost: 100 × $0.52 = $52.00
Sell Revenue: 100 × $0.48 = $48.00
Spread Loss: $52.00 - $48.00 = $4.00 (8% of position size)
```

### Typical Spreads on Polymarket

| Market Liquidity | Typical Spread | Example |
|-----------------|----------------|---------|
| **High Liquidity** (>$100k) | 1-3% | Major political events, popular markets |
| **Medium Liquidity** ($10k-$100k) | 3-8% | Standard markets, moderate trading |
| **Low Liquidity** (<$10k) | 8-20%+ | Niche markets, new listings |

### Strategy Implications

- **Market Making**: You *capture* the spread by providing liquidity on both sides
- **Market Taking**: You *pay* the spread when taking liquidity with market orders
- **Position Trading**: Spread cost must be overcome for profitable exits

**Configuration:**
Your strategy's spread parameter controls the distance from mid price for market-making orders. See `config/strategy.json.example`:

```json
{
  "spread": 0.02,  // 2% spread for market-making orders
  "inventorySkew": true
}
```

---

## 2. Trading Fees

### Fee Structure

**Most Polymarket markets have 0% trading fees.** However, some markets (e.g., 15-minute crypto prediction markets) charge fees.

**Fee Rates:**
- **Standard Markets**: 0% (most markets)
- **Fee-Enabled Markets**: 0.1% - 2.0% (10-200 basis points)

The bot automatically fetches the fee rate for each token via `GET /fee-rate?token_id={id}` and includes it in order payloads.

### Fee Rate Checking (GAP-019)

The bot includes **fee rate validation** to protect against excessive trading costs:

**Configuration** (`.env`):
```bash
# Maximum fee rate in basis points (default: 50 bps = 0.5%)
RISK_MAX_FEE_RATE_BPS=50
```

**What happens:**
1. Before placing any order, the bot fetches the fee rate for that market
2. If the fee rate exceeds your configured maximum, the order is **rejected**
3. Logs show: `Order rejected: Fee rate {X} bps exceeds maximum {Y} bps`

### Example Calculation

**Scenario:** Fee-enabled market with 0.2% (20 bps) fee

**Order Details:**
- Side: BUY
- Size: 500 shares
- Price: $0.60
- Fee Rate: 0.2% (20 bps)

**Cost Breakdown:**
```
Order Value: 500 × $0.60 = $300.00
Trading Fee: $300.00 × 0.002 = $0.60
Total Cost: $300.00 + $0.60 = $300.60
```

**Profitability Calculation:**
To break even, you need the price to move enough to cover the fee:
```
Sell Price (break-even) = $0.60 + ($0.60 × 0.002) = $0.6012
Minimum Price Increase = 0.2%
```

### Fee Rate Validator

The `FeeRateValidator` class (see `apps/backend/src/trading/feeRateValidator.ts`) enforces fee limits:

```typescript
import { FeeRateValidator } from './trading/feeRateValidator';

const validator = new FeeRateValidator(50); // 50 bps = 0.5% max

// Check if fee rate is acceptable
const result = validator.checkFeeRate(75); // 75 bps = 0.75%
if (!result.allowed) {
  console.log(result.reason); // "Fee rate 75 bps exceeds maximum 50 bps"
}
```

**Testing:** Run the fee rate testing script:
```bash
cd apps/backend
npx tsx scripts/test-fee-rate-checking.ts
```

---

## 3. Slippage

### What is Slippage?

**Slippage** is the difference between the expected price of an order and the actual execution price. It occurs when:
- Large orders consume multiple price levels in the order book
- Market prices move between order placement and execution
- Insufficient liquidity exists at the desired price

### Slippage Types

1. **Price Impact Slippage**: Caused by order size relative to available liquidity
2. **Latency Slippage**: Market moves between order submission and execution
3. **Partial Fill Slippage**: Order partially filled at worse prices

### Paper Trading Slippage Model

The bot's paper trading engine uses a **realistic slippage model** that scales with order size:

**Configuration** (`.env`):
```bash
PAPER_TRADING_SLIPPAGE=0.01       # Base slippage: 1%
PAPER_TRADING_MAX_SLIPPAGE=0.05   # Max slippage: 5%
```

**Formula:**
```
Slippage = Base + (Max - Base) × min(1, OrderSize / AvailableLiquidity)
```

### Example Calculations

#### Example 1: Small Order (Low Slippage)

**Market State:**
- Best Ask: $0.50
- Available Liquidity at Best Ask: 1,000 shares
- Order Size: 100 shares (10% of liquidity)

**Slippage Calculation:**
```
Slippage = 0.01 + (0.05 - 0.01) × 0.1 = 0.014 (1.4%)
Execution Price = $0.50 × (1 + 0.014) = $0.507
Total Cost = 100 × $0.507 = $50.70
Slippage Cost = $50.70 - $50.00 = $0.70
```

#### Example 2: Large Order (High Slippage)

**Market State:**
- Best Ask: $0.50
- Available Liquidity at Best Ask: 200 shares
- Order Size: 500 shares (250% of liquidity)

**Slippage Calculation:**
```
Slippage = 0.01 + (0.05 - 0.01) × min(1, 2.5) = 0.05 (5% - capped at max)
Execution Price = $0.50 × (1 + 0.05) = $0.525
Total Cost = 500 × $0.525 = $262.50
Slippage Cost = $262.50 - $250.00 = $12.50
```

### Minimizing Slippage

**Strategies:**
1. **Order Size Limits**: Keep orders under 20% of available liquidity
2. **Use Limit Orders**: Specify maximum acceptable price
3. **Split Large Orders**: Break into smaller chunks over time
4. **Monitor Liquidity**: Check order book depth before trading
5. **Market Timing**: Trade during high-liquidity periods

**Liquidity Validation:**
The bot includes pre-trade liquidity validation (ADR-0010):

```typescript
import { LiquidityValidator } from './trading/liquidityValidator';

const validator = new LiquidityValidator({
  minLiquidityMultiplier: 1.5,  // Require 1.5x order size in liquidity
  maxPriceLevels: 10,
  maxOrderbookAgeMs: 5000,
});
```

See [Order Execution Guide](./order-execution-guide.md#liquidity-validation) for details.

---

## 4. Withdrawal Costs

### Polygon Gas Fees

Polymarket operates on the **Polygon network**, which has significantly lower gas fees than Ethereum mainnet but still incurs costs for blockchain transactions.

**Typical Gas Costs (2026):**
- **Deposit (USDC → Polymarket)**: ~$0.01 - $0.05
- **Withdrawal (Polymarket → Wallet)**: ~$0.01 - $0.05
- **Order Settlement (on-chain)**: ~$0.01 - $0.02 per fill

### Example: Monthly Withdrawal Costs

**Scenario:** Active trader making daily withdrawals

**Monthly Activity:**
- Trading days: 20
- Withdrawals per day: 1
- Average withdrawal: $100

**Gas Cost Breakdown:**
```
Withdrawals per month: 20
Gas per withdrawal: $0.02
Total monthly gas: 20 × $0.02 = $0.40
Gas as % of withdrawn: 0.02%
```

**For High-Frequency Trading:**
```
Fills per day: 100
Gas per fill: $0.015
Daily gas cost: 100 × $0.015 = $1.50
Monthly gas cost: $1.50 × 20 = $30.00
```

### Gas Cost Optimization

**Best Practices:**
1. **Batch Withdrawals**: Withdraw less frequently to reduce transaction count
2. **Minimum Withdrawal Amounts**: Set thresholds to make gas costs negligible (e.g., $100+ withdrawals)
3. **Monitor Gas Prices**: Withdraw during low-traffic periods (gas prices fluctuate)
4. **Off-Chain Settlement**: Most Polymarket trades settle off-chain (CLOB), minimizing gas

**Configuration:**
The bot uses Polygon mainnet by default:

```bash
CHAIN_ID=137  # Polygon Mainnet
```

---

## Infrastructure Costs

### Monthly Operating Costs

Rough monthly cost estimates for running the Polymarket bot. Aligned with Research §3.6.

| Scenario | VM | Monitoring | Storage | Gas | Total/month |
|----------|-----|------------|---------|-----|-------------|
| **A: Minimal (paper)** | $5 | $0 | $0 | $0 | **$5** |
| **B: Micro-live (20–50 USDC)** | $15 | $0 | $0 | $2–5 | **$17–20** |
| **C: Active small (50–200 USDC)** | $20 | $5 | $5 | $10–20 | **$40–60** (recommended) |
| **D: Production** | $80 | $30 | $20 | $50–100 | **$230–330** |

**Component Details:**
- **Infrastructure:** Single VM (e.g. AWS t3.small, Hetzner CX21). Production may use 2× instances for HA.
- **Monitoring:** Grafana Cloud free tier for MVP; paid or self-hosted for production.
- **Storage:** SQLite $0; managed Postgres ~$5–20.
- **Gas:** Polygon settlement; ~$0.01–0.02 per fill. Scales with trade count.

**Cost floor (Research):** ~$20–60/month infrastructure + $2–20/month gas for small capital (20–200 USDC).

See Research §3.1–§3.6 and the research report in [REPORTS](../REPORTS/) for full tables and assumptions.

---

## Total Cost Examples

### Example 1: Conservative Market Maker

**Strategy:** Provide liquidity, capture spread, hold positions < 24h

**Parameters:**
- Capital: $200
- Trades per day: 20 round trips (40 orders)
- Average position size: $50
- Spread captured: 2%
- Markets: 0% fee markets only
- Slippage: 1% (small orders)

**Daily Costs:**
```
Spread Cost: $0 (maker, captures spread)
Trading Fees: $0 (0% fee markets)
Slippage: 40 orders × $50 × 0.01 = $20.00 (paper trading simulation)
Gas Fees: 40 fills × $0.015 = $0.60
Total Daily Cost: $20.60

Daily Revenue (2% spread on $1,000 volume): $20.00
Net Daily: -$0.60
```

**Analysis:** In paper trading, slippage costs dominate. In live trading with 0% fees, capturing spread offsets slippage.

### Example 2: Aggressive Market Taker

**Strategy:** Take positions based on signals, hold 2-6 hours

**Parameters:**
- Capital: $500
- Trades per day: 10 round trips (20 orders)
- Average position size: $100
- Spread paid: 3% (market taker)
- Fee-enabled markets: 0.2% fee
- Slippage: 2%

**Daily Costs:**
```
Spread Cost: 20 orders × $100 × 0.03 = $60.00
Trading Fees: $2,000 volume × 0.002 = $4.00
Slippage: 20 orders × $100 × 0.02 = $40.00
Gas Fees: 20 fills × $0.015 = $0.30
Total Daily Cost: $104.30

Required Price Movement to Break Even: 5.2% per trade
```

**Analysis:** High costs require strong signal accuracy and significant price movements.

### Example 3: Long-Term Position Trader

**Strategy:** Research-based positions, hold 1-7 days

**Parameters:**
- Capital: $1,000
- Trades per week: 4 entries + 4 exits
- Average position size: $250
- Spread paid: 2%
- Markets: 0% fees
- Slippage: 1.5%

**Weekly Costs:**
```
Spread Cost: 8 orders × $250 × 0.02 = $40.00
Trading Fees: $0 (0% fee markets)
Slippage: 8 orders × $250 × 0.015 = $30.00
Gas Fees: 8 fills × $0.02 = $0.16
Total Weekly Cost: $70.16

Monthly Cost (4 weeks): $280.64
As % of Capital: 28% per month
```

**Analysis:** Lower frequency reduces costs but spread/slippage still significant. Requires >30% monthly returns to be profitable.

---

## Related Documentation

### Fee and Trading Logic
- **[Fee Rate Checking](./runbook.md#fee-enabled-markets-research-14)** - How the bot handles fee-enabled markets
- **[Risk Management](./paper-trading.md#risk-manager)** - Fee rate validation and limits
- **[Order Execution Guide](./order-execution-guide.md)** - Complete order placement documentation
- **[Paper Trading Guide](./paper-trading.md)** - Slippage simulation and configuration

### Configuration
- **[Environment Variables](./environment.md)** - All trading cost configuration options
- **[ENV Variable Reference](./ENV_VARIABLE_REFERENCE.md)** - Complete list of environment variables
- **[Strategy Configuration](./STRATEGY_CONFIG_ROUTING.md)** - Strategy-specific parameters

### Testing and Validation
- **[Testing Fee Rate Checking](../apps/backend/scripts/test-fee-rate-checking.ts)** - Manual test script
- **[Integration Tests](../apps/backend/tests/integration/feeRateChecking.test.ts)** - Automated tests
- **[Codespaces Verification](./CODESPACES_VERIFICATION_CHECKLIST.md)** - Production readiness checks

### Architecture and Design
- **[Architecture Overview](./architecture-overview.md)** - System design
- **[ADR-0010: Pre-trade Liquidity Validation](./adr/0010-pre-trade-liquidity-validation.md)** - Liquidity checking
- **[Research Comparison](../archive/RESEARCH_VS_REPO_COMPARISON.md)** - Research alignment

### User Guides
- **[Troubleshooting Guide](./troubleshooting.md)** - Common issues and solutions
- **[Runbook](./runbook.md)** - Operational procedures
- **[README](../README.md)** - Getting started guide

---

## Cost Optimization Tips

1. **Choose 0% Fee Markets**: Focus on markets without trading fees
2. **Set Fee Limits**: Configure `RISK_MAX_FEE_RATE_BPS` to auto-reject high-fee markets
3. **Use Limit Orders**: Avoid slippage by being a market maker, not taker
4. **Check Liquidity First**: Enable pre-trade liquidity validation
5. **Batch Operations**: Reduce gas costs by minimizing on-chain transactions
6. **Monitor Costs**: Track fee rate checks in logs (`debug` level)
7. **Test in Paper Mode**: Understand cost impact before live trading

---

**Document Maintenance:**
- This document should be reviewed annually or after major Polymarket fee structure changes
- Last update: February 2026
- Next review: February 2027
- Update triggers: Polymarket fee changes, major bot releases, gas price changes

For questions or suggestions about this documentation, please open an issue on GitHub.
