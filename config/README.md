# Configuration Files Guide

This directory contains example configuration files for the Polymarket trading bot. Copy the `.example` files to their respective names and customize them for your needs.

## Quick Start

```bash
# Copy example files
cp config/markets.json.example config/markets.json
cp config/strategy.json.example config/strategy.json

# Set environment variables in .env
MARKETS_CONFIG_PATH=./config/markets.json
STRATEGY_CONFIG_PATH=./config/strategy.json
```

## markets.json - Per-Market Trading Parameters

Configure per-market trading parameters such as position limits and spread requirements.

### File Structure

```json
[
  {
    "tokenId": "0x1234567890abcdef1234567890abcdef12345678",
    "maxPositionSize": 1000,
    "spread": 0.01
  }
]
```

### Fields

#### tokenId (required)
- **Type:** String
- **Description:** The unique identifier for the market on Polymarket
- **Format:** 40-character hexadecimal Ethereum address
- **Example:** `"0x1234567890abcdef1234567890abcdef12345678"`
- **How to get:** Run `npm run markets` to see available markets

#### maxPositionSize (optional)
- **Type:** Number
- **Description:** Maximum position size allowed for this specific market
- **Validation:** Must be positive (> 0)
- **Units:** Position size in USDC
- **Default:** Uses global `RISK_MAX_EXPOSURE_PER_MARKET` from .env
- **Use cases:**
  - Low for high-risk markets: 100-500
  - High for stable markets: 2000-5000
  - Medium for typical markets: 500-1500

#### spread (optional)
- **Type:** Number (decimal)
- **Description:** Minimum spread requirement for this market
- **Validation:** Must be between 0 and 1 (0 = 0%, 1 = 100%)
- **Example:** `0.015` = 1.5% minimum spread
- **Default:** Strategy-specific default
- **Use cases:**
  - Tight spreads for liquid markets: 0.005-0.01 (0.5%-1%)
  - Normal spreads: 0.01-0.02 (1%-2%)
  - Wide spreads for risky markets: 0.02-0.05 (2%-5%)

### Usage Examples

#### Example 1: High-volume, low-volatility market
```json
{
  "tokenId": "0x1234567890abcdef1234567890abcdef12345678",
  "maxPositionSize": 2000,
  "spread": 0.005
}
```
Use higher position limits and tighter spreads for stable markets with good liquidity.

#### Example 2: High-volatility market
```json
{
  "tokenId": "0xabcdef1234567890abcdef1234567890abcdef12",
  "maxPositionSize": 500,
  "spread": 0.02
}
```
Use lower limits and wider spreads for risky or volatile markets.

#### Example 3: Position limit only
```json
{
  "tokenId": "0xfedcba0987654321fedcba0987654321fedcba09",
  "maxPositionSize": 750
}
```
Specify only `maxPositionSize`, let strategy handle spread.

#### Example 4: Spread only
```json
{
  "tokenId": "0x0987654321fedcba0987654321fedcba09876543",
  "spread": 0.015
}
```
Specify only spread, use global position limit.

#### Example 5: Minimal configuration
```json
{
  "tokenId": "0x2468ace0246ace02468ace024680ace2468ace02"
}
```
Include market in monitoring without specific limits. Uses global defaults.

### Configuration Patterns

#### Pattern 1: Risk-Tiered Configuration
Categorize markets by risk level:
- **Low risk:** maxPositionSize: 2000-5000, spread: 0.005-0.01
- **Medium risk:** maxPositionSize: 1000-2000, spread: 0.01-0.02
- **High risk:** maxPositionSize: 100-500, spread: 0.02-0.05

#### Pattern 2: Liquidity-Based Configuration
Adjust based on market depth:
- **High liquidity:** Higher position limits, tighter spreads
- **Low liquidity:** Lower position limits, wider spreads

#### Pattern 3: Strategy-Specific Markets
Some markets may be better suited for specific strategies:
- **Market making:** Higher limits, tighter spreads
- **Mean reversion:** Medium limits, normal spreads
- **Arbitrage:** Lower limits, tight spreads

### Configuration Tips

1. **Start Conservative:**
   Begin with lower position limits and wider spreads, then adjust based on performance and risk tolerance.

2. **Monitor Liquidity:**
   Markets with low liquidity should have lower position limits to avoid market impact and slippage.

3. **Volatility Awareness:**
   High-volatility markets need wider spreads and lower position limits to protect against adverse price movements.

4. **Global Fallback:**
   Markets not listed here will use global settings from .env:
   - `RISK_MAX_EXPOSURE_PER_MARKET` (default position limit)
   - Strategy-specific spread settings

