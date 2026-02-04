import dotenv from 'dotenv';
import { z } from 'zod';

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

const envSchema = z.object({
  GAMMA_API_URL: z.string().url().default('https://gamma-api.polymarket.com'),
  CLOB_API_URL: z.string().url().default('https://clob.polymarket.com'),
  WS_MARKET_URL: z.string().url().default('wss://ws-subscriptions-clob.polymarket.com/ws/market'),
  TOKEN_IDS: z.string().default(''),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  RETRY_ATTEMPTS: numberFromEnv(3, z.number().int().positive()),
  RETRY_DELAY: numberFromEnv(1000, z.number().int().nonnegative()),
  LIVE_TRADING: booleanFromEnv.default(false),
  COMPLIANCE_ACCEPTED: booleanFromEnv.default(false),
  PORT: numberFromEnv(3000, z.number().int().positive()),
  // Trading credentials (optional - only required for live trading)
  PRIVATE_KEY: z.string().optional(),
  // Chain ID: 137 = Polygon Mainnet, 80002 = Polygon Amoy Testnet
  // WARNING: Only Polygon Mainnet (137) is officially supported for live trading
  CHAIN_ID: numberFromEnv(137, z.number().int().positive()),
  // Paper Trading Configuration
  PAPER_TRADING_SLIPPAGE: numberFromEnv(0.01, z.number().nonnegative().max(1)),
  PAPER_TRADING_FEE_RATE: numberFromEnv(0.002, z.number().nonnegative().max(1)),
  // Risk Management Configuration
  RISK_MAX_EXPOSURE_PER_MARKET: numberFromEnv(1000, z.number().positive()),
  RISK_MAX_OPEN_ORDERS: numberFromEnv(50, z.number().int().positive()),
  RISK_MAX_DRAWDOWN: numberFromEnv(0.20, z.number().positive().max(1)),
  RISK_ERROR_RATE_THRESHOLD: numberFromEnv(0.10, z.number().nonnegative().max(1)),
  RISK_ERROR_RATE_WINDOW: numberFromEnv(100, z.number().int().positive()),
  // Admin Authentication
  ADMIN_TOKEN: z.string().optional(),
  // CORS Configuration
  // Comma-separated list of allowed origins. Default: http://localhost:3000
  // Use '*' only for development. Production MUST use specific origins.
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
});

const configSchema = envSchema.transform((env) => ({
  gammaApiUrl: env.GAMMA_API_URL,
  clobApiUrl: env.CLOB_API_URL,
  wsMarketUrl: env.WS_MARKET_URL,
  tokenIds: env.TOKEN_IDS.split(',').map(s => s.trim()).filter(s => s.length > 0),
  logLevel: env.LOG_LEVEL,
  retryAttempts: env.RETRY_ATTEMPTS,
  retryDelay: env.RETRY_DELAY,
  liveTrading: env.LIVE_TRADING,
  complianceAccepted: env.COMPLIANCE_ACCEPTED,
  port: env.PORT,
  privateKey: env.PRIVATE_KEY,
  chainId: env.CHAIN_ID,
  paperTradingSlippage: env.PAPER_TRADING_SLIPPAGE,
  paperTradingFeeRate: env.PAPER_TRADING_FEE_RATE,
  riskMaxExposurePerMarket: env.RISK_MAX_EXPOSURE_PER_MARKET,
  riskMaxOpenOrders: env.RISK_MAX_OPEN_ORDERS,
  riskMaxDrawdown: env.RISK_MAX_DRAWDOWN,
  riskErrorRateThreshold: env.RISK_ERROR_RATE_THRESHOLD,
  riskErrorRateWindow: env.RISK_ERROR_RATE_WINDOW,
  adminToken: env.ADMIN_TOKEN,
  allowedOrigins: env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(s => s.length > 0),
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
  
  return config;
};

export const config = parseConfig();
