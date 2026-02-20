# Configuration Management Interface (GAP-003)

**Status:** ✅ Implemented  
**Issue:** #394  
**Component:** `apps/backend/src/config/configManager.ts`

## Overview

The Configuration Management Interface provides a comprehensive solution for managing bot configuration at runtime without requiring restarts. It supports CRUD operations, hot-reload capabilities, file watching, and validation against schemas.

## Features

### Core Capabilities

1. **CRUD Operations**: Create, Read, Update, and Delete configuration files
2. **Runtime Reload**: Apply configuration changes without bot restart
3. **Schema Validation**: Validate configuration against Zod schemas before applying
4. **Hot-Reload**: Automatic configuration reload when files change
5. **File Watching**: Monitor configuration files for changes
6. **Event-Driven**: Emit events on configuration changes for reactive updates
7. **Atomic Operations**: Thread-safe file operations using temp files and rename
8. **Debouncing**: Prevent excessive reloads during rapid file changes

### Supported Configuration Types

- **Markets Configuration** (`markets.json`): Per-market trading parameters
- **Strategy Configuration** (`strategy.json`): Strategy-specific parameters
- **Environment Variables** (`.env`): System configuration

## Architecture

### ConfigManager (Singleton)

The `ConfigManager` class is the central component implementing configuration management:

```typescript
import { ConfigManager } from './config/configManager';

const configManager = ConfigManager.getInstance();
```

### Event System

ConfigManager extends `EventEmitter` and provides the following events:

| Event | Description | Payload |
|-------|-------------|---------|
| `configReloading` | Emitted before config reload | New config object |
| `configChanged` | Emitted after successful reload | Updated config object |
| `configError` | Emitted on reload failure | Error object |
| `fileChanged` | Emitted when watched file changes | `{ path: string, type: string }` |
| `watchingStarted` | Emitted when file watching starts | None |
| `watchingStopped` | Emitted when file watching stops | None |

## API Reference

### Configuration Access

#### `getConfig(): Config`

Get the current configuration (returns a copy).

```typescript
const config = configManager.getConfig();
console.log(config.liveTrading, config.tokenIds);
```

#### `getConfigFile(type: 'markets' | 'strategy'): Promise<ConfigFile | null>`

Get a specific configuration file with metadata.

```typescript
const marketsConfig = await configManager.getConfigFile('markets');
if (marketsConfig) {
  console.log('Path:', marketsConfig.path);
  console.log('Content:', marketsConfig.content);
  console.log('Last Modified:', marketsConfig.lastModified);
}
```

### Configuration Updates

#### `updateConfigFile(type, content): Promise<ConfigUpdateResult>`

Update a configuration file with validation.

```typescript
const newMarkets = [
  { tokenId: 'token-123', maxPositionSize: 1000, spread: 0.02 },
  { tokenId: 'token-456', maxPositionSize: 500 },
];

const result = await configManager.updateConfigFile('markets', newMarkets);
if (result.success) {
  console.log('Configuration updated successfully');
} else {
  console.error('Validation errors:', result.errors);
}
```

#### `deleteConfigFile(type): Promise<ConfigUpdateResult>`

Delete a configuration file.

```typescript
const result = await configManager.deleteConfigFile('markets');
if (result.success) {
  console.log('Configuration deleted');
}
```

### Validation

#### `validateConfig(type, content): ConfigUpdateResult`

Validate configuration without saving.

```typescript
const testConfig = [
  { tokenId: 'test', maxPositionSize: -100 }, // Invalid
];

const result = configManager.validateConfig('markets', testConfig);
if (!result.success) {
  console.error('Validation errors:', result.errors);
}
```

### Reload Operations

#### `reloadConfig(): Promise<void>`

Manually trigger configuration reload.

```typescript
await configManager.reloadConfig();
console.log('Configuration reloaded');
```

### File Watching

#### `startWatching(): Promise<void>`

Start watching configuration files for changes.

```typescript
configManager.on('configChanged', (newConfig) => {
  console.log('Configuration updated:', newConfig);
});

await configManager.startWatching();
```

#### `stopWatching(): Promise<void>`

Stop watching configuration files.

```typescript
await configManager.stopWatching();
```

#### `isWatchingActive(): boolean`

Check if file watching is active.

```typescript
if (configManager.isWatchingActive()) {
  console.log('Watching is active');
}
```

## REST API Endpoints

All configuration endpoints require admin authentication (`ADMIN_TOKEN` in `Authorization` header).

