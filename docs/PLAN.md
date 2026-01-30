# PR Rollout Plan

Each PR should be small, reviewable, and independently deployable. Acceptance criteria are mandatory.

## PR-001: Documentation + Project Scaffolding
**Scope**
- Add planning docs and baseline configuration scaffolding.

**Acceptance Criteria**
- Docs in `/docs` created and linked from README (if required).
- Configuration schema draft exists with example config.
- No runtime behavior changes.

## PR-002: Public REST Client + Market Discovery
**Scope**
- Implement REST client for public endpoints.
- Add market discovery utilities and rate limiting.

**Acceptance Criteria**
- Public client can fetch markets and order book snapshots.
- Rate limit/backoff in place.
- Unit tests cover request construction and error handling.

## PR-003: WebSocket Client + Order Book Cache
**Scope**
- WebSocket connectivity, subscription management, and reconnect logic.
- Order book cache with snapshot and incremental updates.

**Acceptance Criteria**
- WS auto-reconnect with exponential backoff.
- Book cache remains consistent after resync.
- Logging covers connection lifecycle.
- Includes a replayable fixture or mocked stream test.

## PR-004: Paper Trading Engine
**Scope**
- Paper trading simulator, PnL tracking, and market-making stub strategy.

**Acceptance Criteria**
- Simulated fills and PnL are deterministic in tests.
- Strategy loop runs without live trading.
- CLI entrypoint supports paper-only mode.

## PR-005: Auth + Live Trading Core
**Scope**
- L1 auth flow to derive API keys.
- L2 HMAC auth for private endpoints.
- OrderManager for create/cancel/batch.

**Acceptance Criteria**
- Private endpoints pass auth with test harness.
- OrderManager supports cancel/replace safely.
- Tick size and min order size validation enforced.
- Secrets are sourced from environment variables only.

## PR-006: Risk Controls + Circuit Breakers
**Scope**
- Inventory caps, drawdown limits, error-rate pauses.
- Kill switch implementation.

**Acceptance Criteria**
- All orders pass through risk validator.
- Circuit breaker triggers are logged and block trading.
- Kill switch cancels open orders and halts strategy.
- Risk limits are configurable per market.

## PR-007: User WebSocket + Position Tracking
**Scope**
- User channel subscription, fills processing, and position tracking.
- Crash recovery and state reconciliation.

**Acceptance Criteria**
- Fills update positions and PnL accurately.
- Startup reconciliation aligns local state with API state.
- Recovery logs include mismatched order IDs and corrections.

## PR-008: Strategies v1 (Market Making + Arbitrage)
**Scope**
- Live market-making strategy with post-only support.
- Internal arbitrage detection (YES+NO < 1) with FOK handling.

**Acceptance Criteria**
- Strategy respects inventory caps and order throttling.
- Arbitrage attempts handle leg risk safely.
- Post-only mode is configurable per market.

## PR-009: Multi-Market + Allocation
**Scope**
- Manage multiple markets with per-market budgets and limits.

**Acceptance Criteria**
- Aggregate exposure within limits.
- Per-market configs respected.
- Allocation changes can be reloaded without restart (optional).

## PR-010: Monitoring + Runbook Completion
**Scope**
- Metrics, alerts, and operational procedures finalized.

**Acceptance Criteria**
- Metrics cover connectivity, PnL, error rates, and order lifecycle.
- Runbook includes incident response and rollback steps.
- Alerts include severity levels and routing targets.
