# ADR-0009: Categorized Logging with Pino

**Status:** Accepted  
**Date:** 2026-02-09  
**Deciders:** AI Agent (GitHub Copilot)  
**Issue:** #323

## Context

The project currently uses a basic custom logger (`apps/backend/src/utils/logger.ts`) that:
- Outputs JSON logs with timestamps and log levels
- Includes basic sensitive data masking (A-022)
- Lacks clear categorization making it difficult for users to filter and understand logs
- Has minimal structure and no transport configuration options

We need to enhance logging to be:
1. **User-friendly**: Readable and actionable for non-technical users
2. **Categorized**: Organized by clear categories (Order Flow, Market Data, Errors, Compliance, etc.)
3. **Transparent**: Shows full real data for debugging and operations
4. **Secure**: No sensitive data logged
5. **Performance-conscious**: Minimal overhead for trading operations

## Decision

We will adopt **Pino** as the logging library with the following configuration:

### Why Pino?

**Pino** was selected over Winston and Signale based on:

| Criteria | Pino | Winston | Signale |
|----------|------|---------|---------|
| **Performance** | ✅ Fastest (async, minimal overhead) | ⚠️ Moderate | ✅ Fast |
| **Structured Logging** | ✅ Native JSON | ⚠️ Optional | ❌ No |
| **TypeScript Support** | ✅ Built-in types | ✅ Good | ⚠️ Available |
| **Sensitive Data Redaction** | ✅ Built-in | ⚠️ Manual | ❌ No |
| **Production Ready** | ✅ Yes | ✅ Yes | ❌ Dev only |
| **Human-Readable Output** | ✅ pino-pretty | ✅ Built-in | ✅ Built-in |
| **Categorization** | ✅ Child loggers | ✅ Custom levels | ⚠️ Limited |
| **Ecosystem** | ✅ Large | ✅ Largest | ⚠️ Medium |

**Key advantages for a trading bot:**
- **Performance**: Trading systems need minimal logging overhead; Pino is the fastest
- **Structured logs**: JSON output integrates well with observability stacks (Prometheus, Grafana)
- **Built-in redaction**: Critical for protecting wallet addresses, API keys, private keys
- **Child loggers**: Perfect for implementing categories (orderFlow, marketData, compliance, etc.)
- **Pretty printing**: `pino-pretty` makes logs human-readable during development

### Implementation Approach

1. **Log Categories** (using Pino child loggers):
   - `orderFlow`: Order placement, cancellation, fills
   - `marketData`: Market updates, orderbook changes, price feeds
   - `compliance`: Trading gates, risk checks, kill switch events
   - `system`: Startup, shutdown, configuration, health checks
   - `websocket`: WebSocket connections, reconnects, subscriptions
   - `api`: API calls, rate limiting, circuit breakers
   - `learning`: ML/learning system events, backtesting
   - `error`: All errors and exceptions
   - `database`: Database operations, persistence
   - `audit`: Audit trail, compliance logging

2. **Log Levels**:
   - `fatal`: Unrecoverable errors requiring immediate action
   - `error`: Errors that need investigation
   - `warn`: Warnings and potential issues
   - `info`: Normal operational messages (default)
   - `debug`: Detailed debugging information
   - `trace`: Very detailed tracing (disabled by default)

3. **Sensitive Data Protection**:
   - Use Pino's `redact` option to mask:
     - `address`, `privateKey`, `private_key`
     - `secret`, `apiKey`, `api_key`, `token`, `password`
   - Apply across all categories automatically

4. **Output Formats**:
   - **Development**: Human-readable via `pino-pretty`
   - **Production**: Structured JSON for log aggregation
   - Environment variable `NODE_ENV` controls format

5. **Migration Strategy**:
   - Replace existing `logger` import with new Pino-based logger
   - Update all `logger.info()`, `logger.error()`, etc. calls to use categories
   - Maintain backward compatibility during transition

## Consequences

### Positive

- **Better Performance**: Pino's async logging won't slow down trading operations
- **Better Organization**: Categories make it easy to filter logs by domain
- **Better Security**: Built-in redaction reduces risk of leaked secrets
- **Better Observability**: Structured JSON integrates with monitoring tools
- **Better Developer Experience**: Pretty printing for local development
- **Better User Experience**: Clear categories and readable messages

### Negative

- **Migration Effort**: Need to update ~30 files that import logger
- **Learning Curve**: Team needs to learn Pino API and best practices
- **Dependency Addition**: Adds `pino` and `pino-pretty` as dependencies
- **Breaking Changes**: Log format changes may affect any existing log parsing

### Risks & Mitigations

**Risk**: Existing log parsing scripts break  
**Mitigation**: Document JSON schema, provide migration guide

**Risk**: Performance impact if misconfigured  
**Mitigation**: Use Pino's async mode, disable pretty printing in production

**Risk**: Logs become too verbose  
**Mitigation**: Default to `info` level, use environment variable for debug

## Alternatives Considered

### Winston
- **Pros**: More features, largest ecosystem, highly configurable
- **Cons**: Slower than Pino, more complex configuration
- **Why not chosen**: Performance is critical for trading; Pino's simplicity and speed are better fit

### Signale
- **Pros**: Beautiful developer experience, simple API
- **Cons**: Not production-ready, no structured logging, lacks features
- **Why not chosen**: Insufficient for production trading bot requirements

### Keep Custom Logger
- **Pros**: No new dependencies, full control
- **Cons**: Requires significant development effort to match Pino's features
- **Why not chosen**: Reinventing the wheel; Pino is battle-tested

## References

- [Pino Documentation](https://getpino.io/)
- [Pino vs Winston Comparison](https://betterstack.com/community/guides/scaling-nodejs/pino-vs-winston/)
- [Node.js Logging Best Practices](https://nareshit.com/blogs/nodejs-logging-best-practices-winston-morgan-pino)
- Issue #323: Implement User-Friendly, Categorized Logging
- Audit Finding A-022: Privacy - Mask sensitive data in logs

## Implementation Checklist

- [ ] Install pino and pino-pretty
- [ ] Create new logger utility with categories
- [ ] Update all imports across codebase
- [ ] Configure redaction for sensitive fields
- [ ] Add development pretty printing
- [ ] Update tests
- [ ] Document usage in README
- [ ] Verify Codespaces functionality