### Base URL

All endpoints are prefixed with `/api/config`.

### Endpoints

#### GET `/api/config`

Get current configuration (sensitive values masked).

**Response:**
```json
{
  "success": true,
  "data": {
    "liveTrading": false,
    "tokenIds": ["token-1", "token-2"],
    "markets": [...],
    "strategy": {...},
    "privateKey": "***REDACTED***"
  }
}
```

#### GET `/api/config/:type`

Get specific configuration file (`:type` = `markets` or `strategy`).

**Example:** `GET /api/config/markets`

**Response:**
```json
{
  "success": true,
  "data": {
    "path": "/path/to/markets.json",
    "type": "markets",
    "content": [
      { "tokenId": "token-1", "maxPositionSize": 1000 }
    ],
    "lastModified": "2026-02-17T12:00:00.000Z"
  }
}
```

#### PUT `/api/config/:type`

Update specific configuration file.

**Request Body:**
```json
[
  { "tokenId": "token-1", "maxPositionSize": 2000, "spread": 0.01 }
]
```

**Response:**
```json
{
  "success": true,
  "message": "Configuration file updated successfully: /path/to/markets.json"
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Validation failed for markets configuration",
  "errors": [
    "0.tokenId: Token ID cannot be empty",
    "0.maxPositionSize: Expected positive number"
  ]
}
```

#### DELETE `/api/config/:type`

Delete specific configuration file.

**Response:**
```json
{
  "success": true,
  "message": "Configuration file deleted successfully"
}
```

#### POST `/api/config/validate/:type`

Validate configuration without saving.

**Request Body:**
```json
{
  "spread": 0.02,
  "maxPositionSize": 500,
  "inventorySkew": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Configuration is valid"
}
```

#### POST `/api/config/reload`

Manually trigger configuration reload.

**Response:**
```json
{
  "success": true,
  "message": "Configuration reloaded successfully"
}
```

#### GET `/api/config/watching`

Get file watching status.

**Response:**
```json
{
  "success": true,
  "data": { "watching": true }
}
```

#### POST `/api/config/watching/start`

Start file watching.

**Response:**
```json
{
  "success": true,
  "message": "File watching started successfully"
}
```

#### POST `/api/config/watching/stop`

Stop file watching.

**Response:**
```json
{
  "success": true,
  "message": "File watching stopped successfully"
}
```

## Configuration Schemas

### Markets Configuration

```typescript
interface MarketConfigEntry {
  tokenId: string;              // Required, non-empty
  maxPositionSize?: number;     // Optional, must be positive
  spread?: number;              // Optional, 0-1 range
}

// File format: Array of MarketConfigEntry
```

**Example `markets.json`:**
```json
[
  {
    "tokenId": "0x123abc...",
    "maxPositionSize": 1000,
    "spread": 0.02
  },
  {
    "tokenId": "0x456def...",
    "maxPositionSize": 500
  }
]
```

### Strategy Configuration

```typescript
interface StrategyConfigEntry {
  spread?: number;              // Optional, 0-1 range
  maxPositionSize?: number;     // Optional, must be positive
  inventorySkew?: boolean;      // Optional
}

// File format: Single StrategyConfigEntry object
```

**Example `strategy.json`:**
```json
{
  "spread": 0.015,
  "maxPositionSize": 2000,
  "inventorySkew": true
}
```

## Per-Market Configuration Usage (GAP-001)

### Risk Manager Integration

The `maxPositionSize` field in markets configuration is automatically applied by the RiskManager to enforce per-market position limits. This allows you to set different position limits for different markets without code changes.

**How it works:**

1. **Loading**: When `MARKETS_CONFIG_PATH` is set, the bot loads markets.json at startup
2. **Integration**: The markets config is passed to RiskManager during initialization
3. **Order Validation**: For each order, RiskManager checks:
   - If the market has a specific `maxPositionSize` configured, use that limit
   - Otherwise, fall back to the global `RISK_MAX_EXPOSURE_PER_MARKET` limit
