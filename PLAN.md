# Polymarket Bot — Master Completion Plan

**Date:** 2026-02-10
**Status:** NOT PRODUCTION READY — requires fixes across 5 categories
**Estimated scope:** ~40 work items across 6 phases

---

## Current State Summary

| Check | Result | Details |
|-------|--------|---------|
| **npm install** | FAILS | `eslint@10` conflicts with `@typescript-eslint/eslint-plugin@8` (needs `--legacy-peer-deps`) |
| **npm run build** | FAILS (2 errors) | `ethers` v6 `Wallet` type mismatch with `@polymarket/clob-client` expecting v5 `Wallet` |
| **npm test** | 1115 pass, 0 fail, 2 skip | All tests passing |
| **npm audit** | 16 low | All from `elliptic` via `@ethersproject/*` (transitive dep of `@polymarket/clob-client`) |
| **Existing audit reports** | 27 findings | 3 CRITICAL, 8 HIGH, 10 MEDIUM, 6 LOW (in `REPORTS/AUDIT.md`) |
| **Gap analysis** | 8 categories | 3 FAIL, 2 CONDITIONAL, 2 PASS, 1 N/A (in `REPORTS/GAP_ANALYSIS.md`) |
| **Competitive audit** | 10 gaps | No strategies, no copy-trading, no LLM integration |

### What Works Today
- Market data fetching (Gamma + CLOB APIs)
- Orderbook retrieval and caching
- WebSocket market feed with reconnection
- Paper trading engine (simulated fills, slippage)
- Risk manager (exposure limits, drawdown, kill switch)
- Audit trail logging to SQLite
- HTTP server with admin endpoints
- Dashboard UI (5 tabs, kill switch, responsive)
- Learning system (event store, backtest engine, bandit allocator)
- 1115 passing tests across 58 test files
- Comprehensive documentation (100+ files)

### What Does NOT Work
- **Build fails** — 2 TypeScript errors (ethers v5/v6 `Wallet` type mismatch)
- **npm install** — peer dependency conflict (eslint 10 vs typescript-eslint 8)
- **No trading strategies** — infrastructure exists but zero strategies implemented
- **No live trading validated** — paper trading only, never tested with real money
- **Kill switch not persisted** — lost on server restart (but state can be passed at startup)
- **Plaintext private keys** — no encrypted storage by default (env var support exists)
- **CORS restrictions** — defaults to localhost:3000, blocks wildcard in production, but needs explicit configuration

---

## Phase 0: Make It Build & Pass Tests (BLOCKING)

> Goal: `npm install && npm run build && npm test` all pass cleanly.

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 0.1 | **Fix peer dependency conflict** — Downgrade `eslint` to `^9.0.0` OR upgrade `@typescript-eslint/*` to v9+ to match | `package.json` (root) | 15 min |
| 0.2 | **Fix ethers Wallet type mismatch** — The `@polymarket/clob-client` expects ethers v5 `Wallet`. Cast or create adapter where `new Wallet()` from ethers v6 is passed to CLOB client methods. Two call sites. | `apps/backend/src/clients/tradingClient.ts:184`, `apps/backend/src/clients/userFeed.ts:101` | 30 min |

**Exit criteria:** `npm ci && npm run build && npm test` all exit 0.

---

## Phase 1: Critical Security Fixes (BLOCKS LIVE TRADING)

> Goal: Resolve the 3 CRITICAL and key HIGH findings from `REPORTS/AUDIT.md`.

