# Performance Benchmarking Guide

This guide explains how to use the performance benchmarking system to measure and monitor the performance of critical operations in the Polymarket trading bot.

## Overview

Performance benchmarks are automated tests that measure the execution speed of critical operations. They help:

- **Detect regressions**: Catch performance degradations before they reach production
- **Track improvements**: Validate that optimizations actually improve performance
- **Establish baselines**: Understand normal performance characteristics
- **Compare implementations**: Choose the fastest approach when multiple options exist

## Running Benchmarks

### Local Development

Run all benchmarks:
```bash
cd apps/backend
npm run bench
```

Run with verbose output:
```bash
npm run bench:compare
```

Run specific benchmark files:
```bash
npm run bench -- tests/benchmark/orderbook.bench.ts
```

### CI/CD Integration

Benchmarks run automatically on:
- **Pull Requests**: Compares PR performance against the main branch
- **Main branch pushes**: Stores results and tracks historical performance
- **Manual trigger**: Can be triggered via GitHub Actions UI

## Benchmark Organization

Benchmarks are organized by module in `apps/backend/tests/benchmark/`:

### Orderbook Processing (`orderbook.bench.ts`)
Measures orderbook calculation and formatting performance:
- `calculateOrderbookSummary` - Extract best bid/ask and calculate mid/spread
- `formatOrderbookSummary` - Format summary for display
- Full pipeline benchmarks

**Why it matters**: Orderbook processing happens in real-time for trading decisions. Slow processing can miss trading opportunities.

### Order Validation (`orderValidation.bench.ts`)
Measures order parameter validation performance:
- Valid order validation (happy path)
- Invalid order detection (error paths)
- Batch validation (multiple orders)

**Why it matters**: Every order submission goes through validation. Slow validation delays order placement and can cause missed trades.

### Rate Limiting (`rateLimiter.bench.ts`)
Measures rate limiter performance:
- Single IP check
- Batch IP checks
- Stats retrieval

**Why it matters**: Rate limiting protects API endpoints. Slow rate limiting adds latency to every request (Audit Finding A-008).

### Retry Logic (`retry.bench.ts`)
Measures retry mechanism performance:
- Immediate success (no retries)
- Success after failures
- Error classification

**Why it matters**: Retry logic handles transient failures. Fast classification reduces unnecessary delays in recovery.

### Circuit Breaker (`circuitBreaker.bench.ts`)
Measures circuit breaker performance:
- Execute in closed state
- Metrics retrieval
- Batch executions

**Why it matters**: Circuit breakers protect against cascading failures. Fast checks minimize overhead on healthy operations.

## Interpreting Results

Benchmark output shows:

```
name                                    hz      min     max    mean    p75     p99    p995   p999    rme   samples
calculateOrderbookSummary - small    3.0M   0.0003  0.4516  0.0003  0.0003  0.0004  0.0006  0.0019  ±0.26%  1.5M
```

**Metrics explained**:
- **hz** (hertz): Operations per second (higher is better)
- **min/max**: Fastest and slowest execution times in milliseconds
- **mean**: Average execution time
- **p75/p99/p995/p999**: Percentile latencies (p99 = 99% of operations complete within this time)
- **rme**: Relative margin of error (lower is better)
- **samples**: Number of iterations run

### Performance Targets

Based on trading requirements:

| Operation | Target | Critical Threshold |
|-----------|--------|-------------------|
| Orderbook processing | > 1M ops/sec | < 500K ops/sec |
| Order validation | > 1M ops/sec | < 100K ops/sec |
| Rate limiting | > 500K ops/sec | < 100K ops/sec |
| Error classification | > 200K ops/sec | < 50K ops/sec |
| Circuit breaker | > 500K ops/sec | < 100K ops/sec |

**Red flags**:
- ✅ p99 < 0.01ms (10 microseconds): Excellent
- ⚠️ p99 > 0.1ms (100 microseconds): Investigate
- 🚨 p99 > 1ms (1 millisecond): Critical issue

## CI/CD Regression Detection

The benchmark workflow automatically:

1. **Runs on PRs**: Compares PR performance against main branch
2. **Alerts on regressions**: Fails CI if performance degrades > 150%
3. **Posts comments**: Adds benchmark comparison to PR
4. **Tracks history**: Stores results on main branch for trending

### Threshold Configuration

