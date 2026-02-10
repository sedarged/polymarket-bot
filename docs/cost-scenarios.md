# Cost scenarios (Research §3)

Rough monthly cost estimates for running the Polymarket bot. Aligned with Research §3.6.

| Scenario | VM | Monitoring | Storage | Gas | Total/month |
|----------|-----|------------|---------|-----|-------------|
| **A: Minimal (paper)** | $5 | $0 | $0 | $0 | **$5** |
| **B: Micro-live (20–50 USDC)** | $15 | $0 | $0 | $2–5 | **$17–20** |
| **C: Active small (50–200 USDC)** | $20 | $5 | $5 | $10–20 | **$40–60** (recommended) |
| **D: Production** | $80 | $30 | $20 | $50–100 | **$230–330** |

- **Infrastructure:** Single VM (e.g. AWS t3.small, Hetzner CX21). Production may use 2× instances for HA.
- **Monitoring:** Grafana Cloud free tier for MVP; paid or self-hosted for production.
- **Storage:** SQLite $0; managed Postgres ~$5–20.
- **Gas:** Polygon settlement; ~$0.01–0.02 per fill. Scale with trade count.

**Cost floor (Research):** ~$20–60/month infrastructure + $2–20/month gas for small capital (20–200 USDC).

See Research §3.1–§3.6 and the research report in [REPORTS](../REPORTS/) for full tables and assumptions.
