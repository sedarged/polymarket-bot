## Data Pipeline (GAP-021)

This repo’s “data pipeline” is the path that takes **real-time market data** (WebSocket orderbook feed) and persists it into the **Learning System EventStore** for analytics, backtesting, and future strategy expansion.

### What’s implemented

- **Reliable ingestion**: `MarketFeedService` emits `snapshot`/`update` events; `DataPipelineService` buffers the latest orderbook per token and periodically flushes to the EventStore.
- **Scaling behavior**: buffering + periodic flush avoids writing on every WebSocket message; orderbook events can be truncated to top \(N\) levels.
- **Idempotent writes**: EventStore supports `dedupe_key` and `INSERT OR IGNORE` so retry/reflush does not create duplicates.
- **Monitoring**: Prometheus metrics track buffer size, flush duration, successes/failures, and written/deduped event counts.
- **Alerts**: sustained flush failures can trigger Telegram alerts (if configured).

### Data flow

1. `MarketFeedClient` receives WebSocket messages and updates an in-memory `OrderbookCache`.
2. `MarketFeedService` re-emits `snapshot` and `update` with the latest `Orderbook`.
3. `DataPipelineService` buffers the latest orderbook per `tokenId`.
4. On each flush interval:
   - Write a `MarketEvent` summary for each buffered market
   - Optionally write an `OrderBookUpdateEvent` (top \(N\) levels per side)
   - Use `dedupe_key` so retries are safe

### Operational endpoints

- **Admin-only** `GET /api/ingestion/status`: current pipeline status (buffer size, last success/failure, totals).
- **Metrics** `GET /metrics`: includes ingestion metrics (see below).

### Key environment variables

See `docs/ENV_VARIABLE_REFERENCE.md` and `.env.example` for the authoritative list. Common ones:

- `EVENT_STORE_PATH`: where events are persisted (SQLite).
- `DATA_PIPELINE_ENABLED`: enable/disable ingestion.
- `DATA_PIPELINE_FLUSH_INTERVAL_MS`: flush cadence.
- `DATA_PIPELINE_ORDERBOOK_LEVELS`: depth for stored orderbook levels.
- `DATA_PIPELINE_STORE_ORDERBOOK_EVENTS`: store full `OrderBookUpdateEvent` or just `MarketEvent`.

### Metrics

Defined in `apps/backend/src/utils/metrics.ts`:

- `polymarket_ingestion_events_total{pipeline,event_type,result,source}`
- `polymarket_ingestion_buffer_size{pipeline}`
- `polymarket_ingestion_last_success_timestamp_seconds{pipeline}`
- `polymarket_ingestion_last_failure_timestamp_seconds{pipeline}`
- `polymarket_ingestion_flush_duration_seconds_bucket{pipeline,...}`

### Failure handling & recovery

- Flush failures **do not drop data**: the latest buffered orderbooks are re-buffered and retried on the next flush.
- EventStore writes are protected by a **circuit breaker**; repeated failures open the breaker to avoid cascading failures.
- When Telegram alerting is configured, sustained flush failures generate warnings (deduped + rate-limited).

