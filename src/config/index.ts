import dotenv from 'dotenv';

dotenv.config();

export const config = {
  gammaApiUrl: process.env.GAMMA_API_URL || 'https://gamma-api.polymarket.com',
  clobApiUrl: process.env.CLOB_API_URL || 'https://clob.polymarket.com',
  logLevel: process.env.LOG_LEVEL || 'info',
  retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3', 10),
  retryDelay: parseInt(process.env.RETRY_DELAY || '1000', 10),
  backendPort: parseInt(process.env.BACKEND_PORT || '3000', 10),
  adminPort: parseInt(process.env.ADMIN_PORT || '3001', 10),
};
