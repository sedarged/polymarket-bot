# Documentation Index

Welcome to the Polymarket Trading Bot documentation. This index provides navigation to all project documentation.

## 📋 Quick Navigation

### 🚨 Critical - Must Read First

**Before using this bot, you MUST read these documents:**

1. **[Compliance Guide](./compliance.md)** 🔴 MANDATORY
   - Geographic restrictions (US, sanctioned countries)
   - Terms of Service compliance
   - Risk disclaimers and legal responsibilities
   - Trading gates and paper mode explanation

2. **[Security Guide](./security.md)** 🔴 CRITICAL
   - Private key management
   - Secret storage best practices
   - Known security vulnerabilities
   - Production security requirements

3. **[Security Audit Report](../REPORTS/AUDIT.md)** 🔴 CRITICAL
   - 27 security & reliability findings
   - 3 CRITICAL issues (must fix before live trading)
   - Known vulnerabilities and mitigations

### Getting Started
- [README](../README.md) - Project overview, installation, and quick start
- [STATUS](../STATUS.md) - Current work status and priorities (auto-updated from Issues)
- [System Overview](./architecture-overview.md) - Plain language explanation of how the system works
- [Examples](./examples.md) - CLI usage examples and common patterns

### Security & Audits
- [Compliance Guide](./compliance.md) - 🚨 Geographic restrictions, ToS compliance, risk disclaimers
- [Security Guide](./security.md) - 🔐 Private key security and best practices
- [Secret Management Quick Reference](./SECRET_MANAGEMENT_QUICK_REFERENCE.md) - 📋 **One-page operational guide** (print for quick reference)
- [Security Audit Report](../REPORTS/AUDIT.md) - Comprehensive security & reliability audit (27 findings)
- [Gap Analysis](../REPORTS/GAP_ANALYSIS.md) - Production readiness assessment
- [Reports Index](../REPORTS/README.md) - All audit and analysis reports

### Operations & Troubleshooting
- **[Runbook](./runbook.md)** - 📖 Complete operational procedures for production
  - Prerequisites, startup/shutdown, health checks
  - **Incident response procedures** (SEV-1 to SEV-4)
  - Kill switch usage and monitoring
  - Backup and recovery procedures
  - Docker and native deployment options
- **[Infrastructure as Code Guide](./infrastructure.md)** - 🏗️ **IaC deployment guide (GAP-040)**
  - **Terraform, Kubernetes, and Ansible configurations**
  - Reproducible infrastructure deployments
  - Version-controlled infrastructure definitions
  - Complete documentation and examples
- **[Deployment Guide](./deployment-guide.md)** - 🚀 Complete deployment procedures (GAP-015)
  - **Step-by-step deployment to staging and production**
  - Environment setup and configuration
  - Rollback procedures and emergency recovery
  - Security and access management
  - Monitoring and verification
  - Multiple deployment methods (SSH, Kubernetes, ECS, Docker Compose)
- **[Pre-deployment verification](./pre-deployment-verification.md)** - Checklist and script (Research §12.2)
- **[Deploy](./deploy.md)** - Quick deployment overview and options (Research §6.1)
- **[Cost scenarios](./cost-scenarios.md)** - Monthly cost estimates (Research §3)
- **[Docker Deployment Guide](./docker.md)** - 🐳 Container deployment and orchestration
  - Quick start with Docker and Docker Compose
  - Production deployment best practices
  - Security hardening and scanning
  - Health checks and monitoring
  - CI/CD integration
  - Comprehensive troubleshooting guide
- **[Troubleshooting Guide](./troubleshooting.md)** - 🔧 Comprehensive problem-solving guide
  - **Top 10 common issues with solutions**
  - WebSocket, API, authentication errors
  - Order placement, kill switch, balance issues
  - Debug mode and logging

