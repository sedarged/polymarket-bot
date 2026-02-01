# Project Layout

This guide provides a map of the repository structure to help you navigate the codebase efficiently.

## Repository Structure

```
polymarket-bot/
├── apps/
│   ├── backend/              # Node 20 + TypeScript backend
│   │   ├── src/
│   │   │   ├── index.ts      # Main entry point
│   │   │   ├── api/          # API clients (Gamma, CLOB)
│   │   │   ├── trading/      # Trading logic and strategies
│   │   │   ├── websocket/    # WebSocket connections and handlers
│   │   │   ├── orderbook/    # Order book management
│   │   │   ├── utils/        # Utility functions
│   │   │   └── types/        # TypeScript type definitions
│   │   ├── tests/            # Vitest test files
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── frontend/             # Frontend (minimal, upgradeable to Vite+React)
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/               # Shared code between apps
│       ├── src/
│       │   ├── types/        # Shared types
│       │   ├── constants/    # Shared constants
│       │   └── utils/        # Shared utilities
│       ├── package.json
│       └── tsconfig.json
│
├── docs/                     # Documentation
│   ├── README.md             # Documentation index (start here)
│   ├── ai/                   # AI agent guides (you are here)
│   ├── adr/                  # Architecture Decision Records
│   └── [various .md files]   # Technical and operational docs
│
├── .github/
│   ├── workflows/            # GitHub Actions workflows
│   │   ├── priority-label.yml
│   │   ├── status-sync.yml
│   │   └── codecov.yml
│   ├── ISSUE_TEMPLATE/       # Issue templates
│   │   └── task.yml
│   └── copilot-instructions.md
│
├── .env.example              # Environment variable template
├── package.json              # Root workspace configuration
├── tsconfig.base.json        # Shared TypeScript config
├── STATUS.md                 # Current work status (auto-synced)
├── AGENTS.md                 # AI agent contract
├── README.md                 # Project overview
└── CHANGELOG.md              # Release history
```

## Key Directories

### `/apps/backend/`
The main application code. This is where most development happens.

**Important files:**
- `src/index.ts` - Entry point, CLI commands
- `src/api/gamma.ts` - Gamma API client (markets data)
- `src/api/clob.ts` - CLOB API client (order book data)
- `src/websocket/manager.ts` - WebSocket connection management
- `src/orderbook/cache.ts` - In-memory order book cache
- `src/trading/` - Trading strategies and execution logic
- `src/utils/logger.ts` - Structured logging
- `src/utils/retry.ts` - Retry logic with exponential backoff

**Test files:**
- `tests/*.test.ts` - Unit tests (vitest)
- Test files mirror source structure

### `/packages/shared/`
Shared code used by both frontend and backend.

**Common files:**
- `src/types/` - Shared TypeScript interfaces
- `src/constants/` - API endpoints, configuration
- `src/utils/` - Shared utility functions

### `/docs/`
All documentation lives here or in the root.

**Navigation:**
- `docs/README.md` - Documentation index
- `docs/ai/` - Guides for AI agents (this directory)
- `docs/adr/` - Architecture Decision Records
- Root `.md` files - High-level docs (STATUS, AGENTS, README, CHANGELOG)

### `/.github/`
GitHub-specific configuration.

**Workflows:**
- `priority-label.yml` - Auto-labels issues by priority
- `status-sync.yml` - Syncs issues to STATUS.md
- `codecov.yml` - Code coverage reporting

**Templates:**
- `ISSUE_TEMPLATE/task.yml` - Issue form for tasks

## Important Files by Purpose

### Configuration
- `.env.example` - Environment variable template
- `package.json` - Workspace and dependency management
- `tsconfig.base.json` - Shared TypeScript configuration
- `apps/*/tsconfig.json` - App-specific TypeScript configs

### Documentation
- `README.md` - Project overview and quick start
- `STATUS.md` - Current work status (auto-updated)
- `AGENTS.md` - Guidelines for AI agents
- `CHANGELOG.md` - Release history
- `docs/README.md` - Full documentation index

