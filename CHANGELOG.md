# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
