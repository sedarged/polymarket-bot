# Implementation Checklist

Checklist items are mandatory unless explicitly deferred.

## MVP Phase (Days 1–7)
- [ ] **CHK-001** Define configuration schema (markets list, risk limits, API endpoints, logging).
- [ ] **CHK-002** Implement Polymarket REST client (public endpoints) with rate limiting.
- [ ] **CHK-003** Implement WebSocket client with subscriptions for market data and reconnect logic.
- [ ] **CHK-004** Build order book cache with snapshot + incremental update support.
- [ ] **CHK-005** Implement tick size retrieval and validation for price formatting.
- [ ] **CHK-006** Implement paper trading engine that simulates fills and PnL.
- [ ] **CHK-007** Add basic strategy loop (market-making simulation with inventory tracking).
- [ ] **CHK-008** Add logging + metrics scaffolding.
- [ ] **CHK-009** Create initial runbook and operator docs.
- [ ] **CHK-010** Document secrets management and local dev setup.

## V1 Phase (Days 8–30)
- [ ] **CHK-011** Add L1 auth flow to derive L2 API keys securely.
- [ ] **CHK-012** Add HMAC-signed L2 auth for private endpoints.
- [ ] **CHK-013** Build OrderManager with batching, cancel/replace, and throttling.
- [ ] **CHK-014** Add min order size enforcement and rejection handling.
- [ ] **CHK-015** Implement user WebSocket channel for orders/fills.
- [ ] **CHK-016** Build position tracker and realized/unrealized PnL tracking.
- [ ] **CHK-017** Implement crash recovery and state reconciliation on startup.
- [ ] **CHK-018** Add risk controls: inventory caps, daily loss limit, cooldowns.
- [ ] **CHK-019** Implement circuit breakers (PnL drawdown, error rate, WS instability).
- [ ] **CHK-020** Implement kill switch (manual/admin trigger).
- [ ] **CHK-021** Add compliance checks (geo restrictions + cert-required flag).
- [ ] **CHK-022** Integrate live market-making strategy with post-only options.
- [ ] **CHK-023** Add internal arbitrage detection (YES+NO < 1) with FOK handling.
- [ ] **CHK-024** Implement event-driven strategy hooks with strict risk gating.
- [ ] **CHK-025** Add multi-market orchestration and capital allocation.
- [ ] **CHK-026** Implement monitoring/alerting (error rates, PnL, connectivity).
- [ ] **CHK-027** Document operational procedures (startup, shutdown, incidents).
- [ ] **CHK-028** Add data retention policy for logs, metrics, and order history.

## Hardening & Verification
- [ ] **CHK-029** Run reconnect/resync chaos tests.
- [ ] **CHK-030** Validate API rate limits and backoff handling.
- [ ] **CHK-031** Validate order lifecycle correctness (submit → fill → reconcile).
- [ ] **CHK-032** Validate risk controls via simulated stress scenarios.
- [ ] **CHK-033** Confirm runbook completeness and on-call escalation paths.