### Development
- `MASTER_DEVELOPMENT_PLAN.md` - Comprehensive roadmap
- `docs/IMPLEMENTATION_CHECKLIST.md` - Implementation tasks
- `docs/PLAN.md` - PR rollout plan

### Technical Reference
- `SYSTEM_OVERVIEW.md` - System explanation
- `docs/ARCHITECTURE.md` - Technical architecture
- `docs/ADR-0001.md` - Architecture decisions
- `EXAMPLES.md` - Usage examples

### Operations
- `docs/RUNBOOK.md` - Operational procedures
- `docs/ENVIRONMENT.md` - Environment setup
- `docs/PAPER_TRADING.md` - Paper trading guide

## Common Tasks & Locations

### Adding a new API endpoint
1. Add types to `packages/shared/src/types/`
2. Add constants to `packages/shared/src/constants/`
3. Implement client in `apps/backend/src/api/`
4. Add tests in `apps/backend/tests/api/`
5. Update `docs/ARCHITECTURE.md` if significant

### Adding a trading strategy
1. Create module in `apps/backend/src/trading/strategies/`
2. Add types to `packages/shared/src/types/trading.ts`
3. Update `apps/backend/src/trading/index.ts`
4. Add tests in `apps/backend/tests/trading/`
5. Document in `docs/ARCHITECTURE.md`

### Adding WebSocket functionality
1. Update `apps/backend/src/websocket/manager.ts`
2. Add handlers in `apps/backend/src/websocket/handlers/`
3. Update reconnection logic if needed
4. Add tests in `apps/backend/tests/websocket/`
5. Update `docs/RUNBOOK.md` if affects operations

### Adding documentation
1. Determine category (getting started, development, architecture, operations)
2. Create or update file in `docs/`
3. Add link to `docs/README.md`
4. Update root `README.md` if high-level doc
5. Cross-reference from related docs

### Adding a workflow
1. Create YAML in `.github/workflows/`
2. Test with manual trigger first
3. Document in workflow comments
4. Update `docs/README.md` automation section

## Workspace Commands

### Root Level (affects all packages)
```bash
npm install          # Install all dependencies
npm run build        # Build all packages
npm test             # Run all tests
npm run lint         # Lint all packages
```

### App-Specific (run from root)
```bash
npm run dev          # Run backend in dev mode
npm run markets      # Fetch markets
npm run book         # Display order book
```

### Development (from app directories)
```bash
cd apps/backend
npm run dev          # Run with tsx watch mode
npm test             # Run vitest
npm run test:watch   # Run tests in watch mode
```

## Finding Code

### By Feature
- **Market data**: `apps/backend/src/api/gamma.ts`
- **Order books**: `apps/backend/src/api/clob.ts`, `apps/backend/src/orderbook/`
- **WebSocket**: `apps/backend/src/websocket/`
- **Trading**: `apps/backend/src/trading/`
- **CLI**: `apps/backend/src/index.ts`

### By Concern
- **Error handling**: `apps/backend/src/utils/retry.ts`, error boundaries in API clients
- **Logging**: `apps/backend/src/utils/logger.ts`
- **Configuration**: `.env.example`, `packages/shared/src/constants/`
- **Types**: `packages/shared/src/types/`, `apps/backend/src/types/`
- **Tests**: `apps/backend/tests/` (mirrors src structure)

## Navigation Tips

1. **Start with the docs index**: `docs/README.md` links to everything
2. **Check STATUS.md**: See what's currently being worked on
3. **Read AGENTS.md**: Understand the contract for AI agents
4. **Follow imports**: TypeScript imports show dependencies clearly
5. **Mirror structure**: Tests mirror src structure for easy navigation
6. **Use search**: `grep` or IDE search for keywords
7. **Check ADRs**: Architecture Decision Records explain "why"

## Monorepo Structure

This is an **npm workspaces** monorepo:
- Root `package.json` defines workspaces
- Each app/package has its own `package.json`
- Shared dependencies hoisted to root `node_modules/`
- Workspace packages can reference each other
- Build order managed automatically

## Next Steps

- [Common Pitfalls](./common-pitfalls.md) - Avoid known issues
- [Decision Trees](./decision-trees.md) - Troubleshooting guides
- [Session State](./session-state.md) - Track your work