| # | Audit ID | Task | File(s) | Effort |
|---|----------|------|---------|--------|
| 1.1 | A-001 | **Encrypt private keys at rest** — Enforce encrypted secret backend by default. Add PBKDF2+AES key encryption with passphrase prompt at startup. Fall back to env var only if `SECRET_BACKEND=env` explicitly set. | `apps/backend/src/secrets/index.ts`, `apps/backend/src/config/index.ts` | 1 day |
| 1.2 | A-002 | **Persist kill switch state** — Write kill switch state to SQLite (or a file). On startup, read and honor persisted state. Add `killswitch_state` table. Currently state can be passed but not persisted. | `apps/backend/src/trading/riskManager.ts`, `apps/backend/src/utils/database.ts` | 4 hr |
| 1.3 | A-003 | **Restrict CORS origins** — ✅ PARTIALLY FIXED: Config validation blocks wildcard in production, defaults to localhost:3000. Still marked as "Open" in audit but code has been updated. Verify and document proper production setup. | `apps/backend/src/server/index.ts`, `apps/backend/src/config/index.ts` | 30 min |
| 1.4 | A-004 | **Require admin token** — ✅ PARTIALLY FIXED: Config now requires admin token for production/live trading. Still marked as "Open" in audit but code has been updated. Verify and update audit status. | `apps/backend/src/server/index.ts`, `apps/backend/src/config/index.ts` | 30 min |
| 1.5 | A-005 | **Remove @ts-ignore / unsafe casts** — ✅ PARTIALLY FIXED: @ts-ignore removed from production code (marked as fixed in audit A-026). Still marked as "Open" for A-005 but related to balance fetch validation. Verify proper type guards exist. | `apps/backend/src/clients/tradingClient.ts` | 1 hr |
| 1.6 | A-007 | **Fix orderbook resync race** — Add per-token mutex/flag to prevent concurrent resyncs in `marketFeed.ts`. | `apps/backend/src/clients/marketFeed.ts` | 2 hr |
| 1.7 | A-008 | **Add server rate limiting** — ✅ IMPLEMENTED: Rate limiting middleware exists and is wired into server. Still marked as "Open" in audit. Verify configuration and coverage. | `apps/backend/src/server/index.ts`, `apps/backend/src/utils/rateLimiter.ts` | 30 min |
| 1.8 | A-009 | **Add retry total timeout** — Add `maxTotalDuration` parameter to retry function. Abort retries after this threshold. | `apps/backend/src/utils/retry.ts` | 1 hr |

**Exit criteria:** All 3 CRITICAL and all HIGH findings addressed. No plaintext keys, persistent kill switch, restricted CORS.

---

## Phase 2: Reliability & Data Integrity

> Goal: Close remaining MEDIUM audit findings and gap analysis failures.

| # | ID | Task | File(s) | Effort |
|---|-----|------|---------|--------|
| 2.1 | A-012 | **Fail startup on init errors** — If client initialization fails, throw instead of swallowing. Add startup health gate. | `apps/backend/src/server/index.ts` | 1 hr |
| 2.2 | A-013 | **Require order IDs** — Reject orders without valid `orderId` in trading client. | `apps/backend/src/clients/tradingClient.ts` | 30 min |
| 2.3 | A-014 | **Fix position calculation** — Include OPEN orders with `filledSize > 0` in position exposure. | `apps/backend/src/clients/tradingClient.ts` | 1 hr |
| 2.4 | A-015 | **Add cache TTL** — Add configurable TTL (default 30s) to `orderbookCache.ts`. Invalidate stale entries. | `apps/backend/src/clients/orderbookCache.ts` | 1 hr |
| 2.5 | A-016 | **Fix WebSocket timer leak** — Clear `reconnectTimer` in all close/destroy paths. | `apps/backend/src/clients/websocket.ts` | 30 min |
| 2.6 | A-017 | **Await shutdown completion** — `await marketFeedService.stop()` in graceful shutdown handler. | `apps/backend/src/server/index.ts` | 30 min |
| 2.7 | A-018 | **Circuit breaker auto-reset** — Add time-based half-open state (try one request after cooldown). | `apps/backend/src/utils/circuitBreaker.ts` | 2 hr |
| 2.8 | A-019 | **Configurable partial fills** — Support partial fill amounts in paper trading engine. | `apps/backend/src/trading/paperTradingEngine.ts` | 2 hr |
| 2.9 | A-022 | **Mask wallet addresses in logs** — Truncate addresses to `0x1234...abcd` format. | `apps/backend/src/clients/tradingClient.ts` | 30 min |
| 2.10 | A-023 | **Add retry jitter** — Add random jitter (±25%) to backoff delays. | `apps/backend/src/utils/retry.ts` | 30 min |
| 2.11 | A-024 | **Validate private key format** — Add hex regex check for private key in config. | `apps/backend/src/config/index.ts` | 15 min |

**Exit criteria:** All MEDIUM findings resolved. Cache TTL enforced, proper shutdown, circuit breaker recovery.

