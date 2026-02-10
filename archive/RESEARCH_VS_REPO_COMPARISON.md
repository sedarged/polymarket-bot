# Research vs Repository: Deep Comparison Report

**Source of truth:** POLYMARKET_BOT_RESEARCH_COMPLETE (1).md  
**Repository evaluated:** polymarket-bot (this workspace)  
**Date:** 2026-02-10

---

## Section 0: Repository Structure & Build

### 0.1 Directory structure

**Alignment**
- Monorepo with `apps/` (backend, frontend) and `packages/` (shared) exists; backend holds core trading logic.
- Research §6.1 suggests `src/{config, data, strategy, execution, risk, persistence, monitoring, utils}`. Repo maps as follows:
  - **config** → `apps/backend/src/config/` ✓
  - **data** → `apps/backend/src/clients/` (clob, gamma, dataApi, marketFeed, orderbookCache, websocket, userFeed) ✓
  - **strategy** → `apps/backend/src/trading/` (paperTradingEngine, riskManager) + `learning/` (backtest, bandit, eventStore) ✓
  - **execution** → `apps/backend/src/clients/tradingClient.ts` (order placement, signing) ✓
  - **risk** → `apps/backend/src/trading/riskManager.ts`, `utils/circuitBreaker.ts` ✓
  - **persistence** → `apps/backend/src/trading/auditTrail.ts`, `persistenceService.ts`, `utils/database.ts` ✓
  - **monitoring** → `apps/backend/src/utils/logger.ts`, `metrics.ts`, `alerting.ts` ✓
  - **utils** → `apps/backend/src/utils/` ✓
- `README.md` at root ✓. `.github/workflows/` present ✓. Docker present ✓.

**Gaps**
- No top-level `config/` directory; research §6.1 suggests `config/.env.example`, `config/strategy.json`, `config/markets.json`.
- Tests live under `apps/backend/tests/` with subdirs `unit/`, `integration/`, `backtest/` (Research §6.3 layout implemented).
- No `docker/` subfolder; `Dockerfile` and `docker-compose.yml` are at repo root.

**Deviations**
- Repo adds: `docs/`, `REPORTS/`, `scripts/`, `archive/`, `grafana/`, `.devcontainer/`, `AGENTS.md`, frontend app.
- Research’s single `src/` tree is realized as `apps/backend/src/` with different folder names (e.g. `clients` vs `data`, `trading` vs `strategy/execution`).
- Learning/ML module (`learning/`) is present in repo but not in research’s MVP/V1 structure.

**Evidence**
- Research: §6.1 (repository structure).  
- Repo: `apps/backend/src/` layout, root `package.json` workspaces `["apps/*","packages/*"]`, no `config/` or `strategy.json`/`markets.json`.

**Opinion**
- **Folder mapping:** Repo’s naming is clear and consistent; mapping to research is straightforward. **Tie.**
- **config/ and JSON config:** Research recommends `config/strategy.json` and `config/markets.json` for strategy and market list. Repo uses env vars and code; no `markets.json` for multi-market config (§8 Copilot 13). **Research better** for multi-market and strategy tuning without code changes (§8, §6.1).
- **Tests layout:** Implemented per Research §6.3: `apps/backend/tests/unit/`, `tests/integration/`, `tests/backtest/`; CI runs `test:unit`, `test:integration`, `test:backtest` by directory.

---

### 0.2 Build & tooling

**Alignment**
- TypeScript used throughout; root and backend use strict options (e.g. `strict`, `noUnusedLocals`, `noImplicitReturns`) per research §11.1.
- Root `package.json`: workspaces `["apps/*","packages/*"]`, scripts for build, dev, test, lint; `engines.node": ">=20.0.0"` ✓.
- Backend `package.json`: has `@polymarket/clob-client`, `pino`, `dotenv`; scripts `build`, `dev`, `test`, `test:coverage` ✓.
- Lint: `eslint.config.js` at root; lint script covers backend, packages, scripts ✓.

**Gaps**
- Research §7 Prompt 1 suggests explicit `ethers@5`. Repo uses `ethers` via `tradingClient.ts` and `userFeed.ts` but it is not listed in backend `package.json`; it is likely a transitive dependency of `@polymarket/clob-client`. If so, version is not pinned per research.

**Deviations**
- Test runner: research §6.3 suggests Jest; repo uses **Vitest** (`vitest.config.ts`, `vitest run`, `@vitest/coverage-v8`).
- Backend has no explicit `ethers` in dependencies (only in imports).