### Development
- [AGENTS](../AGENTS.md) - Guidelines for AI agents working on this project
- [Development Workflow](./DEV_WORKFLOW.md) - Mandatory documentation maintenance procedures
- [Configuration Management](./configuration-management.md) - 🔧 Runtime configuration management with hot-reload (GAP-003)
- [Logging Guide](./LOGGING.md) - 📝 Categorized logging with Pino (best practices, examples, categories)
- [Logging Migration Guide](./LOGGING_MIGRATION.md) - 🔄 Examples for migrating to categorized logging
- [Codespaces Verification Checklist](./CODESPACES_VERIFICATION_CHECKLIST.md) - 🚨 **MANDATORY** real-world testing checklist for all PRs
- [Verification Policy Executive Summary](./VERIFICATION_POLICY.md) - Overview of the verification policy and its benefits
- [Codespaces Setup Guide](./CODESPACES_SETUP.md) - 🚀 Complete guide for GitHub Codespaces testing with all features
- [Codespaces Maintainer Checklist](./CODESPACES_MAINTAINER_CHECKLIST.md) - Setup guide for repository maintainers
- [Automation Scripts Guide](../scripts/README.md) - 🤖 Helper scripts for verification, quality checks, and validation
- [Automation Guide](./automation.md) - GitHub automation, CI/CD, and release management
- [Testing Guide](./testing.md) - Test strategy, infrastructure, and best practices
- [Environment Setup](./environment.md) - Complete development environment and command reference
- [Master Development Plan](./master-plan.md) - Comprehensive task list and roadmap
- [Implementation Checklist](./implementation-checklist.md) - Detailed development checklist
- [Small PR Implementation Plan](./small-pr-plan.md) - Phased PR rollout with acceptance criteria
- [PR Execution Guide](./pr-execution-guide.md) - Step-by-step guide for executing PRs
- [PR Quick Reference](./pr-quick-reference.md) - One-page PR summary (print for reference)

### Architecture & Design
- **[Architecture Map](./architecture.md)** - Technical architecture documentation with critical paths
  - System components and interactions
  - **Detailed data flow diagrams** (WebSocket, orders, kill switch, reconciliation)
  - Module dependencies and technology stack
- [Architecture Overview](./architecture-overview.md) - Plain language system explanation
- [Architecture Decision Records (ADR)](./migration-log.md) - Key architectural decisions and rationale
  - Complete list in [adr/ directory](./adr/)
  - [ADR-0007: Order Execution Service](./adr/0007-order-execution-service.md) - Order execution architecture (GAP-006)
- [Order Execution Guide](./order-execution-guide.md) - 📋 **Usage guide for ExecutionService** (GAP-006)
  - Market, limit, and conditional order examples
  - Error handling and retry strategies
  - Integration with trading strategies
- [Original PR Plan](./plan.md) - Original 10-PR rollout plan
- [Small PR Plan](./small-pr-plan.md) - Detailed 13-PR breakdown addressing audit fixes

### Operations
- [Runbook](./runbook.md) - Operational procedures, incident response, monitoring
- [Troubleshooting Guide](./troubleshooting.md) - Common issues and solutions
- [Observability & Monitoring](./observability.md) - Metrics, dashboards, and alerting
- [Audit Trail](./audit-trail.md) - Order and fill history tracking for compliance
- [Persistence Layer](./persistence.md) - Database-backed state for production reliability
- [Timer Resource Management](./timer-resource-management.md) - Timer lifecycle and memory leak prevention (A-016)
- [Error Taxonomy](./error-taxonomy.md) - Error classification and handling strategies
- [Environment Setup](./environment.md) - Complete development environment and command reference
- [Paper Trading Guide](./paper-trading.md) - Safe testing without real money
- [Report Digest](./report-digest.md) - Analysis summaries and findings

### Learning & Experimentation
- [Learning System Guide](./learning-system.md) - Event store, signal catalog, and backtesting framework
- [Learning System Design](../REPORTS/LEARNING_SYSTEM.md) - Complete architecture and design specification
- [Data Pipeline](./data-pipeline.md) - Market-feed ingestion into EventStore (GAP-021)

### AI & Automation
- [AI Agent Workflow & Quality Gates](./AI_AGENT_WORKFLOW.md) - 🤖 Complete autonomous workflow with strict quality gates
- [Project Layout](./ai/project-layout.md) - Repository structure and key files
- [Common Pitfalls](./ai/common-pitfalls.md) - Trading bot pitfalls and how to avoid them
- [Decision Trees](./ai/decision-trees.md) - Troubleshooting guides for common scenarios
- [Session State Template](./ai/session-state.md) - Template for agents to track work

### API & Integration
- [Exchange Rate Service](./EXCHANGE_RATE_SERVICE.md) - 💱 Exchange rate fetcher with CoinGecko API (GAP-007)
- [Price & Market Endpoints Usage](./price-endpoints-usage.md) - Complete guide to price query APIs (PR-005)
- [API Missing Endpoints Analysis](./api-missing-endpoints-analysis.md) - Gap analysis of Polymarket API coverage
- [API Alignment Verification](./api-alignment-verification.md) - Verification against official Polymarket docs
- [Demo: Price Endpoints](./examples/price-endpoints-demo.ts) - Working code example

