# Order Parameter Validation Implementation

## Overview

This document describes the implementation of comprehensive input validation for order parameters, addressing the requirement to prevent malformed orders from propagating through the trading system.

## Implementation Details

### Files Created

1. **`apps/backend/src/utils/orderValidation.ts`** - Core validation logic
   - Zod schemas for order parameters
   - Validation functions with detailed error messages
   - Type definitions for validated parameters

2. **`apps/backend/tests/orderValidation.test.ts`** - Unit tests (47 tests)
   - Schema validation tests
   - Edge case tests
   - Security scenario tests

3. **`apps/backend/tests/orderValidationIntegration.test.ts`** - Integration tests (24 tests)
   - PaperTradingEngine integration
   - End-to-end validation flow
   - Error handling verification

### Files Modified

1. **`apps/backend/src/clients/tradingClient.ts`**
   - Added validation call in `createOrder()` method
   - Validates parameters before submitting to exchange

2. **`apps/backend/src/trading/paperTradingEngine.ts`**
   - Added validation call in `createOrder()` method
   - Ensures paper trading uses validated parameters

## Validation Rules

### Side (Order Direction)
- **Valid values:** `'BUY'` or `'SELL'` (case-sensitive)
- **Rejects:** lowercase, mixed case, invalid values like 'LONG', 'SHORT'

### Price
- **Valid range:** Between 0 and 1 (exclusive)
- **Format:** String or number that converts to valid decimal
- **Rationale:** Polymarket uses probability-based pricing (0 < price < 1)
- **Rejects:** 
  - Zero or negative values
  - Values >= 1
  - Non-numeric values
  - NaN, Infinity

### Size (Order Quantity)
- **Valid range:** Greater than 0
- **Format:** String or number that converts to valid decimal
- **Rejects:**
  - Zero or negative values
  - Non-numeric values
  - NaN, Infinity

### Token ID (Market Identifier)
- **Valid format:** Non-empty string
- **Rejects:**
  - Empty strings
  - Whitespace-only strings

### Client Order ID (Optional)
- **Valid format:** Any string when provided
- **Optional:** Can be omitted, will be auto-generated

## API

### validateOrderParameters()

Safe validation that returns a result object:

```typescript
import { validateOrderParameters } from '../utils/orderValidation';

const result = validateOrderParameters({
  tokenId: '0xabc123',
  side: 'BUY',
  price: '0.55',
  size: '10'
});

if (!result.success) {
  console.error(result.error); // Detailed error message
} else {
  const validated = result.data; // Typed, validated parameters
}
```

### validateOrderParametersOrThrow()

Fail-fast validation that throws on error:

```typescript
import { validateOrderParametersOrThrow } from '../utils/orderValidation';

try {
  const validated = validateOrderParametersOrThrow({
    tokenId: '0xabc123',
    side: 'BUY',
    price: '0.55',
    size: '10'
  });
  // Use validated parameters
} catch (error) {
  // Handle validation error
  console.error(error.message);
}
```

## Integration Points

### TradingClient (Live Trading)

```typescript
async createOrder(
  tokenId: string,
  side: 'BUY' | 'SELL',
  price: string,
  size: string,
  clientOrderId?: string
): Promise<Order> {
  // Validate parameters before exchange submission
  const validated = validateOrderParametersOrThrow({
    tokenId,
    side,
    price,
    size,
    clientOrderId,
  });
  
  // Continue with validated parameters...
}
```

### PaperTradingEngine

```typescript
createOrder(
  tokenId: string,
  side: 'BUY' | 'SELL',
  price: string,
  size: string
): Order {
  // Validate parameters before creating order
  const validated = validateOrderParametersOrThrow({
    tokenId,
    side,
    price,
    size,
  });
  
  // Continue with validated parameters...
}
```

## Test Coverage

### Unit Tests (47 tests)
- ✅ Valid input scenarios
- ✅ Invalid tokenId (empty, whitespace)
- ✅ Invalid side (lowercase, wrong values)
- ✅ Invalid price (zero, negative, >= 1, non-numeric, NaN, Infinity)
- ✅ Invalid size (zero, negative, non-numeric, NaN, Infinity)
- ✅ Multiple validation errors
- ✅ Security scenarios (XSS, SQL injection attempts, large inputs)

### Integration Tests (24 tests)
- ✅ PaperTradingEngine integration
- ✅ Valid order creation
- ✅ Invalid parameter rejection
- ✅ Error message verification
- ✅ Order filling with validated orders
- ✅ Attack scenarios (NaN, Infinity, scientific notation)

## Security Considerations

### Input Sanitization
- Validates all numeric inputs are finite numbers
- Rejects NaN and Infinity
- Handles scientific notation correctly
- Accepts any string for tokenId (database layer responsibility for SQL injection prevention)

### Error Messages
- Provides detailed error messages for debugging
- Does not expose sensitive information
- Includes field name and validation rule that failed

### Type Safety
- Uses Zod for runtime type validation
- Returns typed results for TypeScript safety
- Prevents type coercion errors

## Performance Impact

- **Minimal:** Validation adds <1ms per order
- **No blocking:** Synchronous validation
- **No dependencies:** Uses existing Zod library

## Maintenance

### Adding New Validation Rules

To add a new validation rule:

1. Update the schema in `orderValidation.ts`:
```typescript
export const OrderParametersSchema = z.object({
  tokenId: tokenIdString,
  side: OrderSideSchema,
  price: priceString,
  size: positiveDecimalString,
  newField: z.string(), // Add new field
});
```

2. Add tests in `orderValidation.test.ts`
3. Update integration tests if needed

### Modifying Existing Rules

1. Update schema refinement or custom validation
2. Update tests to match new rules
3. Document breaking changes

## Future Enhancements

Potential improvements for future iterations:

1. **Min/Max Size Validation:** Add configurable minimum and maximum order sizes
2. **Tick Size Validation:** Validate price adheres to market tick size
3. **Token ID Format Validation:** Add regex validation for specific token ID formats
4. **Rate Limiting:** Add validation for order submission rate
5. **Balance Checks:** Validate sufficient balance before order creation

## References

- **Implementation:** `apps/backend/src/utils/orderValidation.ts`
- **Unit Tests:** `apps/backend/tests/orderValidation.test.ts`
- **Integration Tests:** `apps/backend/tests/orderValidationIntegration.test.ts`
- **Zod Documentation:** https://zod.dev
- **Issue:** GitHub Issue #131
- **PR Plan:** docs/small-pr-plan.md - PR-004: Type Safety & Validation