**Evidence**
- Research: §6.3 (Jest), §7 Prompt 1 (ethers, pino, dotenv).  
- Repo: `apps/backend/package.json` (no ethers, vitest), `package.json` (workspaces, scripts), `tsconfig.base.json`, `eslint.config.js`.

**Opinion**
- **Vitest vs Jest:** Vitest is a reasonable substitute (compatible API, fast). **Tie.**
- **ethers:** If ethers is transitive only, adding an explicit `ethers` dependency (and pinning version) would match research and avoid surprise upgrades. **Research better** for dependency clarity.

---

### 0.3 Config structure

**Alignment**
- Env: root `.env.example` exists and is comprehensive (API URLs, trading gates, risk, circuit breaker, Telegram, etc.); research §6.1 asks for `.env.example` (research suggests `config/.env.example`; root is acceptable).
- CLOB_API_URL, CHAIN_ID, and related vars are present and validated in `apps/backend/src/config/index.ts` (Zod).

**Gaps**
- **strategy.json:** Not present. Research §6.1 and §7/§8 expect strategy parameters in config; repo uses env (e.g. `PAPER_TRADING_*`, `RISK_*`, `CIRCUIT_BREAKER_*`) and code.
- **markets.json:** Not present. Research §8 Copilot 13 suggests `config/markets.json` with `{ tokenId, maxPositionSize, spread }` for multi-market; repo uses `TOKEN_IDS` (comma-separated) and no per-market spread/size in config.

**Deviations**
- Strategy and market config are env + code rather than JSON files.

**Evidence**
- Research: §6.1 (`config/strategy.json`, `config/markets.json`), §8 Day 26–28 (markets.json).  
- Repo: `.env.example`, `apps/backend/src/config/index.ts`; no `strategy.json` or `markets.json`.

**Opinion**
- **Research better:** strategy.json and markets.json would allow changing strategy and market set without code changes and align with §8 multi-market support.

---

### 0.4 Docker & CI

**Alignment**
- Docker: `Dockerfile` at root (multi-stage: builder + production, Node 20 Alpine, non-root user, healthcheck, tini). Research §6.1 suggests `docker/Dockerfile`; functionality matches.
- `docker-compose.yml` at root: backend + frontend, env passed from host, volumes for data, healthchecks. Research suggests `docker/docker-compose.yml`; purpose aligns.
- CI: `.github/workflows/ci.yml` runs checkout, Node 20, `npm ci`, build, backend tests, coverage (continue-on-error), security audit, TruffleHog. Research §6.1/§9 expects `ci.yml` ✓.

**Gaps**
- **deploy.yml:** Research §6.1 and §9 mention `.github/workflows/deploy.yml`. Repo has no deploy workflow; it has `release-please.yml`, `codecov.yml`, `docker-security-scan.yml`, `pr-automation.yml`, etc., but no deployment workflow.

**Deviations**
- Docker files at root instead of `docker/` subfolder.
- Prometheus/Grafana in docker-compose are commented out; research §7 Day 6 suggests bot + prometheus + grafana in docker-compose.

**Evidence**
- Research: §6.1 (docker/Dockerfile, docker-compose, ci.yml, deploy.yml), §7 Copilot 6 (docker-compose bot + prometheus + grafana).  
- Repo: root `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`; no deploy.yml; Prometheus/Grafana blocks commented.

**Opinion**
- **Deploy workflow:** For production, a deploy.yml (or equivalent) is useful; research is **better** for operational clarity.
- **Prometheus/Grafana in compose:** Repo has Grafana dashboard JSON and docs but doesn’t enable them in compose by default; enabling would match research Day 6. **Research better** for out-of-box observability.

---

### 0.5 Tests layout

**Alignment**
- Many tests in `apps/backend/tests/`: unit-style tests for config, clob, gamma, riskManager, circuitBreaker, paperTradingEngine, orderValidation, websocket, etc.
- Some integration-style tests: `dataApiIntegration.test.ts`, `auditTrailIntegration.test.ts`, `integration-reconnect.test.ts`, `orderValidationIntegration.test.ts`.
- Backtest: `backtestEngine.test.ts` in same tests folder.
- Runner: Vitest; coverage with v8.

**Gaps**
- Tests reorganized into `tests/unit/`, `tests/integration/`, `tests/backtest/` per research §6.3.
- Chaos tests (WS disconnect, API errors, DB failures) are not clearly separated or named; reconnect and failure paths are tested but not under a dedicated “chaos” layout.

**Deviations**
- Single flat directory; test type inferred by name (e.g. `*Integration.test.ts`) rather than folder.

