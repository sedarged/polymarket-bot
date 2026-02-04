# Documentation Index

Welcome to the Polymarket Trading Bot documentation. This index provides navigation to all project documentation.

## 📋 Quick Navigation

### Getting Started
- [README](../README.md) - Project overview, installation, and quick start
- [STATUS](../STATUS.md) - Current work status and priorities (auto-updated from Issues)
- [System Overview](./architecture-overview.md) - Plain language explanation of how the system works
- [Examples](./examples.md) - CLI usage examples and common patterns

### Security & Audits
- [Security Audit Report](../REPORTS/AUDIT.md) - Comprehensive security & reliability audit (27 findings)
- [Reports Index](../REPORTS/README.md) - All audit and analysis reports

### Development
- [AGENTS](../AGENTS.md) - Guidelines for AI agents working on this project
- [Automation Guide](./automation.md) - GitHub automation, CI/CD, and release management
- [Environment Setup](./environment.md) - Complete development environment and command reference
- [Master Development Plan](./master-plan.md) - Comprehensive task list and roadmap
- [Implementation Checklist](./implementation-checklist.md) - Detailed development checklist
- [Small PR Implementation Plan](./small-pr-plan.md) - Phased PR rollout with acceptance criteria
- [PR Execution Guide](./pr-execution-guide.md) - Step-by-step guide for executing PRs
- [PR Quick Reference](./pr-quick-reference.md) - One-page PR summary (print for reference)

### Architecture & Design
- [Architecture Map](./architecture.md) - Technical architecture documentation with critical paths
- [Architecture Decision Records (ADR)](./migration-log.md) - Key architectural decisions and rationale
- [Original PR Plan](./plan.md) - Original 10-PR rollout plan
- [Small PR Plan](./small-pr-plan.md) - Detailed 13-PR breakdown addressing audit fixes

### Operations
- [Runbook](./runbook.md) - Operational procedures for running the bot
- [Observability & Monitoring](./observability.md) - Metrics, dashboards, and alerting
- [Audit Trail](./audit-trail.md) - Order and fill history tracking for compliance
- [Persistence Layer](./persistence.md) - Database-backed state for production reliability
- [Error Taxonomy](./error-taxonomy.md) - Error classification and handling strategies
- [Environment Setup](./environment.md) - Complete development environment and command reference
- [Paper Trading Guide](./paper-trading.md) - Safe testing without real money
- [Report Digest](./report-digest.md) - Analysis summaries and findings

### AI & Automation
- [Project Layout](./ai/project-layout.md) - Repository structure and key files
- [Common Pitfalls](./ai/common-pitfalls.md) - Trading bot pitfalls and how to avoid them
- [Decision Trees](./ai/decision-trees.md) - Troubleshooting guides for common scenarios
- [Session State Template](./ai/session-state.md) - Template for agents to track work

### Reference
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
4. Read [Environment Setup](./environment.md) to get your dev environment ready

### For Developers
1. [Architecture Map](./architecture.md) - Understand the technical design
2. [Implementation Checklist](./implementation-checklist.md) - Track implementation progress
3. [Common Pitfalls](./ai/common-pitfalls.md) - Avoid known issues
4. [ADR-0001](./migration-log.md) - Understand key decisions

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

### When to Update Documentation
- **Code changes**: Update relevant technical docs
- **New features**: Add to examples and update system overview
- **Architecture changes**: Update architecture docs and create ADRs
- **Operational changes**: Update runbook and environment guide
- **API changes**: Update examples and integration docs

### Documentation Style
- Use clear, concise language
- Include code examples where helpful
- Keep docs up-to-date with code changes
- Use markdown for formatting consistency
- Link to related documentation

## 🔄 Automation

- **STATUS.md**: Automatically synced from GitHub Issues every 6 hours
- **CHANGELOG.md**: Manually updated on releases
- **AI Guides**: Updated as patterns emerge

## 📞 Getting Help

- **Issues**: Current and resolved issues are tracked in [STATUS.md](../STATUS.md)
- **Questions**: Check [Open Questions](./open-questions.md) or open a new issue
- **Decisions**: Review [ADR-0001](./migration-log.md) for rationale behind choices
