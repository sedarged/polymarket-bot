import { GammaClient } from '../clients/gamma';
import { ClobClient } from '../clients/clob';
import { logger } from '../utils/logger';
import { calculateOrderbookSummary, formatOrderbookSummary } from '../utils/orderbook';
import { Token } from '@polymarket/shared';
import { config } from '../config';
import axios from 'axios';

export async function marketsCommand(limit?: number): Promise<void> {
  try {
    const client = new GammaClient();
    const markets = await client.getActiveMarkets(limit);

    if (markets.length === 0) {
      console.log('No active markets found.');
      return;
    }

    console.log(`\nActive Markets (${markets.length}):\n`);
    
    markets.forEach((market, index) => {
      console.log(`${index + 1}. ${market.question}`);
      
      if (market.tokens && market.tokens.length > 0) {
        market.tokens.forEach((token: Token) => {
          console.log(`   - ${token.outcome}: Token ID ${token.token_id}`);
        });
      }
      console.log('');
    });
  } catch (error) {
    logger.error('Failed to fetch markets', { error: (error as Error).message });
    throw error;
  }
}

export async function bookCommand(tokenId: string): Promise<void> {
  try {
    const client = new ClobClient();
    const orderbook = await client.getOrderbook(tokenId);
    
    const summary = calculateOrderbookSummary(orderbook);
    
    console.log('\n' + formatOrderbookSummary(summary) + '\n');
  } catch (error) {
    logger.error('Failed to fetch orderbook', { error: (error as Error).message });
    throw error;
  }
}

export async function killCommand(): Promise<void> {
  try {
    const url = `http://localhost:${config.port}/kill`;
    const headers: Record<string, string> = {};
    
    if (config.adminToken) {
      headers['Authorization'] = `Bearer ${config.adminToken}`;
    }

    console.log('\nActivating kill switch...\n');

    const response = await axios.post(url, {}, { headers });

    if (response.status === 200) {
      console.log('✓ Kill switch activated successfully');
      console.log(`  ${response.data.message}`);
      if (response.data.riskManager) {
        console.log('\nRisk Manager Status:');
        console.log(`  Killed: ${response.data.riskManager.killed}`);
        console.log(`  Recent Errors: ${response.data.riskManager.recentErrors}`);
        console.log(`  Circuit Breaker Tripped: ${response.data.riskManager.circuitBreakerTripped}`);
      }
    } else {
      console.error(`✗ Failed to activate kill switch: ${response.statusText}`);
      process.exit(1);
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        console.error('✗ Unauthorized: Invalid or missing admin token');
        console.error('  Set ADMIN_TOKEN in your .env file');
      } else if (error.code === 'ECONNREFUSED') {
        console.error('✗ Cannot connect to server');
        console.error(`  Ensure the server is running on port ${config.port}`);
      } else {
        console.error(`✗ Error: ${error.response?.data?.error || error.message}`);
      }
    } else {
      logger.error('Failed to activate kill switch', { 
        error: error instanceof Error ? error.message : String(error),
      });
    }
    process.exit(1);
  }
}

export function parseArgs(args: string[]): { command: string; options: Record<string, string | boolean> } {
  const command = args[0] || '';
  const options: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const key = arg.substring(2);
      const nextArg = args[i + 1];
      
      if (nextArg && !nextArg.startsWith('--')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    }
  }

  return { command, options };
}

export async function run(args: string[]): Promise<void> {
  const { command, options } = parseArgs(args);

  switch (command) {
    case 'markets': {
      const limit = options.limit ? parseInt(options.limit as string, 10) : undefined;
      await marketsCommand(limit);
      break;
    }
    case 'book': {
      const tokenId = options.tokenId as string;
      if (!tokenId) {
        console.error('Error: --tokenId is required for the book command');
        process.exit(1);
      }
      await bookCommand(tokenId);
      break;
    }
    case 'kill': {
      await killCommand();
      break;
    }
    default:
      console.log('Usage:');
      console.log('  npm run markets [--limit <number>]');
      console.log('  npm run book --tokenId <token_id>');
      console.log('  npm run kill');
      process.exit(1);
  }
}
