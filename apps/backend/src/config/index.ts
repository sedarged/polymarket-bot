import dotenv from 'dotenv';
import { z } from 'zod';
import { validatePrivateKey } from '../secrets';

dotenv.config();

const booleanFromEnv = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }
  return value;
}, z.boolean());

const numberFromEnv = (defaultValue: number, schema: z.ZodNumber) => {
  const numberSchema = schema.refine((value) => Number.isFinite(value), {
    message: 'Expected a finite number',
  });
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? value : parsed;
    }
    return value;
  }, numberSchema).default(defaultValue);
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
    if (value === '' || value === null) {
      return undefined;
    }
    return value;
  }, schema);
};

const envSchema = z.object({
  GAMMA_API_URL: z.string().url().default('https://gamma-api.polymarket.com'),
  CLOB_API_URL: z.string().url().default('https://clob.polymarket.com'),
  WS_MARKET_URL: z.string().url().default('wss://ws-subscriptions-clob.polymarket.com/ws/market'),
  TOKEN_IDS: z.string().default(''),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  RETRY_ATTEMPTS: numberFromEnv(3, z.number().int().positive()),
  RETRY_DELAY: numberFromEnv(1000, z.number().int().nonnegative()),
  // Audit Finding A-009: Add overall timeout cap for retry operations
  // Default: 5 minutes (300000ms) to prevent unbounded retry duration
  RETRY_TOTAL_TIMEOUT: numberFromEnv(300000, z.number().int().positive()),
  LIVE_TRADING: booleanFromEnv.default(false),
  COMPLIANCE_ACCEPTED: booleanFromEnv.default(false),
  PORT: numberFromEnv(3000, z.number().int().positive()),
  // Trading credentials (optional - only required for live trading)
  // Private key must be 64 hex characters (optionally prefixed with 0x)
  // Addresses Audit Finding A-024: Private key format validation
  PRIVATE_KEY: optionalStringFromEnv(
    z.string().optional().refine(
      (key) => !key || validatePrivateKey(key),
      {
        message: 'PRIVATE_KEY must be 64 hexadecimal characters (optionally prefixed with 0x)',
      }
    )
  ),
  // Secret Management Configuration (Audit Finding A-001)
  // SECRET_SOURCE: 'env' (default), 'encrypted', 'aws', 'vault', 'azure'
  SECRET_SOURCE: z.enum(['env', 'encrypted', 'aws', 'vault', 'azure']).default('env'),
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
  PAPER_TRADING_MAX_SLIPPAGE: numberFromEnv(0.05, z.number().nonnegative().max(1)),
  PAPER_TRADING_FEE_RATE: numberFromEnv(0.002, z.number().nonnegative().max(1)),
  // Partial Fill Configuration
  PAPER_TRADING_PARTIAL_FILL_RATE: numberFromEnv(0.0, z.number().nonnegative().max(1)),
  PAPER_TRADING_MIN_FILL_RATIO: numberFromEnv(0.1, z.number().nonnegative().max(1)),
  PAPER_TRADING_MAX_FILL_RATIO: numberFromEnv(0.9, z.number().nonnegative().max(1)),
  // Risk Management Configuration
  RISK_MAX_EXPOSURE_PER_MARKET: numberFromEnv(1000, z.number().positive()),
  RISK_MAX_OPEN_ORDERS: numberFromEnv(50, z.number().int().positive()),
  RISK_MAX_DRAWDOWN: numberFromEnv(0.20, z.number().positive().max(1)),
  RISK_ERROR_RATE_THRESHOLD: numberFromEnv(0.10, z.number().nonnegative().max(1)),
  RISK_ERROR_RATE_WINDOW: numberFromEnv(100, z.number().int().positive()),
  // Circuit Breaker Configuration (Audit Finding A-018)
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: numberFromEnv(5, z.number().int().positive()),
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS: numberFromEnv(60000, z.number().int().positive()),
  CIRCUIT_BREAKER_SUCCESS_THRESHOLD: numberFromEnv(2, z.number().int().positive()),
  // Admin Authentication (Audit Finding A-004)
  // ADMIN_TOKEN is required for production and live trading modes
  ADMIN_TOKEN: z.string().optional(),
  // CORS Configuration
  // Comma-separated list of allowed origins. Default: http://localhost:3000
  // Use '*' only for development. Production MUST use specific origins.
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  // Reconciliation Configuration (Gap RE-001)
  // Interval in seconds for periodic reconciliation (default: 300 seconds = 5 minutes)
  RECONCILIATION_INTERVAL_SECONDS: numberFromEnv(300, z.number().int().positive().min(60).max(3600)),
  // Rate Limiting Configuration (Audit Finding A-008)
  // RATE_LIMIT_MAX_REQUESTS:
  //   - Purpose: Maximum number of requests allowed per IP per time window.
  //   - Default: 100 requests.
  //   - Valid range: 1–10,000 (values outside this range will be rejected at startup).
  //   - Example: RATE_LIMIT_MAX_REQUESTS=500 to allow up to 500 requests per IP during each window.
  //   - Security: Lower values provide stronger protection against abuse/DoS but may impact
  //               legitimate high-throughput clients. Tune based on expected traffic patterns.
  RATE_LIMIT_MAX_REQUESTS: numberFromEnv(100, z.number().int().positive().min(1).max(10000)),
  // RATE_LIMIT_WINDOW_MS:
  //   - Purpose: Duration of the rate limiting window, in milliseconds.
  //   - Default: 60000 ms (1 minute).
  //   - Valid range: 1,000–3,600,000 ms (1 second to 1 hour).
  //   - Example: RATE_LIMIT_WINDOW_MS=300000 to use a 5-minute (300,000 ms) window.
  //   - Security: Shorter windows react faster to bursts, longer windows smooth out traffic
  //               but may allow short spikes. Choose a value that balances user experience
  //               with protection against automated abuse.
  RATE_LIMIT_WINDOW_MS: numberFromEnv(60000, z.number().int().positive().min(1000).max(3600000)),
  // RATE_LIMIT_TRUST_PROXY:
  //   - Purpose: Whether to trust X-Forwarded-For and X-Real-IP headers for rate limiting.
  //   - Default: false (do not trust proxy headers).
  //   - Security: ONLY enable this when the application is behind a trusted reverse proxy
  //               (nginx, load balancer, etc.). If enabled without a trusted proxy, clients
  //               can spoof their IP address to bypass rate limiting by setting custom headers.
  //   - Example: RATE_LIMIT_TRUST_PROXY=true when deployed behind nginx or AWS ALB.
  RATE_LIMIT_TRUST_PROXY: booleanFromEnv.default(false),
});

