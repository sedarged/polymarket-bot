import { GammaClient } from '../clients/gamma';
import { ClobClient } from '../clients/clob';
import { logger } from '../utils/logger';
import { calculateOrderbookSummary, formatOrderbookSummary } from '../utils/orderbook';
import { Token } from '@polymarket/shared';
import { config } from '../config';
import { BackupService, BackupConfig } from '../utils/backup';
import { AlertingService } from '../utils/alerting';
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
    default:
      console.log('Usage:');
      console.log('  npm run markets [--limit <number>]');
      console.log('  npm run book --tokenId <token_id>');
      console.log('  npm run kill');
      console.log('  npm run backup [--list]');
      process.exit(1);
  }
}
