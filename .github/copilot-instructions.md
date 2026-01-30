# Copilot Instructions — Polymarket bot

## Project
Monorepo (npm workspaces):
- apps/backend (Node 20 + TypeScript, tsx, vitest)
- apps/frontend (currently minimal TS; you may upgrade to Vite+React if needed)
- packages/shared

## Commands (must keep working)
- npm install
- npm run dev
- npm run markets
- npm run book
- npm test

## Hard rules (non-negotiable)
1) Compliance: DO NOT implement VPN/proxy/geo-bypass. Respect geoblocking/ToS.
2) Default mode: PAPER trading only.
3) Live trading must be gated by BOTH:
   - LIVE_TRADING=true
   - COMPLIANCE_ACCEPTED=true
   If not set: refuse any order placement (fail closed).
4) Secrets: never commit secrets. Use .env + .env.example. Frontend must never receive secrets.
5) Reliability: WebSocket reconnect + resync, idempotency, startup reconciliation, circuit breakers, kill switch.
6) Testing: PR is only done when `npm test` passes.

## Style
- TypeScript strict
- Small modules, clear names, structured logging
- Prefer official Polymarket docs and record conflicts in /docs/ADR-*.md
