# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.0](https://github.com/sedarged/polymarket-bot/compare/v2.3.0...v2.4.0) (2026-02-18)


### Features

* add CLI command and integration tests for exchange rates (GAP-007) ([7677ad1](https://github.com/sedarged/polymarket-bot/commit/7677ad1d1cb37821d1fac08b3a37151739d99a68))
* add ExchangeRateClient with caching and error handling (GAP-007) ([c70155c](https://github.com/sedarged/polymarket-bot/commit/c70155c7ff6650b08bdae3fe1703fb9a20664fc7))


### Bug Fixes

* address PR review feedback for exchange rate client (GAP-007) ([fbd405b](https://github.com/sedarged/polymarket-bot/commit/fbd405b8a64714974265c6bfc3cfe6d3e4eecf25))

## [2.3.0](https://github.com/sedarged/polymarket-bot/compare/v2.2.0...v2.3.0) (2026-02-18)


### Features

* add buffered data pipeline ingestion to event store ([f611c19](https://github.com/sedarged/polymarket-bot/commit/f611c195352bf38cae3b29f4dd6c3fa322b3e8fb))
* add config reload and secret rotation metrics ([d761fb1](https://github.com/sedarged/polymarket-bot/commit/d761fb16d8e7f79a8e80fff1b315ea91891f4f6c))
* support admin token rotation via next token ([ffffaae](https://github.com/sedarged/polymarket-bot/commit/ffffaaeb6672580f48ec56aec10f6d738488bfc6))


### Bug Fixes

* address PR [#436](https://github.com/sedarged/polymarket-bot/issues/436) security review comments ([105a06f](https://github.com/sedarged/polymarket-bot/commit/105a06f7ae2c3b006ec8b7c13229d6e0f289c877))
* address PR review comments for admin token security ([66f1ed8](https://github.com/sedarged/polymarket-bot/commit/66f1ed834be14f3a0a1886dd7eec7662c8f4a6e9))
* address security review feedback on secret management docs ([2b3fcc7](https://github.com/sedarged/polymarket-bot/commit/2b3fcc780ec460a960224d9bdb712ff6519f3a95))
* preserve newer orderbook snapshots during re-buffering after flush failure ([d7e7cd7](https://github.com/sedarged/polymarket-bot/commit/d7e7cd787ebddde641a797e0a77d54ce6670605f))

## [2.2.0](https://github.com/sedarged/polymarket-bot/compare/v2.1.0...v2.2.0) (2026-02-18)


### Features

* implement cloud secret backends ([af60d67](https://github.com/sedarged/polymarket-bot/commit/af60d675ba9bbbc64e0839ac796a23d2378852be))


### Bug Fixes

* normalize cloud backend keys and clarify AWS_REGION default ([a6f040f](https://github.com/sedarged/polymarket-bot/commit/a6f040fa525b37bc356ac146d6e37b685d9c320f))
* validate and normalize keys from cloud backends ([032f229](https://github.com/sedarged/polymarket-bot/commit/032f2296f79f027a7efae2c07c218a71405a503c))

## [2.1.0](https://github.com/sedarged/polymarket-bot/compare/v2.0.0...v2.1.0) (2026-02-17)


### Features

* implement configuration management interface with hot-reload (GAP-003) ([cc9993f](https://github.com/sedarged/polymarket-bot/commit/cc9993faf7a23715c87061b00d2e7606480918c7)), closes [#394](https://github.com/sedarged/polymarket-bot/issues/394)


### Bug Fixes

* address code review feedback for configuration management ([17e1e5d](https://github.com/sedarged/polymarket-bot/commit/17e1e5de275b5e46e3ac692d862b74c9e4c50e15))
* address configuration management PR review feedback ([35df05d](https://github.com/sedarged/polymarket-bot/commit/35df05d71b66e9db7972f844d14a1dd2851bb4e7))
* address new PR review feedback ([0f76313](https://github.com/sedarged/polymarket-bot/commit/0f763134007c6c8a18428289cfbbde17201e8fca))
* address PR review feedback for configuration management ([833cd70](https://github.com/sedarged/polymarket-bot/commit/833cd70e47bf574bdd706d393dfec4a8e148cec2))

## [2.0.0](https://github.com/sedarged/polymarket-bot/compare/v1.36.0...v2.0.0) (2026-02-17)


### ⚠ BREAKING CHANGES

* Infrastructure can now be deployed reproducibly using version-controlled configurations.

### Features

* implement Infrastructure as Code for reproducible deployments ([2ba6c46](https://github.com/sedarged/polymarket-bot/commit/2ba6c4699a0122cd73c224ff48ad4067146b8f02))


### Bug Fixes

* address IaC verification and deployment robustness issues ([5049886](https://github.com/sedarged/polymarket-bot/commit/50498866fd465de5dcbfe0ccc728ae55da4a659b))

## [1.36.0](https://github.com/sedarged/polymarket-bot/compare/v1.35.0...v1.36.0) (2026-02-16)


### Features

* add deployment verification script ([ca50fe1](https://github.com/sedarged/polymarket-bot/commit/ca50fe1fec7e7c46da5eb98331dd6018e1ccaa9f))
* enhance deployment workflow with staging/production support ([af694a9](https://github.com/sedarged/polymarket-bot/commit/af694a959332434b7059c1303e1975b2e0875d20))

## [1.35.0](https://github.com/sedarged/polymarket-bot/compare/v1.34.1...v1.35.0) (2026-02-16)


### Features

* implement automated database backup system with cloud storage support ([bf10f3d](https://github.com/sedarged/polymarket-bot/commit/bf10f3de4e07fc68899f9c6f42df9589b1a602eb))


### Bug Fixes

* add config schema validation for cloud backup credentials ([ffb472d](https://github.com/sedarged/polymarket-bot/commit/ffb472d533daf03eb7e95a84818a0e99ce788bd4))
* add S3 pagination to list backups method ([96e98b1](https://github.com/sedarged/polymarket-bot/commit/96e98b14422d0666e40780fdf3d585f213524864))
* add type safety and config validation for backup command ([08be989](https://github.com/sedarged/polymarket-bot/commit/08be989f5751f4d68ed8015b7feebdde2e571152))
* apply per-database retention to GCS and Azure ([b32273b](https://github.com/sedarged/polymarket-bot/commit/b32273bec5dae05b9d03bc229f13864ca3b168da))
* implement S3 pagination and per-database retention ([c5c8fb0](https://github.com/sedarged/polymarket-bot/commit/c5c8fb0f163de57136bc14e331beac649b379328))
* improve SQLite backup consistency and security ([d426124](https://github.com/sedarged/polymarket-bot/commit/d426124bd6b629634ddb6bd108164ee97b79165d))
* prevent resource leaks and correct content types ([364f3e5](https://github.com/sedarged/polymarket-bot/commit/364f3e52976ef2672c534e0f61e5db187de7950e))
* resolve TypeScript errors and update test assertions ([5ce01ea](https://github.com/sedarged/polymarket-bot/commit/5ce01ea1ac7774386d7e4a267380e3aa2a679a26))

## [1.34.1](https://github.com/sedarged/polymarket-bot/compare/v1.34.0...v1.34.1) (2026-02-13)


### Bug Fixes

* complete gap renumbering in IMPLEMENTATION_PLAN.md ([a40c6f5](https://github.com/sedarged/polymarket-bot/commit/a40c6f582d0a573efcbb815e3a9d2f56621c3e6c))
* remove incorrect GAP-015 and update all gap counts ([825c2ef](https://github.com/sedarged/polymarket-bot/commit/825c2ef6000cd6556df3b29cda7d9b2737318053))

## [1.34.0](https://github.com/sedarged/polymarket-bot/compare/v1.33.2...v1.34.0) (2026-02-11)


### Features

* add WebSocket heartbeat validation (DI-002) ([c22055c](https://github.com/sedarged/polymarket-bot/commit/c22055c154047072cf60bb3a45506a97b7ec699b))
* expand trading-specific Prometheus metrics (A-027) ([18c28cf](https://github.com/sedarged/polymarket-bot/commit/18c28cfb0d69354e501ff67c87ba70ffd41c7ef8))


### Bug Fixes

* add strict order ID validation at creation time (A-013) ([f2ca321](https://github.com/sedarged/polymarket-bot/commit/f2ca321a691460c4d38fe67ec940b23574f0b914))
* address follow-up review comments - remove redundancy, fix fail-fast, remove TODO ([24ae187](https://github.com/sedarged/polymarket-bot/commit/24ae187ad4c41b4d2a940929226bbf1444673869))
* address PR review comments - cleanup, metrics, and logic fixes ([0d88faa](https://github.com/sedarged/polymarket-bot/commit/0d88faa5d99b8c969afa85a0361468c0f2a59c64))
* ensure reconnect timer cleanup in all close paths (A-016) ([be5174f](https://github.com/sedarged/polymarket-bot/commit/be5174f8eb7093c01330e786bc8cce54736faffd))
* fail startup on trading client init failure in production (A-012) ([2517c62](https://github.com/sedarged/polymarket-bot/commit/2517c62d55408f2835c5f948fc0c2a6bce233d1b))
* resolve ESLint peer dependency conflict ([672ae5e](https://github.com/sedarged/polymarket-bot/commit/672ae5efb358cb3430622689aceff82e9b79cf9a))

## [1.33.2](https://github.com/sedarged/polymarket-bot/compare/v1.33.1...v1.33.2) (2026-02-11)


### Bug Fixes

* address all PR review feedback from Sourcery and Copilot ([31f8700](https://github.com/sedarged/polymarket-bot/commit/31f8700426d31c50fefc8a40fc53dbaefa75faaf))
* address PR review feedback - test cleanup, audit math, and A-010 docs ([b7b26a0](https://github.com/sedarged/polymarket-bot/commit/b7b26a030a123958656a916ce38cce66fdd9eff0))
* address PR review feedback - update A-010 status and add TTL tests ([8245d2f](https://github.com/sedarged/polymarket-bot/commit/8245d2f247592a3e7cc8dc46f967975a29688970))
* address review feedback - timer cleanup, math, and A-010 docs ([cd4543a](https://github.com/sedarged/polymarket-bot/commit/cd4543a7cec6736f5a9d46cc94b98da215a1635b))
* implement cache TTL enforcement for orderbook cache (A-015) ([49197cf](https://github.com/sedarged/polymarket-bot/commit/49197cfc273c1dfb224baba34c9617943bf35db1))

## [1.33.1](https://github.com/sedarged/polymarket-bot/compare/v1.33.0...v1.33.1) (2026-02-10)


### Bug Fixes

* add @ethersproject/wallet as direct dependency and use type-only import ([9bb827a](https://github.com/sedarged/polymarket-bot/commit/9bb827a46a57f295e63a37a7991b37c52fe8e82f))
* correct kill switch persistence status and env var names in PLAN.md ([945d903](https://github.com/sedarged/polymarket-bot/commit/945d90309694860de3e71289dff9af39933b63e8))
* correct PLAN.md with accurate current state from code verification ([f5013a0](https://github.com/sedarged/polymarket-bot/commit/f5013a0326f5f37936757c36eb38a37d559351db))
* resolve TypeScript build errors by using correct Wallet import from ethers v5 ([92f414f](https://github.com/sedarged/polymarket-bot/commit/92f414f7eb77e19c7e9f3aec4d3a8b31ddeb42d0))

## [1.33.0](https://github.com/sedarged/polymarket-bot/compare/v1.32.0...v1.33.0) (2026-02-10)


### Features

* implement categorized logging with Pino ([#323](https://github.com/sedarged/polymarket-bot/issues/323)) ([33f769b](https://github.com/sedarged/polymarket-bot/commit/33f769b1bd3ce7b9fe09b78fee9930b2ffdeb706))
* implement categorized logging with Pino ([#323](https://github.com/sedarged/polymarket-bot/issues/323)) ([96908d0](https://github.com/sedarged/polymarket-bot/commit/96908d0a49d521793f17dff09e1a91288fe6d3de))


### Bug Fixes

* address PR review feedback for logger ([#327](https://github.com/sedarged/polymarket-bot/issues/327)) ([b5ffbfc](https://github.com/sedarged/polymarket-bot/commit/b5ffbfcf484847fdb6822b351a4cf1844c799434))

## [1.32.0](https://github.com/sedarged/polymarket-bot/compare/v1.31.0...v1.32.0) (2026-02-09)


### Features

* add Docker deployment infrastructure with security hardening ([ea281aa](https://github.com/sedarged/polymarket-bot/commit/ea281aadf332e50b43134f1c9340b006ee5c6942))
* add Docker verification script and update architecture docs ([183769e](https://github.com/sedarged/polymarket-bot/commit/183769eab6d39a8c2ff810ca1e1de2a28d93cfe5))


### Bug Fixes

* address code review feedback for Docker infrastructure ([546e415](https://github.com/sedarged/polymarket-bot/commit/546e41524d03ac86d64deac9b456c490ce9b8e59))
* address code review findings for Docker configuration ([3c2d60b](https://github.com/sedarged/polymarket-bot/commit/3c2d60b561beae7737b1c5235e68cff2990149e3))
* improve POSIX compatibility in verify-docker.sh ([b90b040](https://github.com/sedarged/polymarket-bot/commit/b90b040a80de5ad9d618594bafeb3dfa90b8a454))

## [1.31.0](https://github.com/sedarged/polymarket-bot/compare/v1.30.1...v1.31.0) (2026-02-09)


### Features

* add automation scripts for verification and quality checks ([4cda91e](https://github.com/sedarged/polymarket-bot/commit/4cda91e06cff6458927985142520be6eef0e2918))


### Bug Fixes

* correct API endpoint responses and verification expectations in checklist ([56d2667](https://github.com/sedarged/polymarket-bot/commit/56d2667ef12385efc1fdf2e297f3dbc9b41b3427))

## [1.30.1](https://github.com/sedarged/polymarket-bot/compare/v1.30.0...v1.30.1) (2026-02-09)


### Bug Fixes

* Address PR review feedback - correct imports, error handling, and pagination docs ([67da9a2](https://github.com/sedarged/polymarket-bot/commit/67da9a2328264075317be1e1d55e752283f69c21))
* Fix userFeed TypeScript errors and update tests for ApiKeyCreds ([16b725b](https://github.com/sedarged/polymarket-bot/commit/16b725bdd4b4d3aaedca6e8cedaa34e3a87bbc1a))

## [1.30.0](https://github.com/sedarged/polymarket-bot/compare/v1.29.0...v1.30.0) (2026-02-09)


### Features

* complete Gamma API integration with WebSocket user streaming (Issue [#242](https://github.com/sedarged/polymarket-bot/issues/242)) ([55244e2](https://github.com/sedarged/polymarket-bot/commit/55244e2c2e69ddeb7d484f5761770cab000ce2e9))
* implement UserFeedClient for WebSocket user streaming ([f3ce96c](https://github.com/sedarged/polymarket-bot/commit/f3ce96cba4bd1e16a6f02c776c3bc5cbc0f4a489))


### Bug Fixes

* add missing type imports for Gamma and Data API clients ([74092c9](https://github.com/sedarged/polymarket-bot/commit/74092c9decf23430fcfcec28914d8a4c649520ce))
* address code review feedback - phase 1 ([140915c](https://github.com/sedarged/polymarket-bot/commit/140915c0d51cf80dfe84eda294eec6818bcee96f))
* refactor UserFeedClient to support WebSocket URL override for testing ([86ff2b8](https://github.com/sedarged/polymarket-bot/commit/86ff2b8e15c8ccc82196606102075e2e59cd1d97))

## [1.29.0](https://github.com/sedarged/polymarket-bot/compare/v1.28.0...v1.29.0) (2026-02-08)


### Features

* add .env.codespaces.example and update documentation ([bcc412d](https://github.com/sedarged/polymarket-bot/commit/bcc412d6a40c16f5d52a3fe75c2ceb801efb7003))
* add complete GitHub Codespaces configuration ([c7cd5e2](https://github.com/sedarged/polymarket-bot/commit/c7cd5e27f258f6fe71de883c64f3dfffae031f12))
* add comprehensive Codespaces setup guide and update .env.example with all environment variables ([17eaecb](https://github.com/sedarged/polymarket-bot/commit/17eaecb3de7534621f490022a144fcb2759581c1))


### Bug Fixes

* address security and usability issues from code review ([8106ef3](https://github.com/sedarged/polymarket-bot/commit/8106ef316859fa08311f4ee7ba1ccf577225f0f1))
* clarify stubbed integrations and planned variables in documentation ([b13e0ce](https://github.com/sedarged/polymarket-bot/commit/b13e0ceb070f56d30435e2ec0a86924a63e86ca4))
* correct documentation links in Codespaces setup guide ([f50e8a3](https://github.com/sedarged/polymarket-bot/commit/f50e8a3423c2d7cd41d5226e9d39090bbdf3cdec))

## [1.28.0](https://github.com/sedarged/polymarket-bot/compare/v1.27.1...v1.28.0) (2026-02-08)


### Features

* add dashboard authentication and learning system API integration ([9a90e27](https://github.com/sedarged/polymarket-bot/commit/9a90e278b07850bab2e87e85ff386c7eac44a017))
* add frontend authentication with login modal and session management ([3008ff3](https://github.com/sedarged/polymarket-bot/commit/3008ff3cdafbe129089e96b51ff9343359fde878))
* add learning system API endpoints with admin authentication ([ff62c3c](https://github.com/sedarged/polymarket-bot/commit/ff62c3cdaf0b9a0bc05704b2d2e66952fc5f898d))
* integrate learning system tab with backend API ([851f29b](https://github.com/sedarged/polymarket-bot/commit/851f29b6ef0c5b5bd32502cc9969440f1803ab51))


### Bug Fixes

* address PR review feedback ([8f6bccf](https://github.com/sedarged/polymarket-bot/commit/8f6bccf23b9bdaa326bf9a38bfe7a21a74a0f5b4))

## [1.27.1](https://github.com/sedarged/polymarket-bot/compare/v1.27.0...v1.27.1) (2026-02-07)


### Bug Fixes

* address PR review comments ([ee16829](https://github.com/sedarged/polymarket-bot/commit/ee16829a583a9858a6c843ffbc20bea21849a2f1))

## [1.27.0](https://github.com/sedarged/polymarket-bot/compare/v1.26.0...v1.27.0) (2026-02-07)


### Features

* add admin token authentication and comprehensive dashboard documentation ([4c2b7c8](https://github.com/sedarged/polymarket-bot/commit/4c2b7c83f2d628be42fe2d257f4f4070f2b818cc))
* add dashboard authentication and fix metrics endpoint compatibility ([fe8121e](https://github.com/sedarged/polymarket-bot/commit/fe8121eb54edfa3cf88cad02b90e6d267a81f6d6))


### Bug Fixes

* address PR review feedback on documentation and localhost detection ([7bfdccc](https://github.com/sedarged/polymarket-bot/commit/7bfdccc834cb7ac1e73f96565bbc6c23ecb933e1))

## [1.26.0](https://github.com/sedarged/polymarket-bot/compare/v1.25.0...v1.26.0) (2026-02-07)


### Features

* add alerting service with Slack/email support and comprehensive tests ([5e85462](https://github.com/sedarged/polymarket-bot/commit/5e85462885e7138b693775445f85fa19f1796d03))
* add comprehensive strategy error logging with alerting integration ([fc65210](https://github.com/sedarged/polymarket-bot/commit/fc652103c7c97545944f417159e792ca687a3799))
* add Telegram bot support for alerting alongside Slack ([5fcde26](https://github.com/sedarged/polymarket-bot/commit/5fcde26ae8e2fe8b0de28cdbbf2269fa3ed688c1))
* wire alerting to circuit breaker, kill switch, and error rate monitoring ([b848419](https://github.com/sedarged/polymarket-bot/commit/b848419c9199aaf251b2a2d7b595c4ada37d0fb1))


### Bug Fixes

* resolve TypeScript build errors - remove unused import and fix getState call ([07c814d](https://github.com/sedarged/polymarket-bot/commit/07c814db45f07296f28820a1edc1b61438a05df2))

## [1.25.0](https://github.com/sedarged/polymarket-bot/compare/v1.24.0...v1.25.0) (2026-02-07)


### Features

* implement bandit allocation, metrics gating, and promotion workflow ([04e0a13](https://github.com/sedarged/polymarket-bot/commit/04e0a132e71ec940c700318a65bcc75fdeea5f12))


### Bug Fixes

* address code review feedback ([e446bd3](https://github.com/sedarged/polymarket-bot/commit/e446bd3ed1dd654c251b5de3824a9f735c3b7c78))
* improve promotion history test robustness ([553c32f](https://github.com/sedarged/polymarket-bot/commit/553c32f96fc174857fa4bd060c62b48be63b27f5))

## [1.24.0](https://github.com/sedarged/polymarket-bot/compare/v1.23.0...v1.24.0) (2026-02-06)


### Features

* implement learning system foundation - event store, signal catalog, backtesting ([680e641](https://github.com/sedarged/polymarket-bot/commit/680e64148f763b7fa543cffad75ff9a1b3a9a2e1))
* Learning System Foundation - Event store, signal catalog, backtesting framework (PR-008) ([a92da7b](https://github.com/sedarged/polymarket-bot/commit/a92da7b69261b3862b57810439d99828c71fe202))


### Bug Fixes

* address PR review feedback - semver ordering, WAL cleanup, position tracking, links ([1fcad49](https://github.com/sedarged/polymarket-bot/commit/1fcad49893fcbaf13fd74bc9cb6c4a4fcf1f7a84))

## [1.23.0](https://github.com/sedarged/polymarket-bot/compare/v1.22.0...v1.23.0) (2026-02-06)


### Features

* implement periodic reconciliation service (RE-001) ([5c023ef](https://github.com/sedarged/polymarket-bot/commit/5c023ef70288a972ad6c1d6eb82afc0d6bd1eb4f))

## [1.22.0](https://github.com/sedarged/polymarket-bot/compare/v1.21.0...v1.22.0) (2026-02-06)


### Features

* add historical price and selective kill switch capabilities ([e096119](https://github.com/sedarged/polymarket-bot/commit/e0961193678ba901d183faef36689ddafab6adb9))


### Bug Fixes

* address code review feedback on enhanced kill switch ([d1d109a](https://github.com/sedarged/polymarket-bot/commit/d1d109a99a2f0d114b24c79fc8191eb2d7df4613))

## [1.21.0](https://github.com/sedarged/polymarket-bot/compare/v1.20.1...v1.21.0) (2026-02-06)


### Features

* implement price query endpoints (GET /price, /lasttrade, /spread, /midpoint) ([aeb84f8](https://github.com/sedarged/polymarket-bot/commit/aeb84f87d6a892dbc74014449ea0a37f8433968a))

## [1.20.1](https://github.com/sedarged/polymarket-bot/compare/v1.20.0...v1.20.1) (2026-02-06)


### Bug Fixes

* reject undefined/empty order IDs (A-013) to prevent state corruption ([14371e1](https://github.com/sedarged/polymarket-bot/commit/14371e11154bacb4d83f02ca34f5ef2b960de8e5))

## [1.20.0](https://github.com/sedarged/polymarket-bot/compare/v1.19.0...v1.20.0) (2026-02-06)


### Features

* implement batch operations and fast kill switch (PR-002) ([c8e635a](https://github.com/sedarged/polymarket-bot/commit/c8e635a77cdbb68e1b106d6cd99b03fa2e669728))


### Bug Fixes

* address code review feedback - improve type safety and security ([1abdde8](https://github.com/sedarged/polymarket-bot/commit/1abdde8590c949bc66870734609d59b623d21981))
* address critical bugs in batch operations (PR review feedback) ([ca85e3a](https://github.com/sedarged/polymarket-bot/commit/ca85e3ae145c9b1d3ded8553e99e38080043aa4f))

## [1.19.0](https://github.com/sedarged/polymarket-bot/compare/v1.18.3...v1.19.0) (2026-02-06)


### Features

* implement Data API client with full endpoint coverage ([13b23ba](https://github.com/sedarged/polymarket-bot/commit/13b23ba6b7c4219ceb6e1774e9ceeaa05d591e43))


### Bug Fixes

* address code review feedback ([67d5402](https://github.com/sedarged/polymarket-bot/commit/67d5402dc761fbce659795ba886fe725dc65db1a))
* address code review feedback comprehensively ([4f6a9d3](https://github.com/sedarged/polymarket-bot/commit/4f6a9d361ee8c82bf181f161ed2bec11ee237bdd))

## [1.18.3](https://github.com/sedarged/polymarket-bot/compare/v1.18.2...v1.18.3) (2026-02-06)


### Bug Fixes

* Add circuit breaker to GammaClient ([#116](https://github.com/sedarged/polymarket-bot/issues/116) review) ([ad74e99](https://github.com/sedarged/polymarket-bot/commit/ad74e9983e84c33030c65daa36bcb0c4b7fcf7ec))

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
