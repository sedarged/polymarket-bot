# Pre-deployment verification checklist

Run this checklist before first deploy or after major changes. Aligned with Research §12.2.

## Environment

- [ ] **GET /ban-status** returns `cert_required: false` for your wallet (or you have completed proof of residence within 14 days).
- [ ] **Polygon RPC** accessible (`eth_blockNumber` works; CHAIN_ID=137).
- [ ] **USDC balance** ≥ MIN_BALANCE_USDC (or MIN_CAPITAL) + gas buffer.
- [ ] **Allowances** set for USDC and tokens for the Exchange contract.

## API access

- [ ] **CLOB API** returns 200: e.g. `GET /markets` or health.
- [ ] **Gamma API** returns data: e.g. `GET /markets?limit=1`.
- [ ] **WebSocket** connects and receives messages (market feed).

## Auth flow

- [ ] **createOrDeriveApiKey()** succeeds (L1 → L2 credentials).
- [ ] **L2 auth** works: e.g. getOpenOrders() returns 200.
- [ ] **Test order** placement and cancellation accepted (small amount).

## Pre-live checklist (Research §10)

- [ ] **Paper trade 7+ days** before going live (required for safe rollout).
- [ ] **Start with micro capital** ($5–20 USDC) for the first 30 days of live trading.

## Strategy validation

- [ ] **Paper trading** run profitably (or acceptably) over 7+ days.
- [ ] **Tick size** handling correct (no order rejections from bad price).
- [ ] **Position limits** enforced properly.

## Monitoring

- [ ] **Metrics endpoint** accessible: `curl http://localhost:9090/metrics` (default dedicated port) or `curl http://localhost:3000/metrics` when using single-port mode (METRICS_PORT=PORT).
- [ ] **Grafana** dashboard shows real-time PnL (if configured).
- [ ] **Alerts** working: send a test Telegram message.

## Failure recovery

- [ ] **WebSocket** reconnects automatically after disconnect.
- [ ] **Crash recovery**: positions and orders restored on restart.
- [ ] **Circuit breaker** trips and cancels orders correctly when triggered.

## Script

Run the automated checks (bot must be running, or set BASE_URL to target deployment):

```bash
# From repo root
./scripts/verify-pre-deploy.sh

# Or against a remote URL
BASE_URL=https://your-bot.example.com ./scripts/verify-pre-deploy.sh
```

See [scripts/README.md](../scripts/README.md) for more automation scripts.
