# PR Implementation Quick Reference

Quick reference card for the [Small PR Implementation Plan](./small-pr-plan.md).

## PR Overview

| PR | Priority | Est. Days | Key Changes | Dependencies |
|----|----------|-----------|-------------|--------------|
| [PR-001](#pr-001) | P0 | 1-2 | Critical Security: Secrets, Kill Switch, CORS | None |
| [PR-002](#pr-002) | P0 | 2-3 | Auth, Rate Limiting, Retry Timeout | PR-001 |
| [PR-003](#pr-003) | P0 | 2-3 | Idempotency, Race Conditions, Dedup | PR-001 |
| [PR-004](#pr-004) | P1 | 1-2 | Type Safety, Validation | PR-003 |
| [PR-005](#pr-005) | P1 | 2-3 | State Reconciliation, Position Tracking | PR-002, PR-003 |
| [PR-006](#pr-006) | P1 | 2 | WebSocket Reliability | PR-005 |
| [PR-007](#pr-007) | P1 | 2 | Paper Trading Improvements | None (parallel) |
| [PR-008](#pr-008) | P1 | 2 | Circuit Breaker, Error Handling | None (parallel) |
| [PR-009](#pr-009) | P1 | 3-4 | Observability & Metrics | PR-006, PR-008 |
| [PR-010](#pr-010) | P2 | 1 | Logging & Privacy | None (parallel) |
| [PR-011](#pr-011) | P1 | 3-4 | Test Coverage Expansion | None (parallel) |
| [PR-012](#pr-012) | P2 | 2-3 | Learning System Foundation | PR-007 |
| [PR-013](#pr-013) | P1 | 2 | Documentation Completion | All PRs |

**Total Estimated Time:**
- Aggressive (full-time): 3-4 weeks
- Conservative (part-time): 6-8 weeks

---

## PR-001: Critical Security Fixes
**Status:** 🔴 BLOCKS LIVE TRADING  
**Files:** `config/index.ts`, `trading/riskManager.ts`, `server/index.ts`

**Must Do:**
- ✅ Encrypt private keys or use vault
- ✅ Persist kill switch to disk
- ✅ Restrict CORS to specific origins

**Evidence:**
- Kill switch survives restart
- CORS blocks unauthorized origins
- Keys never in plaintext

---

## PR-002: Auth & Rate Limiting
**Status:** 🔴 PRODUCTION REQUIREMENT  
**Files:** `server/index.ts`, `utils/retry.ts`, `clients/tradingClient.ts`

**Must Do:**
- ✅ Require ADMIN_TOKEN in production
- ✅ Add rate limiting to all endpoints
- ✅ Add overall timeout to retries
- ✅ Fix balance fetch error handling

**Evidence:**
- Server fails without ADMIN_TOKEN
- Rate limiting works (429 responses)
- Retries timeout appropriately

---

## PR-003: Data Integrity & Idempotency
**Status:** 🔴 PREVENT DUPLICATE ORDERS  
**Files:** `clients/tradingClient.ts`, `clients/marketFeed.ts`, `clients/websocket.ts`

**Must Do:**
- ✅ Use UUID v4 for client order IDs
- ✅ Prevent concurrent resync per token
- ✅ Deduplicate WebSocket messages

**Evidence:**
- No duplicate orders on retry
- Only one resync runs at a time
- Messages not duplicated on reconnect

---

## PR-004: Type Safety & Validation
**Status:** 🟡 REDUCE RUNTIME ERRORS  
**Files:** `clients/tradingClient.ts`, `config/index.ts`

**Must Do:**
- ✅ Remove all @ts-ignore
- ✅ Add Zod validation for API responses
- ✅ Require valid orderId
- ✅ Validate private key format

**Evidence:**
- No @ts-ignore in code
- Invalid inputs rejected at startup
- Type errors caught at compile time

---

## PR-005: State Reconciliation
**Status:** 🟡 PRODUCTION RELIABILITY  
**Files:** `clients/tradingClient.ts`, `index.ts`

**Must Do:**
- ✅ Fetch orders/positions on startup
- ✅ Include partial fills in positions
- ✅ Handle orphaned orders
- ✅ Log reconciliation results

**Evidence:**
- Bot discovers orders after restart
- Position calculation correct
- Reconciliation logs complete

---

## PR-006: WebSocket Reliability
**Status:** 🟡 CONNECTION STABILITY  
**Files:** `clients/orderbookCache.ts`, `clients/websocket.ts`, `server/index.ts`

**Must Do:**
- ✅ Add TTL to cached orderbooks
- ✅ Fix reconnect timer cleanup
- ✅ Await graceful shutdown

**Evidence:**
- Stale data expires
- No memory leaks on reconnect
- Clean shutdown

---

## PR-007: Paper Trading Improvements
**Status:** 🟡 TESTING ACCURACY  
**Files:** `trading/paperTradingEngine.ts`, `cli/index.ts`

**Must Do:**
- ✅ Configurable partial fills
- ✅ Size-scaled slippage
- ✅ Replay harness

**Evidence:**
- Realistic fill simulation
- Slippage matches order size
- Replay works

---

## PR-008: Circuit Breaker Improvements
**Status:** 🟡 RELIABILITY  
**Files:** `trading/riskManager.ts`, `server/index.ts`, `utils/retry.ts`

**Must Do:**
- ✅ Auto-reset circuit breaker
- ✅ Fail fast on critical errors
- ✅ Add jitter to retries

**Evidence:**
- Circuit breaker recovers
- Startup fails on critical error
- Retries have jitter

---

## PR-009: Observability & Metrics
**Status:** 🟡 MONITORING  
**Files:** `utils/metrics.ts` (new), many files for instrumentation

**Must Do:**
- ✅ Prometheus metrics endpoint
- ✅ Instrument critical operations
- ✅ Create Grafana dashboard

**Evidence:**
- Metrics endpoint works
- Dashboard functional
- Metrics documented

---

## PR-010: Logging & Privacy
**Status:** 🟢 NICE TO HAVE  
**Files:** `utils/logger.ts`, `clients/tradingClient.ts`

**Must Do:**
- ✅ Mask wallet addresses
- ✅ Add request IDs
- ✅ Configurable log levels

**Evidence:**
- Addresses masked in logs
- Request IDs present
- Log levels work

---

## PR-011: Test Coverage Expansion
**Status:** 🟡 QUALITY ASSURANCE  
**Files:** `tests/*.test.ts` (many new tests)

**Must Do:**
- ✅ >80% code coverage
- ✅ Test critical paths
- ✅ Chaos tests

**Evidence:**
- Coverage report >80%
- All critical paths tested
- Chaos tests pass

---

## PR-012: Learning System Foundation
**Status:** 🟢 FUTURE FEATURE  
**Files:** `learning/*.ts` (new), `cli/index.ts`

**Must Do:**
- ✅ Log trading decisions/outcomes
- ✅ Define hook points
- ✅ Basic backtesting

**Evidence:**
- Data collection works
- Hooks documented
- Backtest runs

---

## PR-013: Documentation Completion
**Status:** 🟡 PRODUCTION READINESS  
**Files:** `docs/*.md` (all docs), `docs/adr/*.md` (new ADRs)

**Must Do:**
- ✅ Complete runbook
- ✅ Write all ADRs
- ✅ Fix all links
- ✅ Compliance docs

**Evidence:**
- Link checker passes
- Runbook complete
- ADRs written

---

## Critical Path

The fastest path to production:

```
PR-001 (2d) → PR-002 (3d) → PR-003 (3d) → PR-005 (3d) → 
PR-006 (2d) → PR-009 (4d) → PR-013 (2d)
```

**Total Critical Path: ~19 days**

## Parallel Tracks

These can run in parallel:

**Track 1 (Critical):** PR-001 → PR-002 → PR-003 → PR-005 → PR-006  
**Track 2 (Reliability):** PR-008 → PR-009  
**Track 3 (Quality):** PR-004 → PR-007 → PR-010 → PR-011  
**Track 4 (Future):** PR-012  
**Final:** PR-013 (waits for all)

---

## Key Audit Findings Addressed

| Audit ID | Severity | PR | Description |
|----------|----------|-----|-------------|
| A-001 | CRITICAL | PR-001 | Plaintext private keys |
| A-002 | CRITICAL | PR-001 | Kill switch non-persistence |
| A-003 | CRITICAL | PR-001 | Wildcard CORS |
| A-004 | HIGH | PR-002 | Missing admin auth |
| A-005 | HIGH | PR-004 | Unsafe type parsing |
| A-006 | HIGH | PR-003 | Missing idempotency |
| A-007 | HIGH | PR-003 | Race condition in resync |
| A-008 | HIGH | PR-002 | No rate limiting |
| A-009 | HIGH | PR-002 | No retry timeout |
| A-010 | HIGH | PR-003 | No message dedup |
| A-011 | HIGH | PR-002 | Balance fetch errors ignored |
| A-012 | MEDIUM | PR-008 | Error swallowing |
| A-013 | MEDIUM | PR-004 | Undefined order ID |
| A-014 | MEDIUM | PR-005 | Position calculation |
| A-015 | MEDIUM | PR-006 | Cache staleness |
| A-016 | MEDIUM | PR-006 | Timer leak |
| A-017 | MEDIUM | PR-006 | Shutdown race |
| A-018 | MEDIUM | PR-008 | No CB auto-reset |
| A-019 | MEDIUM | PR-007 | Partial fill simulation |
| A-020 | MEDIUM | PR-007 | Slippage calculation |
| A-021 | MEDIUM | PR-004 | Integer overflow (mitigated via UUID in PR-003) |
| A-022 | LOW | PR-010 | Logging exposure |
| A-023 | LOW | PR-008 | No backoff jitter |
| A-024 | LOW | PR-004 | Missing key validation |
| A-025 | LOW | PR-011 | Test coverage gaps |
| A-026 | LOW | PR-004 | Dead code (@ts-ignore) |
| A-027 | LOW | PR-009 | Missing metrics |

---

## Common Evidence Requirements

Every PR must include:

1. ✅ **Test output** - All tests passing
2. ✅ **Build output** - Successful compilation
3. ✅ **Lint output** - No warnings
4. ✅ **Functional validation** - Commands + output
5. ✅ **Security check** - No secrets, no vulns
6. ✅ **Acceptance criteria** - All checked
7. ✅ **Documentation** - Updated inline

See [PR Execution Guide](./pr-execution-guide.md) for full template.

---

## Quick Commands

```bash
# Run all checks
npm test && npm run lint && npm run build

# Start dev server
npm run dev

# Run specific test
npm test -- tests/specific.test.ts

# Check coverage
npm test -- --coverage

# Health check
curl http://localhost:3000/health

# Kill switch status
curl http://localhost:3000/status
```

---

## Resources

- 📖 **Full Plan:** [small-pr-plan.md](./small-pr-plan.md)
- 📝 **Execution Guide:** [pr-execution-guide.md](./pr-execution-guide.md)
- 🔍 **Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md)
- 📊 **Gap Analysis:** [REPORTS/GAP_ANALYSIS.md](../REPORTS/GAP_ANALYSIS.md)
- 📋 **Checklist:** [implementation-checklist.md](./implementation-checklist.md)
- 🤖 **Agent Guidelines:** [AGENTS.md](../AGENTS.md)

---

**Print this page for quick reference while working on PRs!**
