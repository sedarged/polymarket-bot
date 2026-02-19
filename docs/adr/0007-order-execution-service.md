# ADR-0007: Order Execution Service Architecture

**Status:** Accepted  
**Date:** 2026-02-19  
**Deciders:** Engineering Team, AI Agent (GitHub Copilot)  
**Issue:** [GAP-006] Order Execution Service

## Context

The Polymarket bot required a unified and robust order execution service to handle different types of orders (market, limit, and conditional) with proper error handling, retry logic, and comprehensive audit logging. Previously, order execution logic was directly embedded in the TradingClient, making it difficult to:

1. Support multiple order types with different execution strategies
2. Implement sophisticated error handling and retry logic
3. Track execution metadata and performance metrics
4. Test execution logic in isolation
5. Extend with new order types or execution strategies

## Decision

We have implemented a dedicated `ExecutionService` that provides a clean abstraction layer over the existing `TradingClient`. The service follows these architectural principles:

### 1. **Thin Abstraction Layer**
- Leverages existing infrastructure (TradingClient, RiskManager, AuditTrail)
- Does not duplicate validation, retry, or circuit breaker logic
- Adds order type abstraction and unified execution interface

### 2. **Order Type Support**

#### Market Orders
- Immediate execution at best available price
- Configurable slippage tolerance
- Implementation: Places limit order at aggressive price (0.99 for BUY, 0.01 for SELL)
- Future enhancement: Query order book for optimal execution price

#### Limit Orders
- Execution at specified price or better
- Support for time-in-force: GTC, IOC, FOK
- Direct mapping to CLOB API limit orders
- Future enhancement: Full IOC/FOK implementation with immediate cancellation logic

#### Conditional Orders
- Triggered when market conditions are met
- Support for ABOVE/BELOW trigger conditions
- Placeholder implementation: Requires market monitoring infrastructure
- Future enhancement: WebSocket price monitoring + automatic order placement

### 3. **Execution Context**
Each execution carries context metadata:
- `executionId`: Unique identifier for tracking
- `strategyName`: Optional strategy identifier
- `deadline`: Maximum execution time
- `retryPolicy`: Custom retry configuration
- `executionStrategy`: Fallback behavior (IMMEDIATE, RETRY, SPLIT, MODIFY_AND_RETRY)
- `metadata`: Additional custom fields for logging

### 4. **Execution Results**
Standardized result structure:
- `status`: SUCCESS, PARTIAL, FAILED, REJECTED, TIMEOUT, CANCELLED
- `order`: Resulting order object (if successful)
- `fills`: Fill information (for partial/complete fills)
- `error`: Error details (if failed)
- `executionTimeMs`: Execution duration
- `retryAttempts`: Number of retries made
- `metadata`: Additional execution information

### 5. **Error Handling**
Custom error types for precise failure handling:
- `OrderRejectedError`: Order rejected by exchange
- `InsufficientLiquidityError`: Not enough liquidity for execution
- `ExecutionTimeoutError`: Execution deadline exceeded

### 6. **Execution Strategies**
Framework for handling failures:
- `IMMEDIATE`: Fail immediately on rejection (default)
- `RETRY`: Retry with same parameters (uses existing retry logic)
- `SPLIT`: Split large order into smaller chunks (future)
- `MODIFY_AND_RETRY`: Adjust parameters and retry (future)

### 7. **Logging & Audit**
Comprehensive execution logging:
- Order flow category for execution logs
- Log at start, completion, and failure
- Include all context and metadata
- Integrate with existing AuditTrail for persistence