**Evidence**
- Research: §6.3 (unit/, integration/, backtest/; Jest; chaos tests).  
- Repo: `apps/backend/tests/` with `unit/`, `integration/`, `backtest/`; `vitest.config.ts` includes by dir; `test:unit`, `test:integration`, `test:backtest` scripts.

**Opinion**
- **Research better:** Dedicated unit/integration/backtest (and optionally chaos) folders improve CI and developer navigation.

---

## Section 1: Polymarket development mechanics (§1)

**Alignment**
- CLOB: Off-chain matching, on-chain settlement (Polygon 137), EIP-712 signing; repo uses `@polymarket/clob-client` and ethers Wallet (§1.1).
- Order types: SDK supports limit orders; batch create/cancel and clientOrderId for idempotency (§1.2).
- Auth: L1 (createOrDeriveApiKey) and L2 (HMAC) via SDK in `userFeed.ts` and `tradingClient.ts` (§1.3).
- Tick sizes: Research §1.5 says query tick size before every order; repo has `clob.getMarketMetadata(tokenId)` returning `tickSize` and `minOrderSize`, and `orderValidation` + `tradingClient` use them before placement (§1.5).
- Fee model: Research §1.4 notes 0% on most markets and fee-enabled 15-min crypto markets with GET /fee-rate. Repo uses a fixed paper fee rate and config; no call to GET /fee-rate for live trading (§1.4).

**Gaps**
- **GET /fee-rate?token_id=** not used; fee-enabled market handling and maker rebate awareness not implemented.
- **UMA resolution / auto-redemption:** Research §1.6 describes resolution flow and bot implications (monitor resolution, auto-redemption, settlement buffer). Repo does not document or implement UMA resolution handling.

**Deviations**
- None material; behaviour matches where implemented.

**Evidence**
- Research: §1.1–§1.6.  
- Repo: `clients/clob.ts` (getMarketMetadata, tick-size), `clients/tradingClient.ts` (createOrDeriveApiKey, order placement with constraints), `utils/orderValidation.ts` (tick size validation), `trading/paperTradingEngine.ts` (feeRate from config).

**Opinion**
- **fee-rate:** For fee-enabled markets, research is **better**: query fee-rate and factor into costs/rebates.
- **UMA:** For 24/7 and settlement, research is **better**: document and optionally automate resolution/redemption.

---

## Section 2: Data & analytics (§2)

**Alignment**
- Base URLs: CLOB, Gamma, WebSocket match research §2.1 (repo: config.clobApiUrl, config.gammaApiUrl, config.wsMarketUrl).
- Gamma: markets, events (and slug) used; CLOB: book, tick-size, price; Data API: positions/balances/trades via `dataApi.ts` (§2.2).
- WebSocket market: `wss://ws-subscriptions-clob.polymarket.com/ws/market`, subscribe with `assets_ids`, handle book/price_change; reconnection with backoff; REST resync after reconnect (§2.3).
- User WebSocket: `userFeed.ts` with L2 auth, order/trade messages, position updates (§2.3).
- REPORTS/RESEARCH_REVIEW.md documents alignment with official APIs.

**Gaps**
- **Historical:** Research §2.4 mentions timeseries (OHLC) and subgraph for backtesting. Repo has backtest engine and event store but no explicit CLOB timeseries or Goldsky subgraph integration documented in main code paths.
- **RTDS** (`wss://ws-live-data.polymarket.com`) not referenced in repo.

**Deviations**
- Metrics endpoint: research §7 Day 6 suggests “HTTP endpoint on port 9090”; repo serves `/metrics` on the same server port (3000). Prometheus scraping still works; only port differs.

**Evidence**
- Research: §2.1–§2.4.  
- Repo: `clients/gamma.ts`, `clients/clob.ts`, `clients/dataApi.ts`, `clients/marketFeed.ts`, `clients/userFeed.ts`, `config` URLs, `server/index.ts` (GET /metrics on same port).

**Opinion**
- **Port 9090:** Research suggests a dedicated metrics port; repo uses shared port. **Tie** (simpler deployment; research slightly better for separating metrics traffic).
- **Historical/subgraph:** Research is **better** for rigorous backtesting (timeseries + subgraph).

---

## Section 3: Cost analysis (§3)

**Alignment**
- Docs and runbook reference deployment (Docker, VM), monitoring (Grafana, metrics), and logging; no explicit cost tables in repo. README and compliance mention risk and “no warranty.”

**Gaps**
- Research §3 provides explicit cost tables (infrastructure tiers, monitoring, DB, gas, fee/spread models, scenarios A–D). Repo does not document cost scenarios or monthly estimates (e.g. $20–60 for active small bot).

