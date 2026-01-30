import { GammaClient } from '../clients/gamma';
import { ClobClient } from '../clients/clob';
import { logger } from '../utils/logger';
import { calculateOrderbookSummary, formatOrderbookSummary } from '../utils/orderbook';
import { Token } from '@polymarket/shared';

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
    logger.error('Failed to fetch markets:', error);
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
    logger.error('Failed to fetch orderbook:', error);
    throw error;
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
    default:
      console.log('Usage:');
      console.log('  npm run markets [--limit <number>]');
      console.log('  npm run book --tokenId <token_id>');
      process.exit(1);
  }
}