Current settings in `.github/workflows/benchmark.yml`:
- **Alert threshold**: 150% (fails if 50% slower)
- **Failure mode**: PR benchmarks fail CI on regression
- **Main branch**: Records results but doesn't fail

To adjust thresholds, edit `alert-threshold` in the workflow file.

## Writing New Benchmarks

### Basic Structure

```typescript
import { bench, describe } from 'vitest';
import { myFunction } from '../../src/utils/myModule';

describe('My Module Performance', () => {
  // Setup test data (runs once, not benchmarked)
  const testData = { /* ... */ };

  // Simple benchmark
  bench('myFunction - typical case', () => {
    myFunction(testData);
  });

  // Async benchmark
  bench('myAsyncFunction', async () => {
    await myAsyncFunction(testData);
  });

  // Batch operations
  bench('myFunction - 100 iterations', () => {
    for (let i = 0; i < 100; i++) {
      myFunction(testData);
    }
  });
});
```

### Best Practices

1. **Use realistic data**: Benchmark with production-like data sizes and patterns
2. **Test edge cases**: Include empty inputs, large inputs, error paths
3. **Avoid setup in benchmark**: Put setup outside `bench()` calls
4. **Use descriptive names**: Clearly indicate what's being measured
5. **Add context**: Include JSDoc comments explaining why this matters

### Example: Adding a New Benchmark

```typescript
import { bench, describe } from 'vitest';
import { validateBalance } from '../../src/utils/balanceValidator';

/**
 * Balance Validation Benchmarks
 * 
 * Measures performance of balance checks before order placement.
 * Critical for preventing overdraft and ensuring order validity.
 */
describe('Balance Validation Performance', () => {
  const validBalance = {
    asset: 'USDC',
    amount: '1000.50',
    available: '900.25',
  };

  bench('validateBalance - valid', () => {
    validateBalance(validBalance, { required: '100.00' });
  });

  bench('validateBalance - insufficient', () => {
    validateBalance(validBalance, { required: '2000.00' });
  });
});
```

## Troubleshooting

### Benchmarks are slow to run
- **Expected**: Benchmarks run many iterations for statistical significance
- **Typical runtime**: 5-10 minutes for full suite
- **Solution**: Run specific files during development

### Inconsistent results
- **Cause**: CPU throttling, background processes, CI load
- **Solution**: Benchmarks run multiple times and calculate statistics
- **CI**: GitHub Actions provides consistent environment

### "NaN" in comparison results
- **Cause**: Benchmark failed to complete or produced no samples
- **Solution**: Check for async issues, increase timeout, simplify test

### PR benchmark failures
- **Review changes**: Did you introduce expensive operations?
- **Check loop counts**: Ensure batch benchmarks use same iterations
- **Consider trade-offs**: Sometimes correctness requires performance cost

## Integration with Testing

Benchmarks complement the existing test suite:

| Test Type | Purpose | When to Run |
|-----------|---------|-------------|
| Unit Tests | Verify correctness | Every commit |
| Integration Tests | Verify system behavior | Every commit |
| Benchmark Tests | Measure performance | PR, main branch |
| Backtest Tests | Verify strategy logic | Every commit |

Run all test types:
```bash
npm test           # Unit + Integration + Backtest
npm run bench      # Benchmarks
```

## Continuous Monitoring

### GitHub Actions Results

- **PR Comments**: Benchmark results posted automatically
- **Check Status**: Pass/fail based on regression threshold
- **History**: Trend graphs available in Actions tab

### Local Comparison

Save baseline:
```bash
npm run bench -- --reporter=json --outputFile=baseline.json
```

Compare after changes:
```bash
npm run bench -- --reporter=json --outputFile=current.json
# Manually compare baseline.json vs current.json
```

## Related Documentation

- [Testing Guide](./testing.md) - Comprehensive testing strategy
- [CI/CD Guide](./automation.md) - GitHub Actions workflows
- [Performance Optimization](./architecture.md) - System performance considerations
- [Audit Report](../REPORTS/AUDIT.md) - Security and performance findings

## Contributing

When adding new critical operations:

1. **Write unit tests first**: Ensure correctness
2. **Add benchmarks**: Measure performance
3. **Document baselines**: Add expected performance to docs
4. **Update this guide**: Add new benchmark to the list above

## Support

For questions or issues:
- Check [Common Pitfalls](./ai/common-pitfalls.md)
- Review [Decision Trees](./ai/decision-trees.md)
- Open an issue with benchmark results
