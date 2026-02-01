# Report Digest: Plan Report Polymarket bot

## Purpose
Summarize the “Plan Report Polymarket bot” into actionable highlights for implementation, operations, and risk control.

## Executive Summary (Condensed)
- Build a small-cap, autonomous Polymarket trading bot for $20–$200 using Polymarket’s hybrid CLOB on Polygon.
- Use L1 wallet signatures only for API key creation; use L2 API keys for ongoing trading requests.
- Focus on market-making, internal arbitrage (YES+NO < 1), and cautious event-driven trades.
- Implement strong risk controls (inventory caps, circuit breakers, reconnection logic), and ensure compliance with geo restrictions and cert-required flags.
- Prioritize operational safety: no live trading until state reconciliation, monitoring, and kill switch are verified.

## Architecture Highlights
- **Hybrid CLOB:** Off-chain matching + on-chain settlement; bot signs orders locally.
- **Authentication:** L1 wallet signature → create/derive API keys; L2 HMAC auth for trading.
- **Data feeds:** REST for bootstrap and snapshots; WebSocket for low-latency updates; auto-reconnect + resync.
- **Order constraints:** Tick-size enforcement with dynamic updates; respect min order size.
- **Fees & rebates:** Most markets have 0 fees; 15-minute crypto markets have taker fees and maker rebates.
- **State management:** Persist orders/positions for crash recovery; reconcile on startup.

## Strategy Highlights
- **Market making:** Two-sided quotes, dynamic spreads, inventory caps, and cancel/replace throttling.
- **Internal arbitrage:** Monitor YES+NO < 1, use FOK to reduce leg risk.
- **Event-driven trades:** News-triggered entries with strict risk controls.
- **Capital allocation:** Small-cap focus, trade 1–3 markets with per-market budgets.

## Risk & Compliance
- **Risk controls:** Exposure limits, circuit breakers, stop-loss logic, and order management throttling.
- **Operational resilience:** WebSocket reconnect, order reconciliation, and crash recovery.
- **Compliance:** Enforce Polymarket geoblocks; detect cert-required status; avoid restricted markets.
- **Security:** Store secrets out of source control, rotate API keys, and limit wallet exposure.

## Phased Rollout (from the report)
- **MVP (7 days):** Connectivity, data ingestion, paper trading, and logging.
- **V1 (30 days):** Live trading, order manager, fill tracking, resilience, and multi-market support.

## Operational Runbook Themes
- Start-up validation, risk checks, state sync, and WebSocket subscription.
- Kill switch, incident response, and safe shutdown procedures.
- Monitoring via logs and metrics for error rate, PnL, and connectivity.

## Success Criteria (High Level)
- Connects reliably to REST/WS with automatic recovery and resync.
- Can run paper trading end-to-end with deterministic PnL tracking.
- Live trading gated by risk checks, reconciliation, and operator controls.