### Reference
- [Environment Variable Reference](./ENV_VARIABLE_REFERENCE.md) - Complete list of env vars (reference: .env.example)
- [CHANGELOG](../CHANGELOG.md) - Release history and notable changes
- [Open Questions](./open-questions.md) - Unresolved questions and discussions
- [API Documentation Alignment](../REPORTS/RESEARCH_REVIEW.md) - Comprehensive review of Polymarket API implementation

## 📂 Documentation Structure

```
polymarket-bot/
├── README.md                    # Project overview
├── STATUS.md                    # Current work status (auto-synced)
├── AGENTS.md                    # AI agent guidelines
├── CHANGELOG.md                 # Release history
├── architecture-overview.md           # System explanation (start here!)
├── examples.md                  # Usage examples
├── master-plan.md   # Development roadmap
├── summary-pl.md              # Polish summary
│
└── docs/
    ├── README.md                # This file
    │
    ├── ai/                      # AI agent guides
    │   ├── project-layout.md
    │   ├── common-pitfalls.md
    │   ├── decision-trees.md
    │   └── session-state.md
    │
    ├── adr/                     # Architecture Decision Records
    │   ├── 0001-initial-architecture.md
    │   ├── 0002-rate-limiting-strategy.md
    │   └── 0003-api-error-handling.md
    │
    ├── architecture.md          # Technical architecture
    ├── environment.md           # Development environment
    ├── runbook.md               # Operations manual
    ├── paper-trading.md         # Paper trading guide
    ├── plan.md                  # Development plan
    ├── implementation-checklist.md
    ├── open-questions.md
    ├── report-digest.md
    └── migration-log.md              # Architecture decisions
│
└── REPORTS/                     # Research and analysis reports
    └── RESEARCH_REVIEW.md       # API documentation alignment review
```

## 🎯 Documentation by Role

### For New Contributors
1. Start with [System Overview](./architecture-overview.md) for the big picture
2. Review [AGENTS.md](../AGENTS.md) for contribution guidelines
3. Check [STATUS.md](../STATUS.md) for current priorities
4. Read [Environment Setup](./environment.md) or [Codespaces Setup Guide](./CODESPACES_SETUP.md) to get your dev environment ready

### For Developers
1. [Architecture Map](./architecture.md) - Understand the technical design
2. [Testing Guide](./testing.md) - Test strategy and best practices
3. [Implementation Checklist](./implementation-checklist.md) - Track implementation progress
4. [Common Pitfalls](./ai/common-pitfalls.md) - Avoid known issues
5. [ADR-0001](./migration-log.md) - Understand key decisions

### For Operators
1. [Runbook](./runbook.md) - How to run and manage the bot
2. [Paper Trading Guide](./paper-trading.md) - Test safely before live trading
3. [Environment Setup](./environment.md) - Configuration and environment variables

### For AI Agents
1. [AGENTS.md](../AGENTS.md) - Your primary contract and guidelines
2. [Project Layout](./ai/project-layout.md) - Navigate the codebase
3. [Common Pitfalls](./ai/common-pitfalls.md) - Trading-specific gotchas
4. [Decision Trees](./ai/decision-trees.md) - Troubleshooting scenarios
5. [Session State](./ai/session-state.md) - Track your work

## 📝 Documentation Standards

### Documentation Maintenance

**All code changes MUST include documentation updates.** See [Development Workflow](./DEV_WORKFLOW.md) for detailed requirements.

### When to Update Documentation
- **Code changes**: Update relevant technical docs
- **New features**: Add to examples and update system overview
- **Environment variables**: Update .env.example, docs/environment.md, and docs/ENV_VARIABLE_REFERENCE.md
- **API endpoints**: Update README.md and docs/runbook.md
- **Architecture changes**: Update architecture docs and create ADRs
- **Operational changes**: Update runbook and environment guide
- **API changes**: Update examples and integration docs

### Documentation Style
- Use clear, concise language
- Include code examples where helpful
- Keep docs up-to-date with code changes (mandatory)
- Use markdown for formatting consistency
- Link to related documentation
- Test all code examples before committing

## 🔄 Automation

- **STATUS.md**: Automatically synced from GitHub Issues every 6 hours
- **CHANGELOG.md**: Manually updated on releases
- **AI Guides**: Updated as patterns emerge

## 📞 Getting Help

- **Issues**: Current and resolved issues are tracked in [STATUS.md](../STATUS.md)
- **Questions**: Check [Open Questions](./open-questions.md) or open a new issue
- **Decisions**: Review [ADR-0001](./migration-log.md) for rationale behind choices
