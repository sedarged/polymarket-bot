# ADR-0001: Architecture and Strategy Alignment

## Status
Accepted

## Context
The “Plan Report Polymarket bot” outlines a phased rollout for a Polymarket trading bot that uses a hybrid CLOB (off-chain matching with on-chain settlement). It emphasizes L1/L2 auth separation, WebSocket-first data ingestion, and strong risk controls. This ADR captures the decisions made for implementation and documents conflicts or deviations from the report.

## Decision Drivers
- Minimize loss risk for small-capital trading.
- Preserve operator control and fast shutdown paths.
- Reduce dependency on unstable market data sources.
- Keep MVP small but extensible for V1.

## Decisions
1. **WebSocket-first market data**
   - Adopt WS for real-time updates with REST bootstrap and resync on reconnect.
2. **Strict tick-size enforcement**
   - All order prices must be validated against current tick size and min order size.
3. **Two-tier authentication**
   - L1 wallet signature is used only for API key derivation; L2 HMAC used for all private requests.
4. **Primary strategy is market making**
   - Start with cautious spreads and inventory limits; add arbitrage and event-driven logic later.
5. **Risk-first design**
   - Hard limits, circuit breakers, and kill switch are mandatory before enabling live trading.
6. **Phased rollout**
   - MVP (paper trading) precedes any live trading.

## Conflicts / Deviations from Report
- **Immediate live trading in Week 2**
  - Deviation: live trading will only begin after risk controls, reconciliation, and monitoring are verified (post PR-006/PR-007). This is stricter than the report’s earliest live-trading window.
- **Event-driven trades in V1**
  - Deviation: event-driven strategy is deprioritized until market-making and arbitrage are stable with robust monitoring.
- **Operational dependencies**
  - Deviation: require a documented kill switch and incident runbook before first live orders, not just “by Week 4.”

## Consequences
- Slower initial launch but reduced risk of uncontrolled losses or mis-signed orders.
- More predictable system behavior and easier incident response.

## Alternatives Considered
- **REST-only polling:** Rejected due to latency and higher rate-limit risk.
- **Enable event-driven strategy in MVP:** Rejected to avoid coupling to external signal sources before core stability.
- **Immediate live trading after auth:** Rejected until reconciliation, risk, and monitoring are verified.

## References
- Plan Report Polymarket bot (root document in repository).
