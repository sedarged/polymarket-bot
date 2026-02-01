# Open Questions

1. **(P0, Owner: TBD)** Which Polymarket API base URLs and versions should be treated as canonical for production vs. sandbox usage?
2. **(P0, Owner: TBD)** What are the confirmed rate limits for REST and WS endpoints in production?
3. **(P0, Owner: TBD)** Is there an official testnet or sandbox environment for order placement and settlement?
4. **(P1, Owner: TBD)** What is the preferred persistence layer (SQLite vs. Postgres vs. file-based state)?
5. **(P1, Owner: TBD)** Which markets are in-scope for the initial deployment (IDs, categories, liquidity thresholds)?
6. **(P0, Owner: TBD)** How should the bot verify and enforce geo restrictions (IP-based vs. account flags only)?
7. **(P2, Owner: TBD)** What operational alerting channel(s) should be integrated first (Slack, Discord, Telegram)?
8. **(P0, Owner: TBD)** Are there any mandatory compliance checks beyond cert-required and geo restrictions?
9. **(P1, Owner: TBD)** Should the bot support automated redemption of winning shares, and via which API?
10. **(P0, Owner: TBD)** What is the acceptable risk budget for drawdown limits (percentage and absolute)?
11. **(P1, Owner: TBD)** How should we handle on-chain gas management (prioritize low gas or time-sensitive orders)?
12. **(P2, Owner: TBD)** Are maker rebates relevant to the chosen markets, and how should they be accounted for in PnL?