### 8. **Testing Strategy**
- **Unit tests**: Mock TradingClient, test logic in isolation (18 tests)
- **Integration tests**: Test with real dependencies (20 tests)
- **Future**: Backtest tests for execution strategies

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Trading Strategy                        │
│                   (MarketMaking, etc.)                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ ExecutionRequest
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    ExecutionService                          │
│  - executeOrder(request)                                     │
│  - cancelOrder(orderId)                                      │
│  - cancelAllOrders(tokenId)                                  │
│                                                              │
│  Order Type Handlers:                                        │
│  - executeMarketOrder()                                      │
│  - executeLimitOrder()                                       │
│  - executeConditionalOrder()                                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ createOrder()
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                     TradingClient                            │
│  - createOrder(params)                                       │
│  - cancelOrder(orderId)                                      │
│  - cancelMarketOrders(tokenId)                               │
│  - Idempotency (UUID clientOrderId)                          │
│  - Partial fill tracking                                     │
│  - State reconciliation                                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│             Existing Infrastructure                          │
│  - OrderValidation (Zod schemas, constraints)                │
│  - Retry Logic (exponential backoff, jitter)                 │
│  - Circuit Breakers (failure thresholds)                     │
│  - AuditTrail (SQLite persistence)                           │
│  - RiskManager (kill switch, limits)                         │
│  - Logger (structured, categorized)                          │
└─────────────────────────────────────────────────────────────┘
```

## Consequences

### Positive

1. **Clean Separation of Concerns**: Order type logic separated from client logic
2. **Extensibility**: Easy to add new order types or execution strategies
3. **Testability**: Execution logic can be tested in isolation
4. **Observability**: Unified logging and metrics for all executions
5. **Maintainability**: Single place to modify execution behavior
6. **Reusability**: Multiple strategies can use the same execution service
7. **Type Safety**: Strong TypeScript types for all order parameters and results
8. **Minimal Changes**: Leverages existing infrastructure without duplication

### Negative

1. **Additional Layer**: Adds one more layer of abstraction
2. **Incomplete Implementation**: Conditional orders not fully implemented
3. **Future Work Required**: SPLIT and MODIFY_AND_RETRY strategies need implementation
4. **IOC/FOK Support**: Time-in-force variants need additional logic

### Risks & Mitigations

**Risk**: Order type abstraction might not map cleanly to future CLOB API changes  
**Mitigation**: Keep ExecutionService as a thin layer; delegate to TradingClient for API interactions

**Risk**: Execution strategies might need access to orderbook data  
**Mitigation**: Allow passing additional context; integrate with OrderbookCache when needed

**Risk**: Conditional orders require persistent state management  
**Mitigation**: Use existing PersistenceService; integrate with WebSocket market feed

## Implementation Notes

### Files Created
- `apps/backend/src/trading/executionService.ts` - Main service implementation
- `apps/backend/tests/unit/executionService.test.ts` - Unit tests (18 tests)
- `apps/backend/tests/integration/executionServiceIntegration.test.ts` - Integration tests (20 tests)

### Test Coverage
- Market orders: BUY and SELL execution
- Limit orders: GTC, IOC, FOK time-in-force
- Conditional orders: Placeholder with error message
- Order cancellation: Single and bulk cancellation
- Execution timeouts: Deadline enforcement
- Error handling: Custom error types and failure scenarios
- Execution metadata: Context, timing, retry tracking

### Future Enhancements

1. **Conditional Order Implementation**
   - WebSocket price monitoring
   - Trigger condition evaluation
   - Automatic order placement
   - Persistent trigger state

2. **Advanced Execution Strategies**
   - SPLIT: Break large orders into smaller chunks
   - MODIFY_AND_RETRY: Adjust price/size on rejection
   - TWAP: Time-weighted average price execution
   - VWAP: Volume-weighted average price execution

3. **Order Book Integration**
   - Query order book for market order pricing
   - Optimal limit order placement
   - Liquidity analysis before execution

4. **IOC/FOK Support**
   - Immediate cancellation for IOC orders
   - Fill-or-kill validation for FOK orders

5. **Execution Metrics**
   - Track execution latency by order type
   - Monitor rejection rates and reasons
   - Calculate fill quality metrics
   - Dashboard for execution performance

6. **Retry Enhancement**
   - Per-order-type retry policies
   - Adaptive retry delays based on error type
   - Circuit breaker integration

## References

- Issue: [GAP-006] Order Execution Service
- Related ADRs:
  - ADR-0006: Partial Fill Tracking
  - ADR-0001: Initial Architecture
- Audit Findings:
  - A-006: Idempotency
  - A-009: Timeout Configuration
- Documentation:
  - docs/ai/common-pitfalls.md - Trading bot best practices
  - REPORTS/AUDIT.md - Security audit findings
  - REPORTS/GAP_ANALYSIS.md - Production readiness gaps

## Approval

This ADR has been implemented and tested with:
- 18 unit tests (100% passing)
- 20 integration tests (100% passing)
- Full compliance with existing security gates (LIVE_TRADING + COMPLIANCE_ACCEPTED)
- Integration with existing audit trail and logging infrastructure
- Type-safe implementation with comprehensive error handling
