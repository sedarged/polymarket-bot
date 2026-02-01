# Copilot Instructions — Polymarket bot

## Quick Start
**ALWAYS read these first:**
- [AGENTS.md](../AGENTS.md) - Your complete contract and guidelines
- [STATUS.md](../STATUS.md) - Current work priorities
- [docs/README.md](../docs/README.md) - Documentation index
- [docs/ai/](../docs/ai/) - AI-specific guides (project layout, pitfalls, decision trees)

## Project Structure
Monorepo (npm workspaces):
- `apps/backend` - Node 20 + TypeScript, tsx, vitest
- `apps/frontend` - Minimal TS (upgradable to Vite+React)
- `packages/shared` - Shared code
- `docs/` - All documentation
- `docs/ai/` - AI agent guides

## Essential Commands (must keep working)
```bash
npm install          # Install dependencies
npm run dev         # Run backend
npm run markets     # Fetch markets
npm run book        # Display order book
npm test            # Run all tests
```

## Hard Rules (Non-Negotiable)
1. **Compliance**: NO VPN/proxy/geo-bypass. Respect geoblocking/ToS.
2. **Default mode**: PAPER trading only
3. **Live trading gate**: Requires BOTH `LIVE_TRADING=true` AND `COMPLIANCE_ACCEPTED=true`
4. **Secrets**: Never commit. Use `.env` + `.env.example`. Frontend must never receive secrets.
5. **Reliability**: WebSocket reconnect + resync, idempotency, startup reconciliation, circuit breakers
6. **Testing**: PR complete only when `npm test` passes

## Code Style
- TypeScript strict mode
- Small, focused modules with clear names
- Structured logging (not console.log)
- Comprehensive error handling
- Document decisions in `/docs/adr/`

## Detailed Guidance
For comprehensive information, see:
- [Common Pitfalls](../docs/ai/common-pitfalls.md) - Trading bot gotchas
- [Decision Trees](../docs/ai/decision-trees.md) - Troubleshooting scenarios
- [Project Layout](../docs/ai/project-layout.md) - Repository navigation
- [Architecture](../docs/ARCHITECTURE.md) - Technical details
- [Runbook](../docs/RUNBOOK.md) - Operations manual
