# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.18.2](https://github.com/sedarged/polymarket-bot/compare/v1.18.1...v1.18.2) (2026-02-06)


### Bug Fixes

* remove unused imports and clarify CI coverage docs (PR feedback) ([9a9559e](https://github.com/sedarged/polymarket-bot/commit/9a9559e233a4d99878714e015e753b4fb850bb9d))

## [1.18.1](https://github.com/sedarged/polymarket-bot/compare/v1.18.0...v1.18.1) (2026-02-05)


### Bug Fixes

* Make jitter tests deterministic and improve spy setup ([e1f62e9](https://github.com/sedarged/polymarket-bot/commit/e1f62e9d19e662648db6c9726c430b6267fb3017))

## [1.18.0](https://github.com/sedarged/polymarket-bot/compare/v1.17.4...v1.18.0) (2026-02-05)


### Features

* implement sensitive data masking in logs (A-022) ([7831ef9](https://github.com/sedarged/polymarket-bot/commit/7831ef9955a74ec250972159f67b73eabfdd50b5))


### Bug Fixes

* add clarifying comments and improve documentation based on review feedback ([0c9bcba](https://github.com/sedarged/polymarket-bot/commit/0c9bcba306838d5f1518517e53d726944335a836))

## [1.17.4](https://github.com/sedarged/polymarket-bot/compare/v1.17.3...v1.17.4) (2026-02-05)


### Bug Fixes

* replace integer counter with UUID v4 in paper trading engine (A-021) ([aeccae1](https://github.com/sedarged/polymarket-bot/commit/aeccae1b4f872f2cdaca136baf2874f715197f17))
* **security:** Replace integer counter with UUID v4 in paper trading engine (A-021) ([af01ea0](https://github.com/sedarged/polymarket-bot/commit/af01ea0c63accca6429fe3eef7f54741d88651ab))

## [1.17.3](https://github.com/sedarged/polymarket-bot/compare/v1.17.2...v1.17.3) (2026-02-05)


### Bug Fixes

* **backend:** remove [@ts-expect-error](https://github.com/ts-expect-error) from marketFeed.ts (A-026) ([1e20905](https://github.com/sedarged/polymarket-bot/commit/1e20905332dfa72a2f0e9cfcd0f6be14de5517f8)), closes [#105](https://github.com/sedarged/polymarket-bot/issues/105)
* **backend:** use isSubscribed flag to prevent double subscription ([93b316c](https://github.com/sedarged/polymarket-bot/commit/93b316c6393c84b7b69d19ee52242dc5e136a05b))

## [1.17.2](https://github.com/sedarged/polymarket-bot/compare/v1.17.1...v1.17.2) (2026-02-05)


### Bug Fixes

* **security:** remove unsafe type coercion - Audit Finding A-005 ([0e42399](https://github.com/sedarged/polymarket-bot/commit/0e42399adb07869358860e509dcc2c775272677d))

## [1.17.1](https://github.com/sedarged/polymarket-bot/compare/v1.17.0...v1.17.1) (2026-02-05)


### Bug Fixes

* Address PR review comments for A-009 ([a0b2216](https://github.com/sedarged/polymarket-bot/commit/a0b221692d008e47480d30acced734e9b1ce46c7))
* **retry:** Add total timeout to prevent unbounded retries (A-009) ([1510b5f](https://github.com/sedarged/polymarket-bot/commit/1510b5f950a62eb776de0c0691fa132c4c0def5f))

## [1.17.0](https://github.com/sedarged/polymarket-bot/compare/v1.16.1...v1.17.0) (2026-02-05)


### Features

* integrate circuit breaker auto-reset in RiskManager (A-018) ([9670541](https://github.com/sedarged/polymarket-bot/commit/9670541f982d9c60737c77b97a263dbaff742eb2))
* integrate circuit breaker auto-reset into RiskManager (A-018) ([35e1cb3](https://github.com/sedarged/polymarket-bot/commit/35e1cb3fb7513e4754135f6c3f48c8ab2f76273d))
* plan circuit breaker auto-reset integration (A-018) ([6a16315](https://github.com/sedarged/polymarket-bot/commit/6a16315fbba7b52a71c2ec8d9a4bee1b32d94837))


### Bug Fixes

* address code review feedback for circuit breaker ([576db15](https://github.com/sedarged/polymarket-bot/commit/576db1511e979b3600b19b93b9d47f0498525467))
* address PR review feedback - add circuit breaker metrics to /status endpoint ([1a6da88](https://github.com/sedarged/polymarket-bot/commit/1a6da88ff3cb7e335ebe1c098a4f3666984b6f6f))

## [1.16.1](https://github.com/sedarged/polymarket-bot/compare/v1.16.0...v1.16.1) (2026-02-05)


### Bug Fixes

* address PR review feedback - update line references and fix test randomization ([85d30a1](https://github.com/sedarged/polymarket-bot/commit/85d30a1397d81368971569bf47799553cba1a67e))
* prevent reconnect after close() to fix timer leak (A-016) ([26d6284](https://github.com/sedarged/polymarket-bot/commit/26d628455fce7c127ce5e5d73e99c021054c51be))

## [1.16.0](https://github.com/sedarged/polymarket-bot/compare/v1.15.0...v1.16.0) (2026-02-05)


### Features

* implement graceful shutdown for WebSocket and backend services (A-017) ([ffd75ee](https://github.com/sedarged/polymarket-bot/commit/ffd75eed2f0c7a2c184d836734a7030c68985fa7))


### Bug Fixes

* address code review feedback for graceful shutdown ([b065750](https://github.com/sedarged/polymarket-bot/commit/b0657502df76eeafc46db2d2d41b33c97fdc05ba))

## [1.15.0](https://github.com/sedarged/polymarket-bot/compare/v1.14.0...v1.15.0) (2026-02-04)


### Features

* implement persistence layer for trading state (Gap PA-001) ([5923855](https://github.com/sedarged/polymarket-bot/commit/5923855fe3f50e80e182e7d6f422587b40ddceb1))

## [1.14.0](https://github.com/sedarged/polymarket-bot/compare/v1.13.0...v1.14.0) (2026-02-04)


### Features

* Surface balance fetch errors and block trading on failure (A-011) ([ed65c6a](https://github.com/sedarged/polymarket-bot/commit/ed65c6a3d68682d8deef3efd24eccdddcdd1125c))


### Bug Fixes

* Add balance fetch mocks to existing tests ([a9f28f6](https://github.com/sedarged/polymarket-bot/commit/a9f28f66bbaad1517747243c50b5871bee03cd9f))
* Address code review feedback - improve test cleanup and assertions ([72066be](https://github.com/sedarged/polymarket-bot/commit/72066be77bb605b32fce2f820d624743cb4b60e9))
* Address PR review feedback - improve periodic reconciliation resilience and staleness threshold ([1766766](https://github.com/sedarged/polymarket-bot/commit/1766766f2755145fd096d8f3e6addd7fb3bec877))

## [1.13.0](https://github.com/sedarged/polymarket-bot/compare/v1.12.0...v1.13.0) (2026-02-04)


### Features

* implement WebSocket message deduplication (A-010) ([68e9aa3](https://github.com/sedarged/polymarket-bot/commit/68e9aa34a4221964535b0713715677fc419155ba)), closes [#124](https://github.com/sedarged/polymarket-bot/issues/124)


### Bug Fixes

* address code review feedback for WebSocket deduplication ([519616a](https://github.com/sedarged/polymarket-bot/commit/519616a4095fec3ec4e5684cff58453f3802b45d))
* address PR review feedback ([b83374b](https://github.com/sedarged/polymarket-bot/commit/b83374b069c1c282bbb0d80ed955c8a7414f2d1f))
* TypeScript strict mode compliance for deduplication ([3d634b0](https://github.com/sedarged/polymarket-bot/commit/3d634b0496d065bcf5c220e03949ce067fbc6cc4))

## [1.12.0](https://github.com/sedarged/polymarket-bot/compare/v1.11.0...v1.12.0) (2026-02-04)


### Features

* implement API rate limiting - Audit Finding A-008 ([1a198aa](https://github.com/sedarged/polymarket-bot/commit/1a198aac379105cfb80d02c1d0b9cdc4efebfa13))
* implement API rate limiting (A-008) ([5b1833a](https://github.com/sedarged/polymarket-bot/commit/5b1833aca61ca602af8f55d72bb435587659b750))


### Bug Fixes

* address PR review feedback on rate limiting ([2bbeb7a](https://github.com/sedarged/polymarket-bot/commit/2bbeb7a60a24faa536043fe9b78e9746939fdd6b))

## [1.11.0](https://github.com/sedarged/polymarket-bot/compare/v1.10.0...v1.11.0) (2026-02-04)


### Features

* implement periodic reconciliation (Gap RE-001) ([4a20354](https://github.com/sedarged/polymarket-bot/commit/4a203546616c58de5f8e546ca681dbd21bad04e1))
* implement periodic state reconciliation (Gap RE-001) ([04a5efa](https://github.com/sedarged/polymarket-bot/commit/04a5efad54f60603899eed327641e9970c141f56))


### Bug Fixes

* address code review feedback for periodic reconciliation ([d67e358](https://github.com/sedarged/polymarket-bot/commit/d67e3584631c7d6a6ab7d592a97aec9409b03e1a))

## [1.10.0](https://github.com/sedarged/polymarket-bot/compare/v1.9.0...v1.10.0) (2026-02-04)


### Features

* add tick size and minimum order size validation (Issue [#75](https://github.com/sedarged/polymarket-bot/issues/75)) ([cca8dcc](https://github.com/sedarged/polymarket-bot/commit/cca8dcca274fb59db28c1b5c34d99980b4393994))
* enforce tick size and minimum order size validation ([bba9039](https://github.com/sedarged/polymarket-bot/commit/bba9039a744f412f2c08a31fc60b28a41d4c4522))


### Bug Fixes

* address code review feedback - add validation, cleanup, and tests ([3bb4361](https://github.com/sedarged/polymarket-bot/commit/3bb436180131fb04d2253929c62ec6fdcf91383a))
* remove invalid tick size test case per code review ([f3e16cd](https://github.com/sedarged/polymarket-bot/commit/f3e16cdc28e38017eda2f5672c745c4f0e28fe1e))
* resolve TypeScript build errors in order validation ([e482f02](https://github.com/sedarged/polymarket-bot/commit/e482f0274b8937dcd2cabfe8e34a4c56498a3220))

## [1.9.0](https://github.com/sedarged/polymarket-bot/compare/v1.8.0...v1.9.0) (2026-02-04)


### Features

* add order parameter input validation (A-015) ([bd8b844](https://github.com/sedarged/polymarket-bot/commit/bd8b844584b14c0fc5184f6ffc31e9d29e89943b))


### Bug Fixes

* clarify test names and remove unused import ([0295de2](https://github.com/sedarged/polymarket-bot/commit/0295de23eb41f1f3ac23ee785c68e63f67034df3))

## [1.8.0](https://github.com/sedarged/polymarket-bot/compare/v1.7.0...v1.8.0) (2026-02-04)


### Features

* implement UUID-based order idempotency (A-006) ([2a74f94](https://github.com/sedarged/polymarket-bot/commit/2a74f94f58fed336ec175749015df0dea73f7077))


### Bug Fixes

* address PR review feedback for idempotency (A-006) ([a5c79f3](https://github.com/sedarged/polymarket-bot/commit/a5c79f333a1353e81302a0806baaeec1c635e91b))

## [1.7.0](https://github.com/sedarged/polymarket-bot/compare/v1.6.0...v1.7.0) (2026-02-04)


### Features

* add admin authentication for sensitive endpoints (A-004) ([08bac68](https://github.com/sedarged/polymarket-bot/commit/08bac6859db0d0a128f63fc3dec5415f60b22fa8))


### Bug Fixes

* require ADMIN_TOKEN for both production and live trading modes ([91794c0](https://github.com/sedarged/polymarket-bot/commit/91794c027b13f3f352108a87992e727f4b7b7f2f))

## [1.6.0](https://github.com/sedarged/polymarket-bot/compare/v1.5.0...v1.6.0) (2026-02-04)


### Features

* implement audit trail for order/fill history (PA-002) ([1b91cc9](https://github.com/sedarged/polymarket-bot/commit/1b91cc99ce6221b67915ea7eb36625452dddd446)), closes [#129](https://github.com/sedarged/polymarket-bot/issues/129)
* implement SQLite audit trail for order/fill history (PA-002) ([21f5c6b](https://github.com/sedarged/polymarket-bot/commit/21f5c6b6e29f78a6f6ba90d8cd583d66d52076dc))


### Bug Fixes

* address PR review feedback ([4682fc7](https://github.com/sedarged/polymarket-bot/commit/4682fc73b63698b117a4b77be92606cfdc30c2cc))

## [1.5.0](https://github.com/sedarged/polymarket-bot/compare/v1.4.0...v1.5.0) (2026-02-04)


### Features

* integrate Prometheus metrics (OB-001) ([a0f86c0](https://github.com/sedarged/polymarket-bot/commit/a0f86c0f1c1d0fef47b0789ee4fde9a4bbd22688))
* integrate Prometheus metrics for production observability (OB-001) ([994bc98](https://github.com/sedarged/polymarket-bot/commit/994bc9854bffae5b2fb257effb9006327ed17452))


### Bug Fixes

* address PR review comments on metrics implementation ([64203a6](https://github.com/sedarged/polymarket-bot/commit/64203a6f79cdf44625ee49d88b3c957e4cbbb1ce))

## [1.4.0](https://github.com/sedarged/polymarket-bot/compare/v1.3.0...v1.4.0) (2026-02-04)


### Features

* implement partial fill simulation for paper trading (A-019) ([30e3b19](https://github.com/sedarged/polymarket-bot/commit/30e3b196ed1816cde746d05dc0bc40c288fef392))
* implement partial fill simulation for paper trading (A-019) ([b20ecf9](https://github.com/sedarged/polymarket-bot/commit/b20ecf9d8c9dd6fc1f2da4e15261ea0142d7697a))


### Bug Fixes

* address review comments on partial fill implementation ([1376d7f](https://github.com/sedarged/polymarket-bot/commit/1376d7f942a9ad936dca69a7b9dc8f194aa8138d))

## [1.3.0](https://github.com/sedarged/polymarket-bot/compare/v1.2.1...v1.3.0) (2026-02-04)


### Features

* **trading:** implement size-based slippage calculation (A-020) ([e9d72a9](https://github.com/sedarged/polymarket-bot/commit/e9d72a9655fc0a6b64ce86065a59bc87d5c05e5d))


### Bug Fixes

* address PR review comments for slippage calculation ([9addfa7](https://github.com/sedarged/polymarket-bot/commit/9addfa772daff7b041c0d38b3ee247b04920f6b9))
* **trading:** implement size-based slippage calculation (A-020) ([922e52b](https://github.com/sedarged/polymarket-bot/commit/922e52b731d275d93d013e1fdc5ac6f71b215c9f))

## [1.2.1](https://github.com/sedarged/polymarket-bot/compare/v1.2.0...v1.2.1) (2026-02-04)


### Bug Fixes

* address PR review feedback for CORS implementation ([a9d2753](https://github.com/sedarged/polymarket-bot/commit/a9d2753322e268f9457b388cb8d55ec4c840cef0))

## [1.2.0](https://github.com/sedarged/polymarket-bot/compare/v1.1.0...v1.2.0) (2026-02-04)


### Features

* implement persistent kill switch state (A-002) ([63c4566](https://github.com/sedarged/polymarket-bot/commit/63c4566695ac0c286b7874bdb2d08662b4bfc138))


### Bug Fixes

* address code review feedback ([d14bc76](https://github.com/sedarged/polymarket-bot/commit/d14bc76dd4fe1f5bd522ae8565f252b92fbf9501))
* address code review feedback - fail-closed behavior and validation ([009bd92](https://github.com/sedarged/polymarket-bot/commit/009bd92872c6d522a8d7fd09d3ea3846baf2060e))
* address final code review feedback ([c058e3b](https://github.com/sedarged/polymarket-bot/commit/c058e3b46a7e083a6a66f3bd57db979d85fb9828))
* ensure kill switch state restoration completes before trading ([e2df92f](https://github.com/sedarged/polymarket-bot/commit/e2df92fd844b31d15eb410e9bed27b4cfbd26838))

## [1.1.0](https://github.com/sedarged/polymarket-bot/compare/v1.0.1...v1.1.0) (2026-02-01)


### Features

* implement production dashboard UI/UX with comprehensive features ([fee39bd](https://github.com/sedarged/polymarket-bot/commit/fee39bd91ed8eb0e25bee8c458710ce4ca3a2799))
* production dashboard with monitoring, controls, and security ([ec3e5f0](https://github.com/sedarged/polymarket-bot/commit/ec3e5f0597dc75a19a461a9b25c186f159611140))


### Bug Fixes

* add explicit type="button" to all non-submit buttons ([705077c](https://github.com/sedarged/polymarket-bot/commit/705077c9f16d8cbb733f53d2cd9fd3504819502e))
* correct documentation claims and config change log tracking ([a09bb0b](https://github.com/sedarged/polymarket-bot/commit/a09bb0ba649bfe2f58b7e287d7919e972a87d3b0))
* improve form accessibility and validation in dashboard ([4c9d244](https://github.com/sedarged/polymarket-bot/commit/4c9d24482ec1e0c8a6a2e18c7cccc53c84fa7ed8))

## [1.0.1](https://github.com/sedarged/polymarket-bot/compare/v1.0.0...v1.0.1) (2026-02-01)


### Bug Fixes

* correct dependabot update-types values ([8febe63](https://github.com/sedarged/polymarket-bot/commit/8febe63884f1ef1ede8c9d2c4412b2fa118e5f84))

## 1.0.0 (2026-02-01)


### Features

* add comprehensive GitHub automation suite and CI/CD ([9f5b6e8](https://github.com/sedarged/polymarket-bot/commit/9f5b6e87f68bf84a0e5b6971e1d7422457de9eef))
* add GitHub automation suite and CI/CD pipeline ([e37705c](https://github.com/sedarged/polymarket-bot/commit/e37705c419ca1e140162cf8378602247ac7e73ae))
* validate config and add health endpoint ([9703356](https://github.com/sedarged/polymarket-bot/commit/970335616f170b4d5659b9e25f70dc1ed401a85e))


### Bug Fixes

* address PR review feedback on automation workflows ([9eeb698](https://github.com/sedarged/polymarket-bot/commit/9eeb698b4ba3ef918e6b2128aefb0b4debaac5c5))

## [Unreleased]

### Added
- AI-first documentation system with auto-syncing STATUS.md
- Automated issue-to-status synchronization via GitHub Actions
- Agent guidelines and contracts in AGENTS.md
- Comprehensive documentation index and AI guides
- Small PR Implementation Plan (13 PRs) addressing audit findings
- Detailed acceptance criteria and evidence requirements for each PR
- PR dependency graph and timeline estimates
- Evidence collection template for PR reviews

### Changed
- Reorganized documentation structure for better discoverability
- Enhanced copilot instructions to reference structured docs

## [0.1.0] - Initial Release

### Added
- Polymarket trading bot foundation
- Paper trading mode (default, safe)
- Live trading mode (gated by compliance flags)
- WebSocket market data streaming
- Order book monitoring
- Basic command-line interface
- TypeScript monorepo structure (apps/backend, apps/frontend, packages/shared)
- Comprehensive documentation suite
- Environment variable configuration
- Development and operational runbooks

### Security
- Geoblocking compliance (no VPN/proxy bypass)
- Two-factor live trading gate (LIVE_TRADING + COMPLIANCE_ACCEPTED)
- Secret management via .env files
- Frontend isolation from secrets

[Unreleased]: https://github.com/sedarged/polymarket-bot/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/sedarged/polymarket-bot/releases/tag/v0.1.0
