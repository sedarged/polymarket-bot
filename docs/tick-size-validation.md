# Order Validation - Tick Size and Minimum Order Size

This document describes the tick size and minimum order size validation implemented in Issue #75.

## Overview

The Polymarket exchange enforces strict constraints on order prices and sizes:
- **Tick Size**: The minimum price increment. All order prices must be exact multiples of the tick size.
- **Minimum Order Size**: The minimum quantity that can be traded.

Orders that don't conform to these constraints are rejected by the exchange. To prevent failed order submissions, we validate these constraints **before** sending orders to the exchange.

## Implementation

### Market Metadata API

Market constraints are fetched from the CLOB API's `/tick-size` endpoint:

```typescript
GET /tick-size?token_id={tokenId}

Response:
{
  "tick_size": "0.01",        // One of: "0.1", "0.01", "0.001", "0.0001"
  "min_order_size": "1"       // Minimum order size in token units
}
```

### Validation Functions

New validation functions in `apps/backend/src/utils/orderValidation.ts`:

```typescript
// Check if price aligns with tick size
isPriceValidForTickSize(price: number, tickSize: TickSize): boolean

// Check if size meets minimum
isSizeValidForMinimum(size: string, minOrderSize: string): boolean

// Validate order with market constraints
validateOrderWithConstraints(params, constraints): ValidationResult
validateOrderWithConstraintsOrThrow(params, constraints): OrderParameters
```

### Integration Points

#### TradingClient (Live Trading)

The `TradingClient.createOrder` method:
1. Fetches market constraints from CLOB API (cached)
2. Validates order parameters with constraints
3. Rejects invalid orders before submission

```typescript
// Market constraints are fetched and cached
const constraints = await this.getMarketConstraints(tokenId);

// Full validation including tick size and min size
const validated = validateOrderWithConstraintsOrThrow(
  { tokenId, side, price, size },
  constraints
);
```

#### PaperTradingEngine (Simulation)

The `PaperTradingEngine.createOrder` method accepts optional constraints:

```typescript
// Without constraints - basic validation only (backward compatible)
const order = engine.createOrder(tokenId, side, price, size);

// With constraints - full validation including tick size and min size
const order = engine.createOrder(tokenId, side, price, size, constraints);
```

This preserves backward compatibility while allowing callers to optionally enforce market constraints.

## Tick Size Validation

### Valid Tick Sizes

Polymarket supports four tick sizes:
- `"0.1"` - Prices must be multiples of 0.1 (e.g., 0.1, 0.2, 0.5, 0.9)
- `"0.01"` - Prices must be multiples of 0.01 (e.g., 0.01, 0.55, 0.99)
- `"0.001"` - Prices must be multiples of 0.001 (e.g., 0.123, 0.555)
- `"0.0001"` - Prices must be multiples of 0.0001 (e.g., 0.1234, 0.5555)

### Validation Algorithm

The algorithm checks if a price is a valid multiple of the tick size:

```typescript
function isPriceValidForTickSize(price: number, tickSize: TickSize): boolean {
  const tickSizeNum = Number(tickSize);
  
  // Price must be >= tick size
  if (price < tickSizeNum) {
    return false;
  }
  
  // Price must be a multiple of tick size
  // (price / tickSize) should be close to an integer
  const ratio = price / tickSizeNum;
  const roundedRatio = Math.round(ratio);
  const epsilon = 1e-10; // Tolerance for floating point errors
  
  return Math.abs(ratio - roundedRatio) < epsilon;
}
```

### Examples

With tick size `0.01`:
- ✅ Valid: `0.01`, `0.50`, `0.55`, `0.99`
- ❌ Invalid: `0.005`, `0.123`, `0.555`

With tick size `0.001`:
- ✅ Valid: `0.001`, `0.123`, `0.555`, `0.999`
- ❌ Invalid: `0.0005`, `0.1234`, `0.5555`

## Minimum Order Size Validation

### Validation Algorithm

Simple comparison:

```typescript
function isSizeValidForMinimum(size: string, minOrderSize: string): boolean {
  const sizeNum = Number(size);
  const minSizeNum = Number(minOrderSize);
  
  return sizeNum >= minSizeNum;
}
```

### Examples

With minimum order size `1`:
- ✅ Valid: `1`, `1.5`, `10`, `100`
- ❌ Invalid: `0.5`, `0.9`, `0.999`

With minimum order size `10`:
- ✅ Valid: `10`, `15`, `100`
- ❌ Invalid: `1`, `5`, `9.99`

## Error Messages

When validation fails, descriptive error messages are provided:

### Tick Size Error

```
Invalid order parameters: price must align with tick size 0.01.
Price 0.555 is not a valid multiple of 0.01.
```

### Minimum Size Error

```
Invalid order parameters: size must be at least 1.
Order size 0.5 is below the minimum.
```

## Testing

Comprehensive tests in `apps/backend/tests/unit/orderValidationConstraints.test.ts`:

- **Tick Size Tests** (37 test cases):
  - Valid prices for each tick size (0.1, 0.01, 0.001, 0.0001)
  - Invalid prices not aligned with tick size
  - Prices below tick size
  - Floating point precision edge cases

- **Minimum Size Tests** (9 test cases):
  - Sizes above, equal to, and below minimum
  - Decimal minimums
  - Invalid numeric strings

- **Integration Tests** (12 test cases):
  - Combined validation with various constraints
  - Different tick sizes
  - Real-world scenarios

All tests pass, ensuring validation works correctly across all edge cases.

## Performance

### Caching

Market constraints are cached after the first fetch:
- Cache key: `tokenId`
- Cache location: In-memory `Map` in `TradingClient`
- Cache invalidation: None (constraints rarely change during runtime)

This reduces API calls and improves performance for repeated orders on the same market.

### API Impact

- **Cold start**: 1 extra API call per unique token (fetch market metadata)
- **Warm cache**: 0 extra API calls
- **Validation overhead**: Negligible (<1ms per order)

## Backward Compatibility

The implementation maintains full backward compatibility:

1. **PaperTradingEngine**: Constraints parameter is optional
   ```typescript
   // Old code still works - basic validation only
   engine.createOrder(tokenId, side, price, size);
   
   // New code - full validation
   engine.createOrder(tokenId, side, price, size, constraints);
   ```

2. **Existing Tests**: All pass without modification
3. **Basic Validation**: Still performed when constraints not available

## Security Benefits

This validation addresses **Issue #75** and provides several security benefits:

1. **Prevents Invalid Orders**: Orders are validated before submission, reducing rejected orders
2. **Better Error Messages**: Clear feedback about why an order was rejected
3. **Fail Fast**: Validation happens at API ingress, not after submission
4. **Audit Trail**: Validation errors are logged for debugging

## References

- Issue: [#75 - Enforce tick size and minimum order size for all orders](https://github.com/sedarged/polymarket-bot/issues/75)
- Implementation: `apps/backend/src/utils/orderValidation.ts`
- Tests: `apps/backend/tests/unit/orderValidationConstraints.test.ts`
- Polymarket Docs: [CLOB API - Tick Size](https://docs.polymarket.com/developers/CLOB/clients/methods-public)
