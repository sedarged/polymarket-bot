import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { validatePrivateKey } from "../secrets";
import { logger } from "../utils/logger";

dotenv.config();

/** Per-market config from config/markets.json (Research §6.1, §8 Copilot 13) */
export interface MarketConfigEntry {
  tokenId: string;
  maxPositionSize?: number;
  spread?: number;
}

/** Strategy params from config/strategy.json (Research §6.1). Loaded when STRATEGY_CONFIG_PATH is set. */
export interface StrategyConfigEntry {
  spread?: number;
  maxPositionSize?: number;
  inventorySkew?: boolean;
}

const booleanFromEnv = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return value;
}, z.boolean());

const numberFromEnv = (defaultValue: number, schema: z.ZodNumber) => {
  const numberSchema = schema.refine((value) => Number.isFinite(value), {
    message: "Expected a finite number",
  });
  return z
    .preprocess((value) => {
      if (value === undefined || value === null || value === "") {
        return undefined;
      }
      if (typeof value === "number") {
        return value;
      }
      if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? value : parsed;
      }
      return value;
    }, numberSchema)
    .default(defaultValue);
};

/**
 * Helper function to preprocess optional string values from environment variables.
 * Converts empty strings and null values to undefined, allowing Zod's .optional() to work correctly.
 *
 * @param schema - The Zod schema to apply after preprocessing
 * @returns A preprocessed Zod schema that treats empty strings as undefined
 */
const optionalStringFromEnv = <T extends z.ZodTypeAny>(schema: T) => {
  return z.preprocess((value) => {
    // Convert empty string or null to undefined
    if (value === "" || value === null) {
      return undefined;
    }
    return value;
  }, schema);
};

