import { GammaClient } from '../clients/gamma';
import { ClobClient } from '../clients/clob';
import { ExchangeRateClient } from '../clients/exchangeRate';
import { logger } from '../utils/logger';
import { calculateOrderbookSummary, formatOrderbookSummary } from '../utils/orderbook';
import { Token } from '@polymarket/shared';
import { config } from '../config';
import { BackupService, BackupConfig } from '../utils/backup';
import { AlertingService } from '../utils/alerting';
import { BacktestEngine } from '../learning/backtestEngine';
import { EventStore } from '../learning/eventStore';
import { registerStrategies } from '../trading/strategies';
import axios from 'axios';
import path from 'path';

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

export async function backupCommand(options: Record<string, string | boolean>): Promise<void> {
  try {
    console.log('\n🔄 Starting database backup...\n');

    // Initialize alerting service if configured
    let alertingService: AlertingService | undefined;
    if (config.telegramBotToken && config.telegramChatId) {
      alertingService = new AlertingService({
        telegramBotToken: config.telegramBotToken,
        telegramChatId: config.telegramChatId,
      });
    }

    // Validate cloud-specific configuration up front
    const missingVars: string[] = [];
    if (config.backupStorageType === 's3') {
      if (!config.backupS3Bucket) missingVars.push('BACKUP_S3_BUCKET');
      if (!config.backupS3Region) missingVars.push('BACKUP_S3_REGION');
    } else if (config.backupStorageType === 'gcs') {
      if (!config.backupGcsBucket) missingVars.push('BACKUP_GCS_BUCKET');
      if (!config.backupGcsProjectId) missingVars.push('BACKUP_GCS_PROJECT_ID');
    } else if (config.backupStorageType === 'azure') {
      if (!config.backupAzureContainer) missingVars.push('BACKUP_AZURE_CONTAINER');
      if (!config.backupAzureConnectionString && (!config.backupAzureAccountName || !config.backupAzureAccountKey)) {
        missingVars.push('BACKUP_AZURE_CONNECTION_STRING or (BACKUP_AZURE_ACCOUNT_NAME + BACKUP_AZURE_ACCOUNT_KEY)');
      }
    }

    if (missingVars.length > 0) {
      console.error(`\n✗ Missing required backup configuration:\n  ${missingVars.join('\n  ')}\n`);
      process.exit(1);
    }

    // Use runtime-configured DB paths from environment or defaults
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    
    // Build backup configuration with proper typing
    const backupConfig: BackupConfig = {
      storageType: config.backupStorageType,
      localPath: config.backupLocalPath,
      compress: config.backupCompress,
      retention: {
        maxBackups: config.backupMaxBackups,
        maxAgeDays: config.backupMaxAgeDays,
      },
      databases: [
        {
          name: 'audit',
          path: process.env.AUDIT_DB_PATH || path.join(dataDir, 'audit.db'),
        },
        {
          name: 'events',
          path: process.env.EVENT_STORE_PATH || path.join(dataDir, 'events.db'),
        },
        {
          name: 'signals',
          path: process.env.SIGNAL_CATALOG_PATH || path.join(dataDir, 'signals.db'),
        },
        {
          name: 'backtests',
          path: process.env.BACKTEST_ENGINE_PATH || path.join(dataDir, 'backtests.db'),
        },
        {
          name: 'promotions',
          path: process.env.PROMOTION_WORKFLOW_PATH || path.join(dataDir, 'promotions.db'),
        },
      ],
      alertingService,
    };

    // Add cloud-specific configuration with validated values
    if (config.backupStorageType === 's3') {
      backupConfig.s3 = {
        bucket: config.backupS3Bucket!,
        region: config.backupS3Region!,
        prefix: config.backupS3Prefix,
        accessKeyId: config.backupS3AccessKeyId,
        secretAccessKey: config.backupS3SecretAccessKey,
      };
    } else if (config.backupStorageType === 'gcs') {
      backupConfig.gcs = {
        bucket: config.backupGcsBucket!,
        projectId: config.backupGcsProjectId!,
        prefix: config.backupGcsPrefix,
        keyFilename: config.backupGcsKeyFilename,
      };
    } else if (config.backupStorageType === 'azure') {
      backupConfig.azure = {
        containerName: config.backupAzureContainer!,
        prefix: config.backupAzurePrefix,
        connectionString: config.backupAzureConnectionString,
        accountName: config.backupAzureAccountName,
        accountKey: config.backupAzureAccountKey,
      };
    }

    // Create backup service with properly typed config
    const backupService = new BackupService(backupConfig);

    // List backups if requested
    if (options.list) {
      console.log('📋 Listing existing backups...\n');
      const backups = await backupService.listBackups();
      
      if (backups.length === 0) {
        console.log('No backups found.\n');
      } else {
        console.log(`Found ${backups.length} backup(s):\n`);
        backups.forEach((backup, index) => {
          const sizeMB = (backup.size / (1024 * 1024)).toFixed(2);
          console.log(`${index + 1}. ${backup.name}`);
          console.log(`   Size: ${sizeMB} MB`);
          console.log(`   Date: ${backup.date.toISOString()}`);
          console.log('');
        });
      }
      return;
    }

    // Perform backup
    const results = await backupService.backup();

    // Display results
    console.log('\n📊 Backup Results:\n');
    
    let successCount = 0;
    let failureCount = 0;
    let totalSize = 0;

    results.forEach((result) => {
      if (result.success) {
        successCount++;
        totalSize += result.size;
        const sizeMB = (result.size / (1024 * 1024)).toFixed(2);
        console.log(`✓ ${result.database}: ${sizeMB} MB`);
        console.log(`  Location: ${result.location}`);
      } else {
        failureCount++;
        console.log(`✗ ${result.database}: FAILED`);
        console.log(`  Error: ${result.error}`);
      }
      console.log('');
    });

    console.log('Summary:');
    console.log(`  Success: ${successCount}`);
    console.log(`  Failed: ${failureCount}`);
    console.log(`  Total size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  Storage: ${config.backupStorageType}`);
    console.log('');

    if (failureCount > 0) {
      console.error('⚠️  Some backups failed. Check the logs for details.');
      process.exit(1);
    } else {
      console.log('✅ All backups completed successfully!');
    }
  } catch (error) {
    logger.error('Backup command failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    console.error(`\n✗ Backup failed: ${error instanceof Error ? error.message : String(error)}`);
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

/**
 * Exchange Rate Command
 * 
 * Fetches and displays exchange rates for supported cryptocurrencies.
 * Demonstrates the ExchangeRateClient functionality (GAP-007).
 * 
 * Usage:
 *   npm run rates                    # Show all supported rates
 *   npm run rates -- --from USDC --to USD    # Show specific rate
 *   npm run rates -- --stats         # Show cache statistics
 * 
 * Examples:
 *   npm run rates
 *   npm run rates -- --from ETH --to USD
 *   npm run rates -- --stats
 */
export async function ratesCommand(options: Record<string, string | boolean>): Promise<void> {
  const client = new ExchangeRateClient(config.exchangeRateCacheTtlMs);

  try {
    // Show cache statistics
    if (options.stats) {
      const stats = client.getCacheStats();
      const metrics = client.getCircuitBreakerMetrics();
      
      console.log('\n📊 Exchange Rate Service Statistics\n');
      console.log(`Cache Size: ${stats.size} entries`);
      console.log(`Cache TTL: ${config.exchangeRateCacheTtlMs / 1000} seconds`);
      console.log(`Circuit Breaker: ${metrics.state}`);
      console.log(`API URL: ${config.exchangeRateApiUrl}`);
      
      if (stats.entries.length > 0) {
        console.log('\nCached Rates:');
        stats.entries.forEach(entry => {
          const ageSeconds = Math.floor(entry.age / 1000);
          console.log(`  ${entry.from}/${entry.to} - cached ${ageSeconds}s ago`);
        });
      }
      
      console.log('');
      return;
    }

    // Show specific rate
    if (options.from && options.to) {
      const from = (options.from as string).toUpperCase();
      const to = (options.to as string).toUpperCase();
      
      console.log(`\n💱 Fetching ${from}/${to} exchange rate...\n`);
      
      const rate = await client.getExchangeRate(from, to);
      
      console.log(`1 ${rate.from} = ${rate.rate} ${rate.to}`);
      console.log(`Timestamp: ${new Date(rate.timestamp).toISOString()}`);
      console.log('');
      return;
    }

    // Show batch rates (default or --batch flag)
    console.log('\n💱 Exchange Rates (GAP-007)\n');
    
    const pairs: [string, string][] = [
      ['USDC', 'USD'],
      ['ETH', 'USD'],
      ['BTC', 'USD'],
      ['MATIC', 'USD'],
      ['DAI', 'USD'],
      ['USDT', 'USD'],
    ];
    
    const rates = await client.getBatchExchangeRates(pairs);
    
    console.log('Supported Cryptocurrencies:');
    rates.forEach(rate => {
      const rateStr = rate.rate.toFixed(rate.from === 'BTC' ? 2 : 4);
      console.log(`  1 ${rate.from.padEnd(6)} = ${rateStr.padStart(12)} ${rate.to}`);
    });
    
    console.log('\nCache Statistics:');
    const stats = client.getCacheStats();
    console.log(`  Cached Entries: ${stats.size}`);
    console.log(`  Cache TTL: ${config.exchangeRateCacheTtlMs / 1000} seconds`);
    
    const metrics = client.getCircuitBreakerMetrics();
    console.log('\nCircuit Breaker:');
    console.log(`  State: ${metrics.state}`);
    console.log(`  Successes: ${metrics.successes}`);
    console.log(`  Failures: ${metrics.failures}`);
    
    console.log('');
  } catch (error) {
    logger.error('Failed to fetch exchange rates', { 
      error: error instanceof Error ? error.message : String(error),
    });
    console.error(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}\n`);
    throw error;
  } finally {
    client.destroy();
  }
}

export async function backtestCommand(options: Record<string, unknown>): Promise<void> {
  try {
    // Validate required parameters
    const strategyId = options.strategy as string;
    const startDate = options.start as string;
    const endDate = options.end as string;
    const markets = options.markets as string;

    if (!strategyId) {
      console.error('Error: --strategy is required (e.g., random, arbitrage, mean-reversion, market-making)');
      process.exit(1);
    }
    if (!startDate || !endDate) {
      console.error('Error: --start and --end dates are required (ISO format)');
      process.exit(1);
    }
    if (!markets) {
      console.error('Error: --markets is required (comma-separated market IDs)');
      process.exit(1);
    }

    // Parse optional parameters
    const initialBalance = options.balance ? parseFloat(options.balance as string) : 10000;
    const slippage = options.slippage ? parseFloat(options.slippage as string) : 0.01;
    const feeRate = options.feeRate ? parseFloat(options.feeRate as string) : 0.002;
    const seed = options.seed ? parseInt(options.seed as string, 10) : undefined;
    const marketIds = markets
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m.length > 0);

    if (marketIds.length === 0) {
      console.error('Error: --markets must include at least one valid market ID');
      process.exit(1);
    }
    // Parse strategy config if provided
    let strategyConfig: Record<string, unknown> = {};
    if (options.config) {
      try {
        strategyConfig = JSON.parse(options.config as string);
      } catch (error) {
        console.error('Error: Invalid JSON for --config parameter');
        process.exit(1);
      }
    }

    console.log('\n🧪 Starting Backtest');
    console.log('==================\n');
    console.log(`Strategy:        ${strategyId}`);
    console.log(`Markets:         ${marketIds.join(', ')}`);
    console.log(`Period:          ${startDate} to ${endDate}`);
    console.log(`Initial Balance: $${initialBalance.toFixed(2)}`);
    console.log(`Slippage:        ${(slippage * 100).toFixed(2)}%`);
    console.log(`Fee Rate:        ${(feeRate * 100).toFixed(2)}%`);
    if (seed) console.log(`Seed:            ${seed}`);
    console.log('');

    // Initialize components
    registerStrategies();
    const eventStore = new EventStore();
    const backtestEngine = new BacktestEngine({ eventStore });

    // Run backtest
    const backtestId = await backtestEngine.runBacktest({
      strategyId,
      strategyConfig: { ...strategyConfig, seed: seed ?? strategyConfig?.seed },
      startDate,
      endDate,
      markets: marketIds,
      initialBalance,
      slippage,
      feeRate,
      seed: seed ?? strategyConfig?.seed,
    });

    // Get results
    const result = backtestEngine.getBacktest(backtestId);
    
    if (!result) {
      console.error('✗ Backtest failed - no results available');
      process.exit(1);
    }

    // Display results
    console.log('✓ Backtest Complete\n');
    console.log('Results');
    console.log('=======\n');
    console.log(`Backtest ID:     ${result.backtestId}`);
    console.log(`Completed:       ${new Date(result.completedAt).toLocaleString()}\n`);
    
    console.log('Performance Metrics:');
    console.log(`  Total PnL:      $${result.metrics.pnl.toFixed(2)}`);
    console.log(`  Return:         ${((result.metrics.pnl / initialBalance) * 100).toFixed(2)}%`);
    console.log(`  Sharpe Ratio:   ${result.metrics.sharpe.toFixed(3)}`);
    console.log(`  Max Drawdown:   ${(result.metrics.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`  Win Rate:       ${(result.metrics.winRate * 100).toFixed(2)}%`);
    console.log(`  Total Trades:   ${result.metrics.totalTrades}`);
    console.log(`  Avg Trade Size: ${result.metrics.avgTradeSize.toFixed(2)}`);
    console.log('');

    // Show recent trades
    if (result.trades.length > 0) {
      console.log('Recent Trades (last 5):');
      const recentTrades = result.trades.slice(-5);
      recentTrades.forEach(trade => {
        const sign = trade.pnl >= 0 ? '+' : '';
        console.log(`  ${new Date(trade.timestamp).toLocaleTimeString()} | ${trade.side.toUpperCase().padEnd(4)} | ` +
          `Price: ${trade.price.toFixed(4)} | Size: ${trade.size.toString().padStart(3)} | ` +
          `PnL: ${sign}$${trade.pnl.toFixed(2)}`);
      });
      console.log('');
    }

    // Cleanup
    backtestEngine.close();
    eventStore.close();
    
    console.log('✓ Results saved to backtest database\n');
  } catch (error) {
    logger.error('Backtest command failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    console.error(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}\n`);
    throw error;
  }
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
    case 'backup': {
      await backupCommand(options);
      break;
    }
    case 'rates': {
      await ratesCommand(options);
      break;
    }
    case 'backtest': {
      await backtestCommand(options);
      break;
    }
    default:
      console.log('Usage:');
      console.log('  npm run markets [--limit <number>]');
      console.log('  npm run book --tokenId <token_id>');
      console.log('  npm run kill');
      console.log('  npm run backup [--list]');
      console.log('  npm run rates [--from <currency> --to <currency>] [--batch] [--stats]');
      console.log('  npm run backtest --strategy <type> --start <date> --end <date> --markets <ids>');
      console.log('    [--balance <number>] [--slippage <number>] [--feeRate <number>]');
      console.log('    [--seed <number>] [--config <json>]');
      process.exit(1);
  }
}