---

## Phase 3: First Trading Strategy (BLOCKS USEFULNESS)

> Goal: Implement at least one concrete, working trading strategy so the bot can actually trade.

| # | Task | Details | Effort |
|---|------|---------|--------|
| 3.1 | **Create strategy interface** — Define `IStrategy` with `evaluate(market) → Signal`, `shouldEnter()`, `shouldExit()`, lifecycle hooks. | New file: `apps/backend/src/strategies/types.ts` | 2 hr |
| 3.2 | **Create strategy runner** — Engine that loads strategies, feeds them market data, and routes signals to paper/live trading engine. | New file: `apps/backend/src/strategies/runner.ts` | 1 day |
| 3.3 | **Implement market-making strategy** — Simple spread-based market maker: place bid/ask around mid, manage inventory. Parameterized spread, size, max inventory. | New file: `apps/backend/src/strategies/marketMaker.ts` | 2 days |
| 3.4 | **Implement momentum/mean-reversion strategy** — Track price history, enter on significant moves, exit on reversion. Use signals from learning system. | New file: `apps/backend/src/strategies/momentum.ts` | 2 days |
| 3.5 | **Wire strategies to server** — Add `/api/strategies` endpoints (list, enable, disable, status). Add strategy config to `.env`. | `apps/backend/src/server/index.ts`, config | 4 hr |
| 3.6 | **Paper trading validation** — Run strategies in paper mode for ≥7 days. Track PnL, Sharpe, drawdown. Pass learning system promotion criteria. | Manual + automation | Ongoing |

**Exit criteria:** At least 1 strategy running in paper mode, with positive PnL metrics over 7 days.

---

## Phase 4: Production Hardening

> Goal: Make the bot reliable enough for unattended live trading.

| # | Task | Details | Effort |
|---|------|---------|--------|
| 4.1 | **Health check improvements** — Add deep health checks: DB connectivity, WebSocket state, last successful API call, strategy status. | `apps/backend/src/server/health.ts` | 2 hr |
| 4.2 | **Structured error taxonomy** — Create `PolymarketApiError` class hierarchy. Differentiate auth (401), validation (400), rate-limit (429), server (5xx). | New file: `apps/backend/src/errors/index.ts` | 4 hr |
| 4.3 | **Graceful degradation** — If Gamma API is down, continue with cached data. If CLOB is down, pause trading but keep monitoring. | Multiple files | 4 hr |
| 4.4 | **Reconciliation hardening** — Verify periodic reconciliation actually runs (add metrics). Alert on reconciliation failures or drift > threshold. | `apps/backend/src/trading/`, alerting | 2 hr |
| 4.5 | **Docker production config** — Fix `npm install` in Dockerfile (add `--legacy-peer-deps` or fix deps). Test container runs end-to-end. | `Dockerfile` | 1 hr |
| 4.6 | **CI pipeline fixes** — Ensure CI can build, test, lint. Fix the ESLint peer dep issue. Add build step to CI. | `.github/workflows/ci.yml` | 1 hr |
| 4.7 | **Add integration tests for strategies** — Test strategy lifecycle: init → evaluate → signal → order → fill → PnL update. | New tests | 1 day |
| 4.8 | **Pre-deploy validation script** — Script that checks: build passes, tests pass, config valid, secrets not plaintext, kill switch state, DB accessible. | New script | 4 hr |

**Exit criteria:** Bot can run in Docker, CI is green, pre-deploy checks pass.

---

## Phase 5: Competitive Feature Parity

> Goal: Close the most impactful gaps identified in competitive audit.

| # | Gap ID | Task | Effort |
|---|--------|------|--------|
| 5.1 | GAP-003 | **Copy-trading support** — Monitor a wallet address and mirror trades. Configurable delay, size scaling, and filtering. | 3-4 days |
| 5.2 | GAP-004 | **15-minute crypto markets** — Auto-discover BTC/ETH/SOL/XRP 15-min markets. Specialized strategy for short-duration prediction markets. | 2 days |
| 5.3 | GAP-005 | **LLM sentiment integration** — Module to query LLM APIs for market sentiment analysis. Feed signals into strategy evaluation. | 3-4 days |
| 5.4 | GAP-008 | **Kelly criterion sizing** — Replace fixed position sizing with Kelly criterion optimal sizing based on estimated edge. | 1 day |
| 5.5 | GAP-010 | **5-minute quickstart** — Streamline setup: `npx create-polymarket-bot` or single docker-compose command with interactive setup. | 1 day |
| 5.6 | GAP-007 | **Terminal UI mode** — Rich terminal dashboard using `blessed` or `ink` for headless server environments. | 2-3 days |