**Deviations**
- None; repo simply doesn’t implement “cost documentation” as a deliverable.

**Evidence**
- Research: §3.1–§3.6.  
- Repo: README (risk disclaimer), docs (runbook, docker), no cost analysis doc.

**Opinion**
- **Research better:** A short cost section in docs would set operator expectations (e.g. $20–60/month) per §3.

---

## Section 4: Strategy taxonomy (§4)

**Alignment**
- Market making: paper trading engine with spread-based quotes; risk limits and circuit breaker (§4.1).
- Risk controls: position/exposure limits, drawdown, error-rate circuit breaker in `riskManager.ts` and `circuitBreaker.ts` (§4.4).
- README states no automated MM or arbitrage yet; learning system and backtest infrastructure exist.

**Gaps**
- No live market-making strategy (only paper); no event-driven or cross-market consistency strategies (§4.2, §4.3).
- Research §4.1 suggests max inventory (e.g. ±50 shares), dynamic spread widening; repo has generic risk limits but no explicit inventory skew or spread-adjustment logic in a live MM module.

**Deviations**
- Repo is intentionally read-only/paper + execution plumbing; strategy taxonomy is not fully implemented.

**Evidence**
- Research: §4.1–§4.4.  
- Repo: `trading/paperTradingEngine.ts`, `trading/riskManager.ts`, `utils/circuitBreaker.ts`, README “No automated trading strategies yet.”

**Opinion**
- **Research better** for a “full” bot: implement live MM with inventory and spread logic per §4.1; repo is aligned for current phase (paper + risk + execution ready).

---

## Section 5: Community practice & pitfalls (§5)