const configSchema = envSchema.refine(
  (env) => env.PAPER_TRADING_MAX_SLIPPAGE >= env.PAPER_TRADING_SLIPPAGE,
  {
    message: 'PAPER_TRADING_MAX_SLIPPAGE must be greater than or equal to PAPER_TRADING_SLIPPAGE',
    path: ['PAPER_TRADING_MAX_SLIPPAGE'],
  }
).transform((env) => ({
  gammaApiUrl: env.GAMMA_API_URL,
  clobApiUrl: env.CLOB_API_URL,
  wsMarketUrl: env.WS_MARKET_URL,
  tokenIds: env.TOKEN_IDS.split(',').map(s => s.trim()).filter(s => s.length > 0),
  logLevel: env.LOG_LEVEL,
  retryAttempts: env.RETRY_ATTEMPTS,
  retryDelay: env.RETRY_DELAY,
  retryTotalTimeout: env.RETRY_TOTAL_TIMEOUT,
  liveTrading: env.LIVE_TRADING,
  complianceAccepted: env.COMPLIANCE_ACCEPTED,
  port: env.PORT,
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
  circuitBreakerFailureThreshold: env.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  circuitBreakerResetTimeoutMs: env.CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
  circuitBreakerSuccessThreshold: env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD,
  adminToken: env.ADMIN_TOKEN,
  allowedOrigins: env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(s => s.length > 0),
  reconciliationIntervalSeconds: env.RECONCILIATION_INTERVAL_SECONDS,
  rateLimitMaxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
  rateLimitTrustProxy: env.RATE_LIMIT_TRUST_PROXY,
}));

export type Config = z.infer<typeof configSchema>;

const formatConfigError = (error: z.ZodError): string => {
  const details = error.issues
    .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
    .join('; ');
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
      'CRITICAL CONFIGURATION ERROR: ALLOWED_ORIGINS cannot be empty. ' +
      'Set at least one allowed origin, e.g., ALLOWED_ORIGINS=http://localhost:3000 ' +
      'or ALLOWED_ORIGINS=* for development only.'
    );
  }
  
  const hasWildcardCors = config.allowedOrigins.includes('*');
  const isProduction = env.NODE_ENV === 'production' || config.liveTrading;
  
  if (hasWildcardCors && isProduction) {
    throw new Error(
      'CRITICAL SECURITY ERROR: Wildcard CORS (*) is not allowed in production or with live trading enabled. ' +
      'Set ALLOWED_ORIGINS to specific domain(s), e.g., ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com'
    );
  }
  
  if (hasWildcardCors) {
    // Note: Using console.warn instead of logger here to avoid circular dependencies
    // since config is imported very early in the application lifecycle
    console.warn(
      '⚠️  WARNING: CORS is configured with wildcard (*). This is ONLY acceptable for local development. ' +
      'For production, set ALLOWED_ORIGINS to specific domain(s).'
    );
  }
  
  // Admin Token Security Check (Audit Finding A-004): Fail-fast if missing in production OR live trading
  // This prevents unauthorized access to sensitive endpoints (kill switch, order management, config changes)
  // Note: isProduction already includes liveTrading check (line 198)
  const requiresAdminToken = isProduction;
  
  if (requiresAdminToken && (!config.adminToken || config.adminToken.trim() === '')) {
    const mode = config.liveTrading ? 'live trading' : 'production';
    throw new Error(
      `CRITICAL SECURITY ERROR: ADMIN_TOKEN is required for ${mode} mode. ` +
      'Sensitive endpoints (kill switch, order management, config changes) require authentication. ' +
      'Generate a secure token: openssl rand -hex 32'
    );
  }
  
  if (!config.adminToken || config.adminToken.trim() === '') {
    console.warn(
      '⚠️  WARNING: ADMIN_TOKEN is not set. Admin endpoints will be disabled. ' +
      'This is only acceptable for local development/testing. ' +
      'For any sensitive operations, set ADMIN_TOKEN to a secure random value.'
    );
  }
  
  return config;
};

export const config = parseConfig();