const envSchema = z.object({
  GAMMA_API_URL: z.string().url().default("https://gamma-api.polymarket.com"),
  CLOB_API_URL: z.string().url().default("https://clob.polymarket.com"),
  WS_MARKET_URL: z
    .string()
    .url()
    .default("wss://ws-subscriptions-clob.polymarket.com/ws/market"),
  TOKEN_IDS: z.string().default(""),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  RETRY_ATTEMPTS: numberFromEnv(3, z.number().int().positive()),
  RETRY_DELAY: numberFromEnv(1000, z.number().int().nonnegative()),
  // Audit Finding A-009: Add overall timeout cap for retry operations
  // Default: 5 minutes (300000ms) to prevent unbounded retry duration
  RETRY_TOTAL_TIMEOUT: numberFromEnv(300000, z.number().int().positive()),
  LIVE_TRADING: booleanFromEnv.default(false),
  COMPLIANCE_ACCEPTED: booleanFromEnv.default(false),
  PORT: numberFromEnv(3000, z.number().int().positive()),
  // Metrics server port (Research §7 Day 6, §9.1). When different from PORT, a dedicated HTTP server
  // serves GET /metrics on this port. Set to same as PORT for single-port mode (metrics on main server).
  METRICS_PORT: numberFromEnv(9090, z.number().int().positive()),
  // Learning system database paths (also used by data pipeline)
  EVENT_STORE_PATH: z.string().default("./data/events.db"),
  // Trading credentials (optional - only required for live trading)
  // Private key must be 64 hex characters (optionally prefixed with 0x)
  // Addresses Audit Finding A-024: Private key format validation
  PRIVATE_KEY: optionalStringFromEnv(
    z
      .string()
      .optional()
      .refine((key) => !key || validatePrivateKey(key), {
        message:
          "PRIVATE_KEY must be 64 hexadecimal characters (optionally prefixed with 0x)",
      }),
  ),
  // Secret Management Configuration (Audit Finding A-001)
  // SECRET_SOURCE: 'env' (default), 'encrypted', 'aws', 'vault', 'azure'
  SECRET_SOURCE: z
    .enum(["env", "encrypted", "aws", "vault", "azure"])
    .default("env"),
  // For encrypted source
  ENCRYPTION_KEY: z.string().optional(),
  ENCRYPTED_PRIVATE_KEY: z.string().optional(),
  // For AWS source
  AWS_SECRET_NAME: z.string().optional(),
  AWS_REGION: z.string().optional(),
  // For Vault source
  VAULT_ADDR: z.string().optional(),
  VAULT_TOKEN: z.string().optional(),
  VAULT_PATH: z.string().optional(),
  // For Azure source
  AZURE_KEY_VAULT_NAME: z.string().optional(),
  AZURE_SECRET_NAME: z.string().optional(),
  // Chain ID: 137 = Polygon Mainnet, 80002 = Polygon Amoy Testnet
  // WARNING: Only Polygon Mainnet (137) is officially supported for live trading
  CHAIN_ID: numberFromEnv(137, z.number().int().positive()),
  // Paper Trading Configuration
  PAPER_TRADING_SLIPPAGE: numberFromEnv(0.01, z.number().nonnegative().max(1)),
  PAPER_TRADING_MAX_SLIPPAGE: numberFromEnv(
    0.05,
    z.number().nonnegative().max(1),
  ),
  PAPER_TRADING_FEE_RATE: numberFromEnv(0.002, z.number().nonnegative().max(1)),
  // Partial Fill Configuration
  PAPER_TRADING_PARTIAL_FILL_RATE: numberFromEnv(
    0.0,
    z.number().nonnegative().max(1),
  ),
  PAPER_TRADING_MIN_FILL_RATIO: numberFromEnv(
    0.1,
    z.number().nonnegative().max(1),
  ),
  PAPER_TRADING_MAX_FILL_RATIO: numberFromEnv(
    0.9,
    z.number().nonnegative().max(1),
  ),
  // Risk Management Configuration
  RISK_MAX_EXPOSURE_PER_MARKET: numberFromEnv(1000, z.number().positive()),
  RISK_MAX_OPEN_ORDERS: numberFromEnv(50, z.number().int().positive()),
  RISK_MAX_DRAWDOWN: numberFromEnv(0.2, z.number().positive().max(1)),
  RISK_ERROR_RATE_THRESHOLD: numberFromEnv(
    0.1,
    z.number().nonnegative().max(1),
  ),
  RISK_ERROR_RATE_WINDOW: numberFromEnv(100, z.number().int().positive()),
  // Maximum fee rate in basis points (GAP-019)
  // Default: 50 bps (0.5%) - Protects against excessive trading costs
  // Example: 50 bps = 0.5%, 100 bps = 1.0%
  RISK_MAX_FEE_RATE_BPS: numberFromEnv(50, z.number().nonnegative().max(10000)),
  // Circuit Breaker Configuration (Audit Finding A-018)
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: numberFromEnv(
    5,
    z.number().int().positive(),
  ),
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS: numberFromEnv(
    60000,
    z.number().int().positive(),
  ),
  CIRCUIT_BREAKER_SUCCESS_THRESHOLD: numberFromEnv(
    2,
    z.number().int().positive(),
  ),
  // Admin Authentication (Audit Finding A-004)
  // ADMIN_TOKEN is required for production and live trading modes
  ADMIN_TOKEN: z.string().optional(),
  // Optional "next" admin token for zero-downtime rotation (GAP-038)
  // If set, both ADMIN_TOKEN and ADMIN_TOKEN_NEXT are accepted for admin endpoints.
  // In production/live trading, at least one of them must be set.
  ADMIN_TOKEN_NEXT: z.string().optional(),
  // CORS Configuration
  // Comma-separated list of allowed origins. Default: http://localhost:3000
  // Use '*' only for development. Production MUST use specific origins.
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  // Reconciliation Configuration (Gap RE-001)
  // Interval in seconds for periodic reconciliation (default: 300 seconds = 5 minutes)
  RECONCILIATION_INTERVAL_SECONDS: numberFromEnv(
    300,
    z.number().int().positive().min(60).max(3600),
  ),
  // Rate Limiting Configuration (Audit Finding A-008)
  // RATE_LIMIT_MAX_REQUESTS:
  //   - Purpose: Maximum number of requests allowed per IP per time window.
  //   - Default: 100 requests.
  //   - Valid range: 1–10,000 (values outside this range will be rejected at startup).
  //   - Example: RATE_LIMIT_MAX_REQUESTS=500 to allow up to 500 requests per IP during each window.
  //   - Security: Lower values provide stronger protection against abuse/DoS but may impact
  //               legitimate high-throughput clients. Tune based on expected traffic patterns.
  RATE_LIMIT_MAX_REQUESTS: numberFromEnv(
    100,
    z.number().int().positive().min(1).max(10000),
  ),
  // RATE_LIMIT_WINDOW_MS:
  //   - Purpose: Duration of the rate limiting window, in milliseconds.
  //   - Default: 60000 ms (1 minute).
  //   - Valid range: 1,000–3,600,000 ms (1 second to 1 hour).
  //   - Example: RATE_LIMIT_WINDOW_MS=300000 to use a 5-minute (300,000 ms) window.
  //   - Security: Shorter windows react faster to bursts, longer windows smooth out traffic
  //               but may allow short spikes. Choose a value that balances user experience
  //               with protection against automated abuse.
  RATE_LIMIT_WINDOW_MS: numberFromEnv(
    60000,
    z.number().int().positive().min(1000).max(3600000),
  ),
  // RATE_LIMIT_TRUST_PROXY:
  //   - Purpose: Whether to trust X-Forwarded-For and X-Real-IP headers for rate limiting.
  //   - Default: false (do not trust proxy headers).
  //   - Security: ONLY enable this when the application is behind a trusted reverse proxy
  //               (nginx, load balancer, etc.). If enabled without a trusted proxy, clients
  //               can spoof their IP address to bypass rate limiting by setting custom headers.
  //   - Example: RATE_LIMIT_TRUST_PROXY=true when deployed behind nginx or AWS ALB.
  RATE_LIMIT_TRUST_PROXY: booleanFromEnv.default(false),
  // ========================================
  // Alerting Configuration (Gap OB-002, Issue #100)
  // ========================================
  // Telegram bot configuration for alerting
  // Create bot via @BotFather on Telegram and get bot token
  // Get chat ID by sending a message to the bot and calling https://api.telegram.org/bot<TOKEN>/getUpdates
  TELEGRAM_BOT_TOKEN: optionalStringFromEnv(z.string().optional()),
  TELEGRAM_CHAT_ID: optionalStringFromEnv(z.string().optional()),
  // Alert thresholds
  ALERT_ERROR_RATE_THRESHOLD: numberFromEnv(
    5,
    z.number().positive().min(0.1).max(100),
  ), // Error rate percentage (default: 5%)
  ALERT_CIRCUIT_BREAKER_TRIPS: numberFromEnv(
    1,
    z.number().int().positive().min(1),
  ), // Alert after N trips (default: 1)
  // ========================================
  // Compliance: Research §9.1, §10.1
  // ========================================
  // Minimum USDC balance (in USDC units). If set and balance < this at startup, exit. Research §9.1.
  MIN_BALANCE_USDC: numberFromEnv(0, z.number().nonnegative()),
  // Ban-status check interval (ms). Research §10.1: every 24 hours; §9.2: optionally every 1 hour. Use 0 to disable.
  BAN_STATUS_CHECK_INTERVAL_MS: numberFromEnv(
    86400000,
    z
      .number()
      .int()
      .nonnegative()
      .refine((value) => value === 0 || value >= 3600000, {
        message: 'Must be 0 (to disable) or at least 3600000 ms (1 hour)',
      }),
  ), // default 24h, min 1h when enabled; 0 disables
  // If true, exit on startup when ban-status returns cert_required. Research §10.1: alert admin (14-day deadline).
  BAN_STATUS_EXIT_IF_CERT_REQUIRED: booleanFromEnv.default(false),
  // Optional path to config/markets.json (Research §6.1, §8). If set, tokenIds and per-market limits loaded from file. Resolved relative to process.cwd() (e.g. when running from apps/backend, use ../../config/markets.json for repo-root config).
  MARKETS_CONFIG_PATH: optionalStringFromEnv(z.string().optional()),
  // Optional path to config/strategy.json (Research §6.1). If set, strategy params loaded from file. Resolved relative to process.cwd().
  STRATEGY_CONFIG_PATH: optionalStringFromEnv(z.string().optional()),
  // WebSocket max reconnect attempts before giving up (Research §9.3). Default 10.
  WS_MAX_RECONNECT_ATTEMPTS: numberFromEnv(10, z.number().int().positive().max(100)),
  // Heartbeat URL (e.g. healthchecks.io ping URL). GET every 1 min (Research §9.7, §10.6). If missed 5 min, external alert.
  HEARTBEAT_URL: optionalStringFromEnv(z.string().url().optional()),
  // ========================================
  // Database Backup Configuration (Gap PA-006, Issue #406)
  // ========================================
  BACKUP_STORAGE_TYPE: z.enum(['local', 's3', 'gcs', 'azure']).default('local'),
  BACKUP_LOCAL_PATH: z.string().default('./data/backups'),
  BACKUP_COMPRESS: booleanFromEnv.default(true),
  BACKUP_MAX_BACKUPS: numberFromEnv(30, z.number().int().positive()),
  BACKUP_MAX_AGE_DAYS: numberFromEnv(90, z.number().int().positive()),
  // S3 configuration
  BACKUP_S3_BUCKET: optionalStringFromEnv(z.string().optional()),
  BACKUP_S3_REGION: optionalStringFromEnv(z.string().optional()),
  BACKUP_S3_PREFIX: optionalStringFromEnv(z.string().optional()),
  BACKUP_S3_ACCESS_KEY_ID: optionalStringFromEnv(z.string().optional()),
  BACKUP_S3_SECRET_ACCESS_KEY: optionalStringFromEnv(z.string().optional()),
  // GCS configuration
  BACKUP_GCS_BUCKET: optionalStringFromEnv(z.string().optional()),
  BACKUP_GCS_PROJECT_ID: optionalStringFromEnv(z.string().optional()),
  BACKUP_GCS_PREFIX: optionalStringFromEnv(z.string().optional()),
  BACKUP_GCS_KEY_FILENAME: optionalStringFromEnv(z.string().optional()),
  // Azure configuration
  BACKUP_AZURE_CONTAINER: optionalStringFromEnv(z.string().optional()),
  BACKUP_AZURE_PREFIX: optionalStringFromEnv(z.string().optional()),
  BACKUP_AZURE_CONNECTION_STRING: optionalStringFromEnv(z.string().optional()),
  BACKUP_AZURE_ACCOUNT_NAME: optionalStringFromEnv(z.string().optional()),
  BACKUP_AZURE_ACCOUNT_KEY: optionalStringFromEnv(z.string().optional()),
  // Backup schedule (cron expression)
  BACKUP_SCHEDULE: z.string().default('0 2 * * *'),

  // ========================================
  // Exchange Rate Configuration (GAP-007)
  // ========================================
  // Exchange rate API URL (default: CoinGecko API)
  EXCHANGE_RATE_API_URL: z.string().url().default('https://api.coingecko.com/api/v3'),
  // Exchange rate cache TTL in milliseconds (default: 5 minutes)
  EXCHANGE_RATE_CACHE_TTL_MS: numberFromEnv(
    300000,
    z.number().int().positive().min(60000).max(3600000),
  ),

  // ========================================
  // Data Pipeline / Ingestion Configuration (GAP-021)
  // ========================================
  DATA_PIPELINE_ENABLED: booleanFromEnv.default(true),
  // Flush interval for buffered market data to the EventStore.
  DATA_PIPELINE_FLUSH_INTERVAL_MS: numberFromEnv(
    1000,
    z.number().int().positive().min(100).max(60000),
  ),
  // How many top-of-book levels to store per side for orderbook events.
  DATA_PIPELINE_ORDERBOOK_LEVELS: numberFromEnv(
    10,
    z.number().int().positive().min(1).max(50),
  ),
  // If false, only MarketEvent summaries are stored (no OrderBookUpdateEvent).
  DATA_PIPELINE_STORE_ORDERBOOK_EVENTS: booleanFromEnv.default(true),
  // Send an alert after N consecutive flush failures.
  DATA_PIPELINE_ALERT_AFTER_CONSECUTIVE_FAILURES: numberFromEnv(
    3,
    z.number().int().positive().min(1).max(100),
  ),
  // Circuit breaker guarding EventStore writes for ingestion.
  DATA_PIPELINE_CIRCUIT_BREAKER_FAILURE_THRESHOLD: numberFromEnv(
    5,
    z.number().int().positive(),
  ),
  DATA_PIPELINE_CIRCUIT_BREAKER_RESET_TIMEOUT_MS: numberFromEnv(
    60000,
    z.number().int().positive(),
  ),
  DATA_PIPELINE_CIRCUIT_BREAKER_SUCCESS_THRESHOLD: numberFromEnv(
    2,
    z.number().int().positive(),
  ),
});