5. **Hot-Reload Testing:**
   Use the validation endpoint to test changes before applying:
   ```bash
   curl -X POST http://localhost:3000/api/config/validate/markets \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     -d @config/markets.json
   ```

6. **Finding Token IDs:**
   Get available markets and their token IDs:
   ```bash
   npm run markets
   ```
   Or via API:
   ```bash
   curl https://gamma-api.polymarket.com/markets
   ```

### Validation

This configuration is automatically validated against the schema when loaded. Invalid entries will be rejected with detailed error messages.

#### Common Validation Errors
- **"Token ID cannot be empty":** tokenId field is missing or empty
- **"Expected positive number":** maxPositionSize must be > 0
- **"Number must be less than or equal to 1":** spread must be ≤ 1
- **"Expected number, received string":** Field has wrong type

#### Testing Validation
To validate without loading:
1. **Via API:** `POST /api/config/validate/markets`
2. **Via code:** `configManager.validateConfig('markets', content)`

### Integration with Risk Manager

The RiskManager automatically applies per-market limits from this config:

1. Order validation checks current position + new order size
2. If market has maxPositionSize configured, uses that limit
3. Otherwise, uses global `RISK_MAX_EXPOSURE_PER_MARKET` limit
4. Orders exceeding limits are rejected with clear error messages

#### Example Flow
- Market A configured with `maxPositionSize: 500`
- Current position: 400 USDC
- New order: 150 USDC
- **Result:** Rejected (400 + 150 = 550 > 500)

### Hot-Reload Support

This file supports hot-reload when file watching is enabled. Changes are automatically validated and applied without restarting the bot.

**To enable hot-reload:**
```typescript
import { ConfigManager } from './config/configManager';

const configManager = ConfigManager.getInstance();
await configManager.startWatching();
```

**Or via API:**
```bash
curl -X POST http://localhost:3000/api/config/watching/start \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## strategy.json - Strategy Parameters

Configure global strategy parameters or per-strategy configurations.

### Global Strategy Configuration
```json
{
  "spread": 0.02,
  "maxPositionSize": 100,
  "inventorySkew": true
}
```

### Per-Strategy Configuration
```json
[
  {
    "strategyId": "arbitrage-main",
    "type": "arbitrage",
    "enabled": true,
    "params": {
      "minProfitBps": 50,
      "maxOrderSize": 100
    }
  }
]
```

See `strategies.json.example` for comprehensive per-strategy examples.

## Related Documentation

- **[Configuration Management](../docs/configuration-management.md)** - Full configuration guide
- **[Environment Setup](../docs/environment.md)** - Environment variables
- **[.env.example](../.env.example)** - Environment variable template
- **[Architecture](../docs/architecture.md)** - System architecture
- **[Runbook](../docs/runbook.md)** - Operational procedures

## API Endpoints

All configuration endpoints require admin authentication (`ADMIN_TOKEN` in `Authorization` header).

### Get Configuration
```bash
GET /api/config
GET /api/config/markets
GET /api/config/strategy
```

### Update Configuration
```bash
PUT /api/config/markets
PUT /api/config/strategy
```

### Validate Configuration
```bash
POST /api/config/validate/markets
POST /api/config/validate/strategy
```

### Reload Configuration
```bash
POST /api/config/reload
```

### File Watching
```bash
GET /api/config/watching
POST /api/config/watching/start
POST /api/config/watching/stop
```

## Troubleshooting

### Configuration Not Loading
- Verify `MARKETS_CONFIG_PATH` is set in .env
- Check file path is correct (absolute or relative to process.cwd())
- Ensure file is valid JSON
- Check logs for validation errors

### Validation Errors
- Use `npm run` commands to validate configuration
- Check field types match schema requirements
- Ensure numeric values are in valid ranges
- Verify token IDs are non-empty strings

### Hot-Reload Not Working
- Verify file watching is started: `configManager.isWatchingActive()`
- Check environment variables are set correctly
- Ensure files exist and are readable
- Check logs for watcher errors

## Security Considerations

1. **File Permissions:** Config files should have restricted permissions (600 or 640)
2. **Admin Authentication:** All API endpoints require `ADMIN_TOKEN`
3. **Validation:** All updates are validated before applying
4. **Path Traversal:** Paths are resolved safely using `path.resolve()`

## Support

For issues or questions:
1. Check [documentation](../docs/README.md)
2. Review [common pitfalls](../docs/ai/common-pitfalls.md)
3. Consult [decision trees](../docs/ai/decision-trees.md)
4. Open an issue on GitHub