4. **Hot-Reload**: RiskManager provides an `updateMarkets()` method to apply new limits when markets.json changes (to be wired with ConfigManager's `configChanged` event in future work)

**Example:**

```typescript
// Global limit (via .env)
RISK_MAX_EXPOSURE_PER_MARKET=1000

// markets.json
[
  {
    "tokenId": "0xhighVolatility",
    "maxPositionSize": 500  // Lower limit for risky market
  },
  {
    "tokenId": "0xlowVolatility",
    "maxPositionSize": 2000  // Higher limit for stable market
  }
  // Markets without specific config use global limit of 1000
]
```

**Result:**
- Orders for `0xhighVolatility` are limited to 500 units
- Orders for `0xlowVolatility` are limited to 2000 units
- Orders for other markets are limited to 1000 units (global default)

### Strategy Integration

The `spread` field in markets configuration is available for strategy implementations but is not automatically enforced. Strategies can access per-market spread values through the markets config to customize their behavior per market.

**Note:** Strategy integration for per-market spread is implementation-specific and depends on your strategy design.

## Usage Examples

### Example 1: Basic Setup with File Watching

```typescript
import { ConfigManager } from './config/configManager';

const configManager = ConfigManager.getInstance();

// Listen for configuration changes
configManager.on('configChanged', (newConfig) => {
  console.log('Configuration updated!');
  console.log('Token IDs:', newConfig.tokenIds);
  console.log('Live Trading:', newConfig.liveTrading);
});

// Listen for errors
configManager.on('configError', (error) => {
  console.error('Configuration error:', error);
});

// Start watching for file changes
await configManager.startWatching();
```

### Example 2: Programmatic Configuration Update

```typescript
// Update markets configuration
const newMarkets = [
  { tokenId: 'token-1', maxPositionSize: 1500, spread: 0.01 },
  { tokenId: 'token-2', maxPositionSize: 800, spread: 0.015 },
];

const result = await configManager.updateConfigFile('markets', newMarkets);

if (result.success) {
  console.log('Markets configuration updated');
  // Configuration is automatically reloaded
} else {
  console.error('Update failed:', result.message);
  console.error('Errors:', result.errors);
}
```

### Example 3: Validation Before Update

```typescript
// Validate configuration before applying
const proposedConfig = {
  spread: 0.5,
  maxPositionSize: 10000,
  inventorySkew: false,
};

const validation = configManager.validateConfig('strategy', proposedConfig);

if (validation.success) {
  // Safe to update
  await configManager.updateConfigFile('strategy', proposedConfig);
} else {
  console.error('Invalid configuration:', validation.errors);
}
```

### Example 4: Manual Reload

```typescript
// Manually reload configuration (e.g., after external changes)
try {
  await configManager.reloadConfig();
  console.log('Configuration reloaded successfully');
} catch (error) {
  console.error('Failed to reload configuration:', error);
}
```

### Example 5: REST API Usage

```bash
# Get current configuration
# Replace <your-admin-token> with your actual ADMIN_TOKEN value
curl -H "Authorization: Bearer <your-admin-token>" \
  http://localhost:3000/api/config

# Update markets configuration
curl -X PUT \
  -H "Authorization: Bearer <your-admin-token>" \
  -H "Content-Type: application/json" \
  -d '[{"tokenId":"token-1","maxPositionSize":1000}]' \
  http://localhost:3000/api/config/markets

# Start file watching
curl -X POST \
  -H "Authorization: Bearer <your-admin-token>" \
  http://localhost:3000/api/config/watching/start

# Validate configuration
curl -X POST \
  -H "Authorization: Bearer <your-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"spread":0.02,"maxPositionSize":500}' \
  http://localhost:3000/api/config/validate/strategy
```

## Environment Variables

The following environment variables control configuration file paths:

```bash
# Path to markets configuration file
MARKETS_CONFIG_PATH=./config/markets.json

# Path to strategy configuration file
STRATEGY_CONFIG_PATH=./config/strategy.json
```

Both paths can be absolute or relative to `process.cwd()`.

## Implementation Details

### Atomic File Operations

Configuration updates use atomic write operations to prevent corruption:

1. Write to temporary file (`config.json.tmp`)
2. Rename temp file to target file (atomic operation)
3. Clean up on success or failure

### Debouncing

File change events are debounced with a 500ms delay to prevent excessive reloads during rapid file modifications (e.g., editor auto-save).

### Concurrency Control

- Singleton pattern ensures single ConfigManager instance
- Write operations are serialized using a mutex to prevent concurrent modifications
- Atomic file writes using temp files prevent partial reads
- Event-driven architecture for coordinated state updates

### Error Handling

- Invalid JSON is logged but doesn't crash the system
- Validation errors prevent invalid config from being applied
- Old configuration remains active if reload fails
- Errors are emitted as events for application-level handling

## Testing

### Unit Tests

Located in `apps/backend/tests/unit/configManager.test.ts`:

- ✅ CRUD operations
- ✅ Validation against schemas
- ✅ Error handling
- ✅ Event emission
- ✅ Atomic file operations

### Integration Tests

Located in `apps/backend/tests/integration/configHotReload.test.ts`:

- ✅ File change detection
- ✅ Automatic reload on file changes
- ✅ Debouncing of rapid changes
- ✅ Watching multiple files
- ✅ Error recovery
- ✅ Event ordering

### Running Tests

```bash
# Run all tests
npm test

# Run only config tests
npm test configManager
npm test configHotReload

# Run with coverage
npm run test:coverage
```

## Security Considerations

1. **Admin Authentication**: All API endpoints require `ADMIN_TOKEN`
2. **Sensitive Data Masking**: Secrets are masked in API responses
3. **Validation**: All updates are validated before applying
4. **File Permissions**: Config files should have restricted permissions (600 or 640)
5. **Path Traversal**: Paths are resolved safely using `path.resolve()`

## Operational Procedures

### Starting with File Watching

```typescript
import { startServer } from './server';
import { ConfigManager } from './config/configManager';

// Start server
const server = await startServer();

// Enable configuration hot-reload
const configManager = ConfigManager.getInstance();
await configManager.startWatching();

console.log('Server running with configuration hot-reload enabled');
```

### Graceful Shutdown

```typescript
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  
  // Stop configuration watching
  const configManager = ConfigManager.getInstance();
  await configManager.destroy();
  
  // Other cleanup...
  process.exit(0);
});
```

### Monitoring Configuration Changes

```typescript
import { logger } from './utils/logger';

const configManager = ConfigManager.getInstance();

configManager.on('configChanged', (newConfig) => {
  logger.info('Configuration changed', {
    category: 'config',
    tokenCount: newConfig.tokenIds.length,
    hasMarkets: !!newConfig.markets,
    hasStrategy: !!newConfig.strategy,
  });
});

configManager.on('configError', (error) => {
  logger.error('Configuration error', {
    category: 'config',
    error: error instanceof Error ? error.message : String(error),
  });
});
```

## Troubleshooting

### Configuration Not Reloading

**Symptom:** File changes aren't triggering reloads

**Solutions:**
- Verify file watching is started: `configManager.isWatchingActive()`
- Check environment variables are set: `MARKETS_CONFIG_PATH`, `STRATEGY_CONFIG_PATH`
- Ensure files exist and are readable
- Check logs for watcher errors

### Validation Errors

**Symptom:** Updates fail with validation errors

**Solutions:**
- Use `validateConfig()` to test configuration before updating
- Check schema requirements (see Configuration Schemas section)
- Ensure numeric values are in valid ranges
- Verify token IDs are non-empty strings

### Permission Errors

**Symptom:** Cannot write configuration files

**Solutions:**
- Check file/directory permissions
- Ensure bot process has write access to config directory
- Verify `MARKETS_CONFIG_PATH` and `STRATEGY_CONFIG_PATH` point to writable locations

### Memory Leaks

**Symptom:** Memory usage grows over time

**Solutions:**
- Call `configManager.destroy()` on shutdown
- Remove event listeners when no longer needed
- Ensure file watchers are properly closed

## Future Enhancements

Potential improvements for future versions:

1. **Validation Webhooks**: Call external API for custom validation
2. **Configuration History**: Track changes with rollback capability
3. **Distributed Configuration**: Support for distributed config stores (etcd, Consul)
4. **Configuration Encryption**: Encrypt sensitive config values at rest
5. **Rate Limiting**: Limit configuration update frequency
6. **Change Approval**: Require approval before applying critical changes
7. **A/B Testing**: Support for configuration experiments

## Related Documentation

- [Environment Setup](./environment.md) - Environment variable configuration
- [API Documentation](./architecture.md) - API architecture and design
- [Security Guide](./security.md) - Security best practices
- [Runbook](./runbook.md) - Operational procedures

## References

- **Issue:** #394 - [GAP-003] Implement Configuration Management Interface
- **Gap Analysis:** REPORTS/GAP_ANALYSIS.md
- **Code:** `apps/backend/src/config/configManager.ts`
- **API Handlers:** `apps/backend/src/server/configApiHandlers.ts`
- **Tests:** `apps/backend/tests/unit/configManager.test.ts`, `apps/backend/tests/integration/configHotReload.test.ts`
