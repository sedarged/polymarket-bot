# Documentation Index

Welcome to the Polymarket Trading Bot documentation. This index provides navigation to all project documentation.

## 📋 Quick Navigation

### Getting Started
- [README](../README.md) - Project overview, installation, and quick start
- [STATUS](../STATUS.md) - Current work status and priorities (auto-updated from Issues)
- [System Overview](../SYSTEM_OVERVIEW.md) - Plain language explanation of how the system works
- [Examples](../EXAMPLES.md) - CLI usage examples and common patterns

### Development
- [AGENTS](../AGENTS.md) - Guidelines for AI agents working on this project
- [Environment Setup](./ENVIRONMENT.md) - Complete development environment and command reference
- [Master Development Plan](../MASTER_DEVELOPMENT_PLAN.md) - Comprehensive task list and roadmap
- [Implementation Checklist](./IMPLEMENTATION_CHECKLIST.md) - Detailed development checklist

### Architecture & Design
- [Architecture Map](./ARCHITECTURE.md) - Technical architecture documentation with critical paths
- [Architecture Decision Records (ADR)](./ADR-0001.md) - Key architectural decisions and rationale
- [Plan](./PLAN.md) - PR rollout plan and phased development strategy

### Operations
- [Runbook](./RUNBOOK.md) - Operational procedures for running the bot
- [Paper Trading Guide](./PAPER_TRADING.md) - Safe testing without real money
- [Report Digest](./REPORT_DIGEST.md) - Analysis summaries and findings

### AI & Automation
- [Project Layout](./ai/project-layout.md) - Repository structure and key files
- [Common Pitfalls](./ai/common-pitfalls.md) - Trading bot pitfalls and how to avoid them
- [Decision Trees](./ai/decision-trees.md) - Troubleshooting guides for common scenarios
- [Session State Template](./ai/session-state.md) - Template for agents to track work

### Reference
- [CHANGELOG](../CHANGELOG.md) - Release history and notable changes
- [Open Questions](./OPEN_QUESTIONS.md) - Unresolved questions and discussions

## 📂 Documentation Structure

```
polymarket-bot/
├── README.md                    # Project overview
├── STATUS.md                    # Current work status (auto-synced)
├── AGENTS.md                    # AI agent guidelines
├── CHANGELOG.md                 # Release history
├── SYSTEM_OVERVIEW.md           # System explanation (start here!)
├── EXAMPLES.md                  # Usage examples
├── MASTER_DEVELOPMENT_PLAN.md   # Development roadmap
├── PODSUMOWANIE.md              # Polish summary
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
    ├── ARCHITECTURE.md          # Technical architecture
    ├── ENVIRONMENT.md           # Development environment
    ├── RUNBOOK.md               # Operations manual
    ├── PAPER_TRADING.md         # Paper trading guide
    ├── PLAN.md                  # Development plan
    ├── IMPLEMENTATION_CHECKLIST.md
    ├── OPEN_QUESTIONS.md
    ├── REPORT_DIGEST.md
    └── ADR-0001.md              # Architecture decisions
```

## 🎯 Documentation by Role

### For New Contributors
1. Start with [System Overview](../SYSTEM_OVERVIEW.md) for the big picture
2. Review [AGENTS.md](../AGENTS.md) for contribution guidelines
3. Check [STATUS.md](../STATUS.md) for current priorities
4. Read [Environment Setup](./ENVIRONMENT.md) to get your dev environment ready

### For Developers
1. [Architecture Map](./ARCHITECTURE.md) - Understand the technical design
2. [Implementation Checklist](./IMPLEMENTATION_CHECKLIST.md) - Track implementation progress
3. [Common Pitfalls](./ai/common-pitfalls.md) - Avoid known issues
4. [ADR-0001](./ADR-0001.md) - Understand key decisions

### For Operators
1. [Runbook](./RUNBOOK.md) - How to run and manage the bot
2. [Paper Trading Guide](./PAPER_TRADING.md) - Test safely before live trading
3. [Environment Setup](./ENVIRONMENT.md) - Configuration and environment variables

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
- **Questions**: Check [Open Questions](./OPEN_QUESTIONS.md) or open a new issue
- **Decisions**: Review [ADR-0001](./ADR-0001.md) for rationale behind choices