**Alignment**
- Architecture: Data (clients/WS) → strategy (trading/paper, risk) → execution (tradingClient) → persistence (auditTrail, persistenceService) → monitoring (metrics, alerting) matches research §5.3.
- TypeScript and official SDK used (§5.3).
- Many “top 10” pitfalls are addressed: tick size validation before order (§5.2 #2), WS reconnection and resync (§5.2 #3), idempotency/clientOrderId (§5.2), reconciliation on startup and periodically (§5.2 #6), allowance/balance handling (§5.2 #7), no geo-bypass (§5.2 #10), compliance gates (§10).

**Gaps**
- Over-canceling / gas: research §5.2 #4 and §4.1 warn against aggressive cancel thresholds; repo doesn’t document a “wider cancel threshold” policy.
- Multi-part trades / bucket_index: research §5.2 #8; not explicitly documented in repo.
- Resolution delays (§5.2 #9): not documented in runbook.

**Deviations**
- None major.

**Evidence**
- Research: §5.1–§5.3.  
- Repo: module flow in `server/`, `clients/`, `trading/`, `utils/`, REPORTS/RESEARCH_REVIEW.md.

**Opinion**
- **Research better:** Document cancel policy, bucket_index, and resolution delays in runbook/docs.

---

## Section 6: Vibe-coding build plan (§6)

**Alignment**
- §6.1 structure: covered in Section 0.1; logical mapping exists.
- §6.2 module responsibilities: clob-client wrapper (clob.ts + retry/circuit breaker), websocket (websocket.ts, marketFeed), orderbook (orderbookCache, orderbook utils), paper trader (paperTradingEngine), risk (riskManager, circuitBreaker), persistence (database, auditTrail, persistenceService), metrics (metrics.ts), execution (tradingClient, order placement with validation).
- §6.3 tests: many unit and integration tests; backtest tests present; chaos-style scenarios partially covered by reconnect/integration tests.

**Gaps**
- config/strategy.json and config/markets.json (see 0.3).
- tests/unit, integration, backtest, chaos layout (see 0.5).
- docker/ subfolder (see 0.4).
- deploy.yml (see 0.4).

**Deviations**
- Naming (data→clients, strategy→trading); learning/ module extra.

**Evidence**
- Research: §6.1–§6.3.  
- Repo: as in Section 0 and above.

**Opinion**
- Same as 0.1, 0.3, 0.4, 0.5: add config JSONs, structure tests, optional docker/, add deploy workflow.

---

## Section 7: MVP 7-day plan (§7)

**Alignment**
- Day 1: Config (env), CLOB wrapper (clob.ts), orderbook fetch ✓.
- Day 2: WebSocket (marketFeed, websocket.ts), book messages, orderbook cache (mid/spread) ✓.
- Day 3: Paper trading (paperTradingEngine), virtual orders, PnL tracking ✓.
- Day 4: SQLite (database.ts, auditTrail, persistenceService), Pino logging ✓.
- Day 5: Risk limits (riskManager), circuit breaker (circuitBreaker.ts) ✓.
- Day 6: Prometheus metrics (metrics.ts), /metrics endpoint, Telegram (alerting.ts), circuit breaker alerts ✓.
- Day 7: README, .env.example, JSDoc-style comments ✓.
- MVP success criteria: 24h run, WS updates, paper trades, PnL in DB, circuit breaker, dashboard (Grafana JSON exists), Telegram ✓.

**Gaps**
- Metrics on port 9090: repo uses same port as API (3000).
- docker-compose with Prometheus + Grafana uncommented for “out of box” dashboard.

**Deviations**
- Vitest instead of Jest; metrics port 3000 vs 9090.

**Evidence**
- Research: §7 Days 1–7 and MVP success criteria.  
- Repo: corresponding modules and README/STATUS.

**Opinion**
- MVP is largely met; optional: separate metrics port and enable Prometheus/Grafana in compose per research.

---

## Section 8: V1 30-day plan (§8)

**Alignment**
- Live auth and order signing: tradingClient with ethers Wallet, createOrDeriveApiKey, createOrder/postOrder/cancelOrder; tick size validation before post (§8 Day 8–14).
- User WebSocket: userFeed.ts with L2 auth, order/trade handling, position updates (§8 Day 15–18).
- Crash recovery: startup reconciliation (open orders, positions, balances), API as source of truth (§8 Day 19–21).
- Batch orders (up to 15), kill switch, scoped cancel (§8 Day 22–25).
- Multi-market: TOKEN_IDS and per-token orderbook/state; no dedicated markets.json (§8 Day 26–28).
- Hardening: tests, audit trail, rate limiting, alerting (§8 Day 29–30).
- V1 success criteria: real orders, position tracking, crash recovery, multi-token support, real PnL in metrics, stress test path exist; 48h stress test not mandated in repo.

**Gaps**
- **config/markets.json** for multi-market (tokenId, maxPositionSize, spread) per Copilot 13.
- **Live MM strategy** (LiveMarketMaker class) not implemented; only paper MM and execution plumbing.
- Explicit 48-hour stress test not documented as a gate.

**Deviations**
- Multi-market is token list + shared risk limits, not per-market config file.

**Evidence**
- Research: §8 Weeks 1–4, Copilot 8–13, V1 success criteria.  
- Repo: tradingClient, userFeed, startup reconciliation, POST /orders, /kill, /kill-switch, riskManager, TOKEN_IDS.

**Opinion**
- **Research better:** markets.json and a live MM strategy class would complete V1 as described; repo is strong on execution and recovery, weaker on strategy and multi-market config.

---

## Section 9: Reliability & SRE runbook (§9)

**Alignment**
- Startup: config load, DB init, trading client init, reconciliation (orders, positions, balances), WebSocket start, metrics available; runbook describes launch and verification (§9.1).
- Main loop: strategy/ticks, risk checks, order posting; WS book_update and order_filled handling; periodic reconciliation (e.g. 5 min), health/metrics (§9.2).
- Auto-reconnect: exponential backoff, jitter, resubscribe, REST resync; reconnection logic in websocket.ts and marketFeed (§9.3).
- Order state reconciliation: on startup and periodically (e.g. RECONCILIATION_INTERVAL_SECONDS); open orders from API, compare with local state (§9.4).
- Circuit breakers: PnL drawdown, error rate, WS issues; kill switch (POST /kill, /kill-switch) cancels orders and can stop strategy (§9.5).
- Idempotency: clientOrderId (UUID), order stored before post; trade deduplication and fill tracking (§9.6).
- Alerts: Telegram for critical (circuit breaker, etc.); configurable thresholds (§9.7).
- Backup/recovery: runbook and persistence; DB path and data dir; no explicit “daily pg_dump to S3” automation documented (§9.8).

**Gaps**
- **Startup sequence:** Research §9.1 step 3 “Check wallet USDC balance (exit if <MIN_BALANCE)” and step 4 “Check allowances” — runbook and code do balance/allowance in reconciliation but do not document a hard “exit if below MIN_BALANCE” before starting strategy.
- **Ban-status:** Research §9.2 “Every 1 hour … Check ban-status endpoint” and §9.1; repo does not call GET /ban-status on startup or periodically.
- **Manual kill-switch path:** Research §9.5 “POST /admin/kill-switch”; repo uses POST /kill and POST /kill-switch (no /admin prefix).
- **Max 10 reconnect attempts** then critical alert/exit: research §9.3; repo reconnection may be unbounded (maxReconnectDelay caps delay, not attempt count) unless configured elsewhere.
- **Heartbeat to healthchecks.io** (1 min, alert if missed 5 min): not implemented.
- **Backup:** No documented daily backup (e.g. sqlite dump to S3) with retention.

**Deviations**
- Kill-switch URL: /kill and /kill-switch vs /admin/kill-switch; behaviour equivalent.
- Metrics on same server port (3000) vs dedicated 9090.

**Evidence**
- Research: §9.1–§9.8.  
- Repo: `server/index.ts`, `clients/websocket.ts`, `clients/marketFeed.ts`, `clients/tradingClient.ts`, config (RECONCILIATION_INTERVAL_SECONDS), `docs/runbook.md`; no ban-status, no healthchecks.io, no backup automation.

**Opinion**
- **Research better:** Add MIN_BALANCE check and explicit exit, ban-status on startup and hourly, max reconnect attempts with alert/exit, optional heartbeat, and documented (or automated) DB backup.

---

## Section 10: Safety & compliance (§10)

**Alignment**
- Geo: docs/compliance.md and README state US and sanctioned countries prohibited; no VPN/proxy; user responsibility (§10.1).
- Private key: .env in .gitignore, docs/security.md and ADR-0005, multiple secret backends (env, encrypted, vault/aws/azure stubs) (§10.2).
- Capital risk: README disclaimer, compliance.md, audit trail and trade logging (§10.3).
- Rate limiting: RATE_LIMIT_* config, 429 handling and retry (§10.4).
- Testing: unit and integration tests; backtest; chaos-style tests partial (§10.5).
- Monitoring: metrics, Telegram, runbook (§10.6).
- Legal/tax: compliance.md disclaimer and “consult professionals” (§10.7).
- Ethics: compliance and “do not manipulate” style guidance (§10.8).

**Gaps**
- **ban-status:** Research §10.1 “Query GET /ban-status on startup and every 24 hours”; “If cert_required: true, alert admin (14-day deadline)”. Not implemented.
- **Explicit “paper trade 7+ days before live”** and “Start with micro capital ($5–20) for first 30 days” in a single checklist in repo docs.
- **Heartbeat** to external monitor (e.g. healthchecks.io) not implemented.

**Deviations**
- None major; compliance coverage is strong except ban-status and heartbeat.

**Evidence**
- Research: §10.1–§10.8.  
- Repo: docs/compliance.md, docs/security.md, README, config (LIVE_TRADING, COMPLIANCE_ACCEPTED), .env.example.

**Opinion**
- **Research better:** Implement ban-status check and document 7-day paper + micro capital in a pre-launch checklist; add heartbeat for production.

---

## Section 11: Decisions & assumptions (§11)

**Alignment**
- TypeScript (§11.1): repo uses TypeScript.
- Database: SQLite (better-sqlite3) for audit trail and learning DBs; research suggests SQLite for MVP/V1, Postgres for production — repo is in line.
- Strategy: market making as goal; repo has paper MM and execution, no live MM yet.
- Capital 20–200 USDC: mentioned in research; repo doesn’t enforce; risk limits are configurable.
- Deployment: single VM / Docker; repo supports Docker and single process.
- Monitoring: Grafana + Prometheus (metrics + dashboard JSON); research suggests Grafana Cloud free tier.
- Compliance: strict geo and no VPN; repo matches.

**Gaps**
- No explicit “MIN_BALANCE exit” or “recommended capital range” in config/docs.
- Postgres path for “production” not implemented; only SQLite.

**Deviations**
- None material.

**Evidence**
- Research: §11.1–§11.2.  
- Repo: tsconfig, better-sqlite3, README, docker-compose, risk limits in config.

**Opinion**
- **Tie:** Repo aligns with research; adding MIN_BALANCE and a short “production DB (Postgres)” note would align further.

---

## Section 12: Open questions (§12)

**Alignment**
- docs/open-questions.md and REPORTS list open items (rate limits, testnet, persistence choice, geo verification, alerting, compliance, redemption, risk budget, gas, maker rebates).
- Pre-deployment checks in runbook (env, API, auth, strategy validation, monitoring, failure recovery) partially overlap research §12.2.

**Gaps**
- Research §12.1–§12.2: “Verify rate limits (log 429)”, “Verify order batch size (e.g. 15)”, “Verify min order size per market”, “Fee-enabled markets list (query /fee-rate)”, “WS sequence/hash for missed message”, “ban-status returns cert_required: false”, “GET /ban-status on startup”. Repo doesn’t document or implement these verification steps.
- No explicit “run before first deploy” script that mirrors §12.2 checklist.

**Deviations**
- Open questions are tracked in docs; verification items are not automated or fully documented as a single checklist.

**Evidence**
- Research: §12.1, §12.2.  
- Repo: docs/open-questions.md, runbook validation script and health check.

**Opinion**
- **Research better:** Add a pre-deployment verification script and doc that covers §12.2 (ban-status, fee-rate, rate limits, batch size, etc.) and reference it from runbook.

---

## Summary table

| Section | Alignment (done) | Gaps (missing) | Deviations (different) |
|--------|-------------------|----------------|-------------------------|
| 0 Structure & build | Monorepo, backend layout maps to research; TypeScript, lint, Docker, CI | config/ dir, strategy.json, markets.json; tests/unit|integration|backtest; deploy.yml; Prometheus/Grafana in compose | Docker at root not docker/; Vitest not Jest; metrics on PORT not 9090 |
| §1 Development mechanics | CLOB, auth L1/L2, tick size before order, order types | GET /fee-rate; UMA resolution/redemption docs or automation | — |
| §2 Data & analytics | CLOB, Gamma, Data API, WS market + user, resync | Timeseries/subgraph for backtest; RTDS | /metrics on same port (3000) |
| §3 Cost analysis | — | No cost tables or scenarios in repo | — |
| §4 Strategy taxonomy | Paper MM, risk limits, circuit breaker | Live MM, event-driven, cross-market; inventory/spread logic | Strategy not fully built (intentional) |
| §5 Community practice | Data→signal→risk→exec→persist→monitor; TypeScript; many pitfalls addressed | Cancel policy, bucket_index, resolution delay docs | — |
| §6 Build plan | Module mapping and responsibilities; tests present | config JSONs, test layout, docker/, deploy.yml | Naming (clients/trading); learning/ extra |
| §7 MVP 7-day | All days covered: config, WS, paper, DB, risk, metrics, Telegram, README | Metrics port 9090; Prometheus/Grafana in compose | Vitest; metrics on 3000 |
| §8 V1 30-day | Auth, orders, user WS, crash recovery, batch, kill, multi-token, hardening | markets.json; LiveMarketMaker; 48h stress gate | Multi-market via TOKEN_IDS only |
| §9 Reliability runbook | Startup, main loop, reconnect, reconciliation, circuit breakers, idempotency, Telegram | MIN_BALANCE exit; ban-status; max reconnect attempts; heartbeat; backup automation | Kill path /kill vs /admin/kill-switch |
| §10 Safety & compliance | Geo, private key, disclaimers, rate limit, tests, monitoring, legal/ethics | ban-status check; 7-day paper + micro capital checklist; heartbeat | — |
| §11 Decisions | TypeScript, SQLite, single VM, Grafana/Prometheus, compliance | MIN_BALANCE; Postgres production note | — |
| §12 Open questions | Open questions doc; runbook checks | Verification script and checklist per §12.2; fee-rate/ban-status checks | — |

---

## Verdict: Research vs repo (where they differ)

| Topic | Research says | Repo does | Better choice | Why (based on research) |
|-------|----------------|-----------|---------------|--------------------------|
| Folder layout | src/ with data, strategy, execution, etc. | apps/backend/src with clients, trading, utils | Tie | Repo layout is clear and mappable. |
| Strategy/markets config | config/strategy.json, config/markets.json | Env vars + code only | Research | §6.1, §8: change strategy/markets without code. |
| Test layout | tests/unit, integration, backtest | Implemented: apps/backend/tests/{unit,integration,backtest}/ | Done | §6.3; CI runs by dir. |
| Test runner | Jest | Vitest | Tie | Vitest is adequate. |
| ethers | Explicit ethers@5 | Likely transitive only | Research | §7: explicit deps avoid surprises. |
| Metrics port | 9090 | Same as API (3000) | Tie | Repo simpler; research slightly better for separation. |
| fee-rate | GET /fee-rate for fee-enabled markets | Fixed paper fee; no fee-rate call | Research | §1.4: correct costs/rebates on fee markets. |
| ban-status | On startup + every 24h; cert_required alert | Not implemented | Research | §9.2, §10.1: compliance and 14-day deadline. |
| MIN_BALANCE | Exit if balance < MIN_BALANCE at startup | Reconciliation only; no hard exit | Research | §9.1: avoid trading with insufficient funds. |
| Reconnect limit | Max 10 attempts then alert/exit | Backoff capped; attempt limit unclear | Research | §9.3: bounded retries and escalation. |
| Heartbeat | 1 min to healthchecks.io; alert if 5 min missed | Not implemented | Research | §9.7, §10.6: external liveness. |
| deploy.yml | CI + deploy workflow | CI only; release-please | Research | §6.1, §9: explicit deploy path. |
| Kill-switch path | POST /admin/kill-switch | POST /kill, /kill-switch | Tie | Behaviour equivalent. |
| UMA / resolution | Monitor resolution; auto-redemption; buffer | Not documented or implemented | Research | §1.6: settlement and 24/7 operation. |
| Cost documentation | §3 scenarios (e.g. $20–60/mo) | Not in repo | Research | §3: operator expectations. |

---

## Overall opinion

**Where the repo is better or equal**
- The repo has a **richer production-oriented surface** than the research’s MVP/V1: ADRs, audit trail, partial fill tracking, multiple secret backends, rate limiting, CORS, admin token, scoped kill, batch orders, learning system and backtest, and a detailed runbook and compliance doc. Structure (clients, trading, utils) is clear and the research’s intended modules are all present in some form. TypeScript, official SDK, and no geo-bypass align with research. So for **execution, safety, and ops**, the repo is at least on par and in several areas ahead.

**Where following the research more would help**
- **Compliance and reliability:** Adding **ban-status** (startup + periodic) and a **MIN_BALANCE** check with exit would match §9 and §10 and reduce legal and operational risk.
- **Operational clarity:** **config/strategy.json** and **config/markets.json** would allow strategy and multi-market tuning without code changes (§6, §8). A **deploy.yml** (or equivalent) and a **pre-deployment verification checklist** (§12.2), including fee-rate and ban-status, would make production rollout and audits easier.
- **Cost and fees:** Documenting **cost scenarios** (§3) and calling **GET /fee-rate** where relevant would set expectations and improve correctness on fee-enabled markets.
- **Observability and resilience:** **Heartbeat** to an external monitor, **max reconnect attempts** with alert/exit, and **documented (or automated) DB backup** would align with §9 and improve reliability and recoverability.

**Single clear recommendation**
- **Overall, the research would suggest prioritising ban-status and MIN_BALANCE next** because they are explicitly required for safe, compliant operation (§9.1, §10.1), are low-effort (one endpoint and a balance check), and close the largest remaining compliance/reliability gap before live capital.

---

## Actionable list (prioritised)

1. **Implement GET /ban-status** on startup and periodically (e.g. every 24h); if `cert_required: true`, alert and optionally halt trading. (§9.2, §10.1)
2. **Add MIN_BALANCE check** at startup: if wallet USDC &lt; MIN_BALANCE, log and exit (or refuse to start strategy). (§9.1)
3. **Add config/markets.json** (and optionally config/strategy.json) for multi-market and strategy parameters; wire into backend where appropriate. (§6.1, §8)
4. **Call GET /fee-rate** for tokens when placing live orders (or document that only 0%-fee markets are supported) and use in cost/display if applicable. (§1.4)
5. ~~**Reorganise tests**~~ **Done.** Tests are in tests/unit, tests/integration, tests/backtest; CI runs by directory (test:unit, test:integration, test:backtest). (§6.3)
6. **Document pre-deployment verification** checklist (e.g. ban-status, fee-rate, rate limits, batch size, balance, allowances) and add a script or runbook section that mirrors §12.2.
7. **Cap WebSocket reconnect attempts** (e.g. max 10) with critical alert and optional exit after max; document in runbook. (§9.3)
8. **Add heartbeat** to external service (e.g. healthchecks.io) every 1 min and alert if missed 5 min. (§9.7, §10.6)
9. **Document cost scenarios** (e.g. $5, $17–20, $40–60/mo) in docs or runbook per §3.
10. **Add deploy workflow** (e.g. .github/workflows/deploy.yml) or document deployment steps where deploy is done outside GitHub. (§6.1)
11. **Uncomment or add Prometheus + Grafana** in docker-compose for default observability stack. (§7 Day 6)
12. **Document UMA resolution** (and optional auto-redemption) in runbook and, if needed, add minimal monitoring or hooks. (§1.6)
13. **Add daily DB backup** (e.g. sqlite .dump to S3/Backblaze) with retention and document in runbook. (§9.8)
14. **Optional: separate metrics port** (e.g. 9090) if you want to match research exactly; otherwise keep current design and document it.
15. **Optional: implement LiveMarketMaker** (or equivalent) and 48h stress test gate for V1 completion. (§8)

---

*End of report. Citations: research by section (§); repo by file path and, where useful, line numbers.*