const configSchema = envSchema
  .refine(
    (env) => env.PAPER_TRADING_MAX_SLIPPAGE >= env.PAPER_TRADING_SLIPPAGE,
    {
      message:
        "PAPER_TRADING_MAX_SLIPPAGE must be greater than or equal to PAPER_TRADING_SLIPPAGE",
      path: ["PAPER_TRADING_MAX_SLIPPAGE"],
    },
  )
  .refine(
    (env) => {
      // If either Telegram field is set, both must be set
      const hasToken = !!env.TELEGRAM_BOT_TOKEN;
      const hasChatId = !!env.TELEGRAM_CHAT_ID;
      return hasToken === hasChatId;
    },
    {
      message:
        "Both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set together for Telegram alerting",
      path: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
    },
  )
  .refine(
    (env) => {
      // Validate cloud backup configuration based on storage type
      if (env.BACKUP_STORAGE_TYPE === 's3') {
        return !!env.BACKUP_S3_BUCKET && !!env.BACKUP_S3_REGION;
      }
      return true;
    },
    {
      message:
        "When BACKUP_STORAGE_TYPE=s3, both BACKUP_S3_BUCKET and BACKUP_S3_REGION are required",
      path: ["BACKUP_S3_BUCKET", "BACKUP_S3_REGION"],
    },
  )
  .refine(
    (env) => {
      if (env.BACKUP_STORAGE_TYPE === 'gcs') {
        return !!env.BACKUP_GCS_BUCKET && !!env.BACKUP_GCS_PROJECT_ID;
      }
      return true;
    },
    {
      message:
        "When BACKUP_STORAGE_TYPE=gcs, both BACKUP_GCS_BUCKET and BACKUP_GCS_PROJECT_ID are required",
      path: ["BACKUP_GCS_BUCKET", "BACKUP_GCS_PROJECT_ID"],
    },
  )
  .refine(
    (env) => {
      if (env.BACKUP_STORAGE_TYPE === 'azure') {
        const hasConnectionString = !!env.BACKUP_AZURE_CONNECTION_STRING;
        const hasAccountCredentials = !!env.BACKUP_AZURE_ACCOUNT_NAME && !!env.BACKUP_AZURE_ACCOUNT_KEY;
        return !!env.BACKUP_AZURE_CONTAINER && (hasConnectionString || hasAccountCredentials);
      }
      return true;
    },
    {
      message:
        "When BACKUP_STORAGE_TYPE=azure, BACKUP_AZURE_CONTAINER is required, and either BACKUP_AZURE_CONNECTION_STRING or (BACKUP_AZURE_ACCOUNT_NAME + BACKUP_AZURE_ACCOUNT_KEY)",
      path: ["BACKUP_AZURE_CONTAINER"],
    },
  )
  .transform((env) => {
    let tokenIds: string[] = env.TOKEN_IDS.split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    let markets: MarketConfigEntry[] | undefined;
    if (env.MARKETS_CONFIG_PATH) {
      try {
        const resolved = path.isAbsolute(env.MARKETS_CONFIG_PATH)
          ? env.MARKETS_CONFIG_PATH
          : path.resolve(process.cwd(), env.MARKETS_CONFIG_PATH);
        if (fs.existsSync(resolved)) {
          const raw = fs.readFileSync(resolved, "utf-8");
          const parsed = JSON.parse(raw) as MarketConfigEntry[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            markets = parsed;
            tokenIds = parsed.map((m) => m.tokenId).filter(Boolean);
          }
        }
      } catch (err) {
        logger.warn("Failed to load markets config, falling back to TOKEN_IDS", {
          path: path.isAbsolute(env.MARKETS_CONFIG_PATH)
            ? env.MARKETS_CONFIG_PATH
            : path.resolve(process.cwd(), env.MARKETS_CONFIG_PATH),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    let strategy: StrategyConfigEntry | undefined;
    if (env.STRATEGY_CONFIG_PATH) {
      try {
        const resolved = path.isAbsolute(env.STRATEGY_CONFIG_PATH)
          ? env.STRATEGY_CONFIG_PATH
          : path.resolve(process.cwd(), env.STRATEGY_CONFIG_PATH);
        if (fs.existsSync(resolved)) {
          const raw = fs.readFileSync(resolved, "utf-8");
          const parsed = JSON.parse(raw) as StrategyConfigEntry;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            strategy = parsed;
          }
        }
      } catch (err) {
        logger.warn("Failed to load strategy config", {
          path: path.isAbsolute(env.STRATEGY_CONFIG_PATH)
            ? env.STRATEGY_CONFIG_PATH
            : path.resolve(process.cwd(), env.STRATEGY_CONFIG_PATH),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return {
    gammaApiUrl: env.GAMMA_API_URL.replace(/\/$/, ""),
    clobApiUrl: env.CLOB_API_URL.replace(/\/$/, ""),
    wsMarketUrl: env.WS_MARKET_URL,
    tokenIds,
    markets,
    strategy,
    wsMaxReconnectAttempts: env.WS_MAX_RECONNECT_ATTEMPTS,
    heartbeatUrl: env.HEARTBEAT_URL,
    logLevel: env.LOG_LEVEL,
    retryAttempts: env.RETRY_ATTEMPTS,
    retryDelay: env.RETRY_DELAY,
    retryTotalTimeout: env.RETRY_TOTAL_TIMEOUT,
    liveTrading: env.LIVE_TRADING,
    complianceAccepted: env.COMPLIANCE_ACCEPTED,
    port: env.PORT,
    metricsPort: env.METRICS_PORT,
    eventStorePath: env.EVENT_STORE_PATH,
    privateKey: env.PRIVATE_KEY,
    secretSource: env.SECRET_SOURCE,
    encryptionKey: env.ENCRYPTION_KEY,
    encryptedPrivateKey: env.ENCRYPTED_PRIVATE_KEY,
    awsSecretName: env.AWS_SECRET_NAME,
    awsRegion: env.AWS_REGION,
    vaultAddr: env.VAULT_ADDR,
    vaultToken: env.VAULT_TOKEN,
    vaultPath: env.VAULT_PATH,
    azureKeyVaultName: env.AZURE_KEY_VAULT_NAME,
    azureSecretName: env.AZURE_SECRET_NAME,
    chainId: env.CHAIN_ID,
    paperTradingSlippage: env.PAPER_TRADING_SLIPPAGE,
    paperTradingMaxSlippage: env.PAPER_TRADING_MAX_SLIPPAGE,
    paperTradingFeeRate: env.PAPER_TRADING_FEE_RATE,
    paperTradingPartialFillRate: env.PAPER_TRADING_PARTIAL_FILL_RATE,
    paperTradingMinFillRatio: env.PAPER_TRADING_MIN_FILL_RATIO,
    paperTradingMaxFillRatio: env.PAPER_TRADING_MAX_FILL_RATIO,
    riskMaxExposurePerMarket: env.RISK_MAX_EXPOSURE_PER_MARKET,
    riskMaxOpenOrders: env.RISK_MAX_OPEN_ORDERS,
    riskMaxDrawdown: env.RISK_MAX_DRAWDOWN,
    riskErrorRateThreshold: env.RISK_ERROR_RATE_THRESHOLD,
    riskErrorRateWindow: env.RISK_ERROR_RATE_WINDOW,
    riskMaxFeeRateBps: env.RISK_MAX_FEE_RATE_BPS,
    circuitBreakerFailureThreshold: env.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    circuitBreakerResetTimeoutMs: env.CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
    circuitBreakerSuccessThreshold: env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD,
    adminToken: env.ADMIN_TOKEN,
    adminTokenNext: env.ADMIN_TOKEN_NEXT,
    allowedOrigins: env.ALLOWED_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    reconciliationIntervalSeconds: env.RECONCILIATION_INTERVAL_SECONDS,
    rateLimitMaxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    rateLimitTrustProxy: env.RATE_LIMIT_TRUST_PROXY,
    // Alerting configuration
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    telegramChatId: env.TELEGRAM_CHAT_ID,
    alertErrorRateThreshold: env.ALERT_ERROR_RATE_THRESHOLD,
    alertCircuitBreakerTrips: env.ALERT_CIRCUIT_BREAKER_TRIPS,
    minBalanceUsdc: env.MIN_BALANCE_USDC,
    banStatusCheckIntervalMs: env.BAN_STATUS_CHECK_INTERVAL_MS,
    banStatusExitIfCertRequired: env.BAN_STATUS_EXIT_IF_CERT_REQUIRED,
    // Backup configuration
    backupStorageType: env.BACKUP_STORAGE_TYPE,
    backupLocalPath: env.BACKUP_LOCAL_PATH,
    backupCompress: env.BACKUP_COMPRESS,
    backupMaxBackups: env.BACKUP_MAX_BACKUPS,
    backupMaxAgeDays: env.BACKUP_MAX_AGE_DAYS,
    backupS3Bucket: env.BACKUP_S3_BUCKET,
    backupS3Region: env.BACKUP_S3_REGION,
    backupS3Prefix: env.BACKUP_S3_PREFIX,
    backupS3AccessKeyId: env.BACKUP_S3_ACCESS_KEY_ID,
    backupS3SecretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY,
    backupGcsBucket: env.BACKUP_GCS_BUCKET,
    backupGcsProjectId: env.BACKUP_GCS_PROJECT_ID,
    backupGcsPrefix: env.BACKUP_GCS_PREFIX,
    backupGcsKeyFilename: env.BACKUP_GCS_KEY_FILENAME,
    backupAzureContainer: env.BACKUP_AZURE_CONTAINER,
    backupAzurePrefix: env.BACKUP_AZURE_PREFIX,
    backupAzureConnectionString: env.BACKUP_AZURE_CONNECTION_STRING,
    backupAzureAccountName: env.BACKUP_AZURE_ACCOUNT_NAME,
    backupAzureAccountKey: env.BACKUP_AZURE_ACCOUNT_KEY,
    backupSchedule: env.BACKUP_SCHEDULE,

    // Exchange rate configuration (GAP-007)
    exchangeRateApiUrl: env.EXCHANGE_RATE_API_URL.replace(/\/$/, ""),
    exchangeRateCacheTtlMs: env.EXCHANGE_RATE_CACHE_TTL_MS,

    // Data pipeline / ingestion (GAP-021)
    dataPipelineEnabled: env.DATA_PIPELINE_ENABLED,
    dataPipelineFlushIntervalMs: env.DATA_PIPELINE_FLUSH_INTERVAL_MS,
    dataPipelineOrderbookLevels: env.DATA_PIPELINE_ORDERBOOK_LEVELS,
    dataPipelineStoreOrderbookEvents: env.DATA_PIPELINE_STORE_ORDERBOOK_EVENTS,
    dataPipelineAlertAfterConsecutiveFailures: env.DATA_PIPELINE_ALERT_AFTER_CONSECUTIVE_FAILURES,
    dataPipelineCircuitBreakerFailureThreshold: env.DATA_PIPELINE_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    dataPipelineCircuitBreakerResetTimeoutMs: env.DATA_PIPELINE_CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
    dataPipelineCircuitBreakerSuccessThreshold: env.DATA_PIPELINE_CIRCUIT_BREAKER_SUCCESS_THRESHOLD,
  };
  });

export type Config = z.infer<typeof configSchema>;

const formatConfigError = (error: z.ZodError): string => {
  const details = error.issues
    .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
    .join("; ");
  return `Invalid configuration: ${details}`;
};

export const parseConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(formatConfigError(parsed.error));
  }

  // CORS Security Check: Fail-fast if wildcard is used in production-like scenarios
  const config = parsed.data;

  // Validate that ALLOWED_ORIGINS is not empty
  if (config.allowedOrigins.length === 0) {
    throw new Error(
      "CRITICAL CONFIGURATION ERROR: ALLOWED_ORIGINS cannot be empty. " +
        "Set at least one allowed origin, e.g., ALLOWED_ORIGINS=http://localhost:3000 " +
        "or ALLOWED_ORIGINS=* for development only.",
    );
  }

  const hasWildcardCors = config.allowedOrigins.includes("*");
  const isProduction = env.NODE_ENV === "production" || config.liveTrading;

  if (hasWildcardCors && isProduction) {
    throw new Error(
      "CRITICAL SECURITY ERROR: Wildcard CORS (*) is not allowed in production or with live trading enabled. " +
        "Set ALLOWED_ORIGINS to specific domain(s), e.g., ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com",
    );
  }

  if (hasWildcardCors) {
    // Note: Using console.warn instead of logger here to avoid circular dependencies
    // since config is imported very early in the application lifecycle
    console.warn(
      "⚠️  WARNING: CORS is configured with wildcard (*). This is ONLY acceptable for local development. " +
        "For production, set ALLOWED_ORIGINS to specific domain(s).",
    );
  }

  // Admin Token Security Check (Audit Finding A-004): Fail-fast if missing in production OR live trading
  // This prevents unauthorized access to sensitive endpoints (kill switch, order management, config changes)
  // Note: isProduction already includes liveTrading check (line 198)
  const requiresAdminToken = isProduction;
  const hasAdminToken =
    !!config.adminToken && config.adminToken.trim() !== "";
  const hasAdminTokenNext =
    !!config.adminTokenNext && config.adminTokenNext.trim() !== "";
  const hasAnyAdminToken = hasAdminToken || hasAdminTokenNext;

  if (
    requiresAdminToken &&
    !hasAnyAdminToken
  ) {
    const mode = config.liveTrading ? "live trading" : "production";
    throw new Error(
      `CRITICAL SECURITY ERROR: ADMIN_TOKEN is required for ${mode} mode. ` +
        "Sensitive endpoints (kill switch, order management, config changes) require authentication. " +
        "Generate a secure token: openssl rand -hex 32. " +
        "For zero-downtime rotation, you may also set ADMIN_TOKEN_NEXT.",
    );
  }

  if (!hasAnyAdminToken) {
    console.warn(
      "⚠️  WARNING: ADMIN_TOKEN is not set. Admin endpoints will be disabled. " +
        "This is only acceptable for local development/testing. " +
        "For any sensitive operations, set ADMIN_TOKEN to a secure random value.",
    );
  }

  return config;
};

export const config = parseConfig();