**Exit criteria:** Copy-trading and at least one more competitive feature working.

---

## Phase 6: Polish & Documentation

| # | Task | Effort |
|---|------|--------|
| 6.1 | **Update README** — Reflect actual current state (not aspirational). Add quick start that actually works. | 2 hr |
| 6.2 | **Dashboard WebSocket** — Replace 5-second polling with WebSocket push for real-time dashboard updates. | 4 hr |
| 6.3 | **Export functionality** — Add CSV/JSON export for trades, PnL, and audit trail from dashboard. | 2 hr |
| 6.4 | **Learning system API endpoints** — Wire up the pending `/learning/*` endpoints that the frontend already expects. | 4 hr |
| 6.5 | **Remove dead code** — Clean up unused imports, commented-out blocks, and archived code references. | 2 hr |
| 6.6 | **Consolidate documentation** — Many docs are aspirational or duplicated. Mark what's implemented vs planned. | 4 hr |

---

## Priority Execution Order

```
WEEK 1:   Phase 0 (build/test fixes) → Phase 1 (critical security)
WEEK 2:   Phase 2 (reliability) → Phase 4.5-4.6 (Docker/CI)
WEEK 3-4: Phase 3 (trading strategies)
WEEK 5:   Phase 4 (production hardening)
WEEK 6:   Phase 5 (competitive features - pick top 2-3)
WEEK 7:   Phase 6 (polish)
```

### Minimum Viable Trading Bot (MVTB) — Requirements to Complete
To have a *working* bot that can actually trade, you need at minimum:
1. Phase 0 (build passes) — NOT DONE
2. Items 1.1-1.2 from Phase 1 (security basics: encrypted keys, persistent kill switch) — NOT DONE
3. Items 3.1-3.3 from Phase 3 (one strategy) — NOT DONE
4. Item 3.6 — 7 days of paper trading validation — NOT DONE

Note: Items 1.3-1.4 (CORS, admin token) are partially completed in code but need verification.

Everything else is hardening, competitive features, and polish.

---

## Appendix: Files With Known Issues

| File | Issue | Phase |
|------|-------|-------|
| `package.json` (root) | eslint peer dep conflict | 0.1 |
| `apps/backend/src/clients/tradingClient.ts:184` | ethers v5/v6 Wallet mismatch | 0.2 |
| `apps/backend/src/clients/userFeed.ts:101` | ethers v5/v6 Wallet mismatch | 0.2 |

| `apps/backend/src/config/index.ts:104-110` | Plaintext private key support (no encryption enforced) | 1.1 |
| `apps/backend/src/trading/riskManager.ts:33,101-102` | Kill switch not persisted (in-memory only) | 1.2 |
| `apps/backend/src/config/index.ts:182,426-433` | CORS validation exists, blocks wildcard in prod (verify) | 1.3 |
| `apps/backend/src/config/index.ts:445-460` | Admin token required in prod/live (verify) | 1.4 |
| `apps/backend/src/clients/tradingClient.ts:95-96` | Balance fetch validation (was @ts-ignore, now removed) | 1.5 |
| `apps/backend/src/clients/marketFeed.ts:94-98` | Resync race condition | 1.6 |
| `apps/backend/src/utils/retry.ts:33` | No jitter, no total timeout | 1.8, 2.10 |
| `apps/backend/src/clients/orderbookCache.ts:5-6,15` | No cache TTL | 2.4 |
| `apps/backend/src/clients/websocket.ts:153-156` | Timer leak on close | 2.5 |
| `apps/backend/src/server/index.ts:301` | Shutdown doesn't await stop | 2.6 |
| `apps/backend/src/utils/circuitBreaker.ts` | No auto-reset | 2.7 |
| `apps/backend/src/trading/paperTradingEngine.ts:115` | No partial fills | 2.8 |
