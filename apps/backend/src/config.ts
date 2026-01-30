import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.BACKEND_PORT ?? '4000'),
  liveTrading: process.env.LIVE_TRADING === 'true',
  clobApiUrl: process.env.CLOB_API_URL ?? 'https://clob.polymarket.com',
  gammaApiUrl: process.env.GAMMA_API_URL ?? 'https://gamma-api.polymarket.com',
  wsUrl: process.env.CLOB_WS_URL ?? 'wss://ws.clob.polymarket.com',
  apiKey: process.env.POLYMARKET_API_KEY ?? '',
  apiSecret: process.env.POLYMARKET_API_SECRET ?? '',
  apiPassphrase: process.env.POLYMARKET_API_PASSPHRASE ?? '',
  userId: process.env.POLYMARKET_USER_ID ?? '',
  risk: {
    maxOrderSize: Number(process.env.RISK_MAX_ORDER_SIZE ?? '250'),
    maxPositionSize: Number(process.env.RISK_MAX_POSITION_SIZE ?? '2000'),
    maxDailyLoss: Number(process.env.RISK_MAX_DAILY_LOSS ?? '500'),
  },
  circuitBreaker: {
    maxErrorCount: Number(process.env.CIRCUIT_BREAKER_ERRORS ?? '5'),
    coolDownMs: Number(process.env.CIRCUIT_BREAKER_COOLDOWN ?? '60000'),
  },
  databasePath: process.env.SQLITE_PATH ?? './apps/backend/data/backend.db',
};
