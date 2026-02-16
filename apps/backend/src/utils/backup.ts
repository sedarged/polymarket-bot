/**
 * Database Backup Utility
 * 
 * Provides automated backup functionality for SQLite databases with support for:
 * - Multiple storage backends (local filesystem, S3, GCS, Azure Blob Storage)
 * - Compression (gzip)
 * - Rotation and retention policies
 * - Alerting on failure
 * 
 * Addresses Gap PA-006: No state backup
 * Issue #406 [GAP-017]: DB Backup Script
 */

import fs from 'fs';
import path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { logger } from './logger';
import { AlertingService } from './alerting';
import Database from 'better-sqlite3';

export interface BackupConfig {
  /**
   * Storage backend: 'local' | 's3' | 'gcs' | 'azure'
   */
  storageType: 'local' | 's3' | 'gcs' | 'azure';

  /**
   * Local filesystem path for backups (used for local storage or as temp dir for cloud uploads)
   */
  localPath?: string;

  /**
   * S3 configuration (required if storageType === 's3')
   */
  s3?: {
    bucket: string;
    region: string;
    prefix?: string; // S3 key prefix (e.g., 'backups/')
    accessKeyId?: string; // Optional, uses AWS SDK default credentials if not provided
    secretAccessKey?: string;
  };

  /**
   * GCS configuration (required if storageType === 'gcs')
   */
  gcs?: {
    bucket: string;
    projectId: string;
    keyFilename?: string; // Path to service account key JSON
    prefix?: string;
  };

  /**
   * Azure Blob Storage configuration (required if storageType === 'azure')
   */
  azure?: {
    connectionString?: string;
    accountName?: string;
    accountKey?: string;
    containerName: string;
    prefix?: string;
  };

  /**
   * Compression settings
   */
  compress?: boolean; // Default: true

  /**
   * Retention settings
   */
  retention?: {
    maxBackups?: number; // Maximum number of backups to keep (default: 30)
    maxAgeDays?: number; // Maximum age of backups in days (default: 90)
  };

  /**
   * Database paths to backup
   */
  databases: Array<{
    name: string; // Logical name (e.g., 'audit', 'events', 'signals')
    path: string; // Filesystem path to the .db file
  }>;

  /**
   * Alerting service (optional, for failure notifications)
   */
  alertingService?: AlertingService;
}

export interface BackupResult {
  success: boolean;
  backupName: string;
  database: string;
  timestamp: string;
  size: number; // Size in bytes
  location: string; // Local path or cloud URL
  error?: string;
}

export type { BackupConfig };

export class BackupService {
  private config: BackupConfig;
  private alerting?: AlertingService;

  constructor(config: BackupConfig) {
    this.config = {
      ...config,
      compress: config.compress ?? true,
      retention: {
        maxBackups: config.retention?.maxBackups ?? 30,
        maxAgeDays: config.retention?.maxAgeDays ?? 90,
      },
    };
    this.alerting = config.alertingService;

    // Validate configuration
    this.validateConfig();
  }

  private validateConfig(): void {
    if (this.config.databases.length === 0) {
      throw new Error('At least one database must be configured for backup');
    }

    if (this.config.storageType === 's3' && !this.config.s3) {
      throw new Error('S3 configuration required when storageType is "s3"');
    }

    if (this.config.storageType === 'gcs' && !this.config.gcs) {
      throw new Error('GCS configuration required when storageType is "gcs"');
    }

    if (this.config.storageType === 'azure' && !this.config.azure) {
      throw new Error('Azure configuration required when storageType is "azure"');
    }

    if (this.config.storageType === 'local' && !this.config.localPath) {
      throw new Error('Local path required when storageType is "local"');
    }
  }

  /**
   * Perform backup of all configured databases
   */
  async backup(): Promise<BackupResult[]> {
    logger.info('Starting database backup', {
      storageType: this.config.storageType,
      databases: this.config.databases.map((db) => db.name),
    });

    const results: BackupResult[] = [];

    for (const database of this.config.databases) {
      try {
        const result = await this.backupDatabase(database);
        results.push(result);

        if (result.success) {
          logger.info('Database backup completed', {
            database: result.database,
            size: result.size,
            location: result.location,
          });
        } else {
          logger.error('Database backup failed', {
            database: result.database,
            error: result.error,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Database backup failed with exception', {
          database: database.name,
          error: errorMessage,
        });

        results.push({
          success: false,
          backupName: '',
          database: database.name,
          timestamp: new Date().toISOString(),
          size: 0,
          location: '',
          error: errorMessage,
        });

        // Send alert on failure
        if (this.alerting) {
          await this.alerting.sendAlert(
            `Database backup failed for ${database.name}: ${errorMessage}`,
            'error'
          );
        }
      }
    }

    // Clean up old backups
    try {
      await this.cleanupOldBackups();
    } catch (error) {
      logger.error('Failed to clean up old backups', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return results;
  }

  /**
   * Backup a single database
   */
  private async backupDatabase(
    database: { name: string; path: string }
  ): Promise<BackupResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = this.config.compress ? '.db.gz' : '.db';
    
    // Sanitize database name to prevent path traversal attacks
    const sanitizedName = database.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const backupName = `${sanitizedName}-${timestamp}${extension}`;

    // Check if database file exists
    if (!fs.existsSync(database.path)) {
      throw new Error(`Database file not found: ${database.path}`);
    }

    // Create temporary backup using SQLite backup API
    const tempBackupPath = path.join(
      this.config.localPath || '/tmp',
      `temp-${backupName.replace('.gz', '')}`
    );

    // Ensure directory exists
    const tempDir = path.dirname(tempBackupPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Create a consistent backup using SQLite checkpoint and copy
    // This is safer and more compatible than using the backup API
    let sourceDb: Database.Database | null = null;
    
    try {
      // Open the source database in readonly mode to avoid interfering with the running bot
      sourceDb = new Database(database.path, { readonly: true });
      
      // Check if database is in WAL mode
      const walMode = sourceDb.pragma('journal_mode', { simple: true });
      sourceDb.close();
      sourceDb = null;
      
      // If in WAL mode, checkpoint before backup to ensure complete snapshot
      if (walMode === 'wal') {
        // Need write access for checkpoint
        sourceDb = new Database(database.path, { readonly: false });
        
        try {
          // TRUNCATE mode ensures WAL is fully checkpointed and emptied
          const result = sourceDb.pragma('wal_checkpoint(TRUNCATE)', { simple: true });
          logger.debug('WAL checkpoint completed', {
            database: database.name,
            result,
          });
        } catch (err) {
          logger.warn('WAL checkpoint failed, backup may be incomplete', {
            database: database.name,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        
        sourceDb.close();
        sourceDb = null;
      }
      
      // Now copy the main DB file
      fs.copyFileSync(database.path, tempBackupPath);
      
      // If in WAL mode, also copy WAL and SHM files if they exist (for extra safety)
      if (walMode === 'wal') {
        const walPath = `${database.path}-wal`;
        const shmPath = `${database.path}-shm`;
        
        if (fs.existsSync(walPath)) {
          fs.copyFileSync(walPath, `${tempBackupPath}-wal`);
          logger.debug('Copied WAL file', { database: database.name });
        }
        if (fs.existsSync(shmPath)) {
          fs.copyFileSync(shmPath, `${tempBackupPath}-shm`);
          logger.debug('Copied SHM file', { database: database.name });
        }
      }

      // Get file size before compression
      const stats = fs.statSync(tempBackupPath);
      let backupSize = stats.size;

      // Compress if enabled
      let finalBackupPath = tempBackupPath;
      if (this.config.compress) {
        finalBackupPath = `${tempBackupPath}.gz`;
        await this.compressFile(tempBackupPath, finalBackupPath);
        
        // Update size and remove uncompressed file
        backupSize = fs.statSync(finalBackupPath).size;
        fs.unlinkSync(tempBackupPath);
        
        // Clean up WAL/SHM files if they exist
        if (fs.existsSync(`${tempBackupPath}-wal`)) {
          fs.unlinkSync(`${tempBackupPath}-wal`);
        }
        if (fs.existsSync(`${tempBackupPath}-shm`)) {
          fs.unlinkSync(`${tempBackupPath}-shm`);
        }
      }

      // Upload to storage backend
      const location = await this.uploadBackup(finalBackupPath, backupName);

      // Clean up local file if uploaded to cloud
      if (this.config.storageType !== 'local') {
        fs.unlinkSync(finalBackupPath);
      }

      return {
        success: true,
        backupName,
        database: database.name,
        timestamp: new Date().toISOString(),
        size: backupSize,
        location,
      };
    } catch (error) {
      // Clean up on failure
      try {
        if (sourceDb) sourceDb.close();
      } catch (closeErr) {
        logger.debug('Error closing source database during cleanup', {
          error: closeErr instanceof Error ? closeErr.message : String(closeErr),
        });
      }
      
      if (fs.existsSync(tempBackupPath)) {
        try {
          fs.unlinkSync(tempBackupPath);
        } catch (unlinkErr) {
          logger.debug('Error deleting temp backup file during cleanup', {
            path: tempBackupPath,
            error: unlinkErr instanceof Error ? unlinkErr.message : String(unlinkErr),
          });
        }
      }
      if (fs.existsSync(`${tempBackupPath}.gz`)) {
        try {
          fs.unlinkSync(`${tempBackupPath}.gz`);
        } catch (unlinkErr) {
          logger.debug('Error deleting compressed temp backup during cleanup', {
            path: `${tempBackupPath}.gz`,
            error: unlinkErr instanceof Error ? unlinkErr.message : String(unlinkErr),
          });
        }
      }
      
      throw error;
    }
  }

  /**
   * Compress a file using gzip
   */
  private async compressFile(sourcePath: string, destPath: string): Promise<void> {
    const source = fs.createReadStream(sourcePath);
    const destination = fs.createWriteStream(destPath);
    const gzip = createGzip({ level: 9 }); // Maximum compression

    await pipeline(source, gzip, destination);
  }

  /**
   * Upload backup to configured storage backend
   */
  private async uploadBackup(filePath: string, backupName: string): Promise<string> {
    switch (this.config.storageType) {
      case 'local':
        return this.uploadToLocal(filePath, backupName);
      case 's3':
        return this.uploadToS3(filePath, backupName);
      case 'gcs':
        return this.uploadToGCS(filePath, backupName);
      case 'azure':
        return this.uploadToAzure(filePath, backupName);
      default:
        throw new Error(`Unknown storage type: ${this.config.storageType}`);
    }
  }

  /**
   * Upload to local filesystem
   */
  private async uploadToLocal(filePath: string, backupName: string): Promise<string> {
    const destPath = path.join(this.config.localPath!, backupName);
    const destDir = path.dirname(destPath);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Move file to destination
    fs.renameSync(filePath, destPath);

    return destPath;
  }

  /**
   * Upload to AWS S3
   */
  private async uploadToS3(filePath: string, backupName: string): Promise<string> {
    // Import AWS SDK dynamically (only if needed)
    try {
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      
      const s3Config = this.config.s3!;
      const client = new S3Client({
        region: s3Config.region,
        credentials: s3Config.accessKeyId && s3Config.secretAccessKey
          ? {
              accessKeyId: s3Config.accessKeyId,
              secretAccessKey: s3Config.secretAccessKey,
            }
          : undefined, // Use default credentials if not provided
      });

      const key = s3Config.prefix
        ? `${s3Config.prefix}${backupName}`
        : backupName;

      const fileStream = fs.createReadStream(filePath);
      const uploadParams = {
        Bucket: s3Config.bucket,
        Key: key,
        Body: fileStream,
        ServerSideEncryption: 'AES256' as const, // Enable server-side encryption
      };

      await client.send(new PutObjectCommand(uploadParams));

      return `s3://${s3Config.bucket}/${key}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
        throw new Error(
          'AWS SDK not installed. Run: npm install @aws-sdk/client-s3'
        );
      }
      throw error;
    }
  }

  /**
   * Upload to Google Cloud Storage
   */
  private async uploadToGCS(filePath: string, backupName: string): Promise<string> {
    try {
      const { Storage } = await import('@google-cloud/storage');
      
      const gcsConfig = this.config.gcs!;
      const storage = new Storage({
        projectId: gcsConfig.projectId,
        keyFilename: gcsConfig.keyFilename,
      });

      const bucket = storage.bucket(gcsConfig.bucket);
      const key = gcsConfig.prefix
        ? `${gcsConfig.prefix}${backupName}`
        : backupName;

      await bucket.upload(filePath, {
        destination: key,
        metadata: {
          contentType: 'application/gzip',
        },
      });

      return `gs://${gcsConfig.bucket}/${key}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
        throw new Error(
          'Google Cloud Storage SDK not installed. Run: npm install @google-cloud/storage'
        );
      }
      throw error;
    }
  }

  /**
   * Upload to Azure Blob Storage
   */
  private async uploadToAzure(filePath: string, backupName: string): Promise<string> {
    try {
      const { BlobServiceClient, StorageSharedKeyCredential } = await import('@azure/storage-blob');
      
      const azureConfig = this.config.azure!;
      let blobServiceClient: any;

      if (azureConfig.connectionString) {
        blobServiceClient = BlobServiceClient.fromConnectionString(
          azureConfig.connectionString
        );
      } else if (azureConfig.accountName && azureConfig.accountKey) {
        const sharedKeyCredential = new StorageSharedKeyCredential(
          azureConfig.accountName,
          azureConfig.accountKey
        );
        blobServiceClient = new BlobServiceClient(
          `https://${azureConfig.accountName}.blob.core.windows.net`,
          sharedKeyCredential
        );
      } else {
        throw new Error(
          'Azure configuration requires either connectionString or accountName+accountKey'
        );
      }

      const containerClient = blobServiceClient.getContainerClient(
        azureConfig.containerName
      );

      const blobName = azureConfig.prefix
        ? `${azureConfig.prefix}${backupName}`
        : backupName;

      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      
      const fileStream = fs.createReadStream(filePath);
      const stats = fs.statSync(filePath);
      
      await blockBlobClient.uploadStream(
        fileStream,
        stats.size,
        5, // Max concurrency
        {
          blobHTTPHeaders: {
            blobContentType: 'application/gzip',
          },
        }
      );

      return `https://${azureConfig.accountName || 'account'}.blob.core.windows.net/${azureConfig.containerName}/${blobName}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
        throw new Error(
          'Azure Storage SDK not installed. Run: npm install @azure/storage-blob'
        );
      }
      throw error;
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  private async cleanupOldBackups(): Promise<void> {
    logger.info('Cleaning up old backups', {
      maxBackups: this.config.retention?.maxBackups,
      maxAgeDays: this.config.retention?.maxAgeDays,
    });

    switch (this.config.storageType) {
      case 'local':
        await this.cleanupLocalBackups();
        break;
      case 's3':
        await this.cleanupS3Backups();
        break;
      case 'gcs':
        await this.cleanupGCSBackups();
        break;
      case 'azure':
        await this.cleanupAzureBackups();
        break;
    }
  }

  /**
   * Helper to extract database name from backup filename
   */
  private extractDatabaseName(filename: string): string {
    // Extract the database name from backup filename pattern: dbname-timestamp.db(.gz)
    // Handle both local filenames and S3 keys (with prefix)
    const baseName = filename.split('/').pop() || filename;
    const match = baseName.match(/^([a-zA-Z0-9_-]+)-\d{4}-\d{2}-\d{2}T/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Helper to group backups by database name for per-database retention
   */
  private groupBackupsByDatabase(filenames: string[]): Map<string, string[]> {
    const grouped = new Map<string, string[]>();
    
    for (const filename of filenames) {
      const dbName = this.extractDatabaseName(filename);
      if (!grouped.has(dbName)) {
        grouped.set(dbName, []);
      }
      grouped.get(dbName)!.push(filename);
    }
    
    // Sort each group by timestamp (newest first)
    for (const [, backups] of grouped) {
      backups.sort((a, b) => b.localeCompare(a)); // Timestamp in filename sorts correctly
    }
    
    return grouped;
  }

  /**
   * Clean up old local backups
   */
  private async cleanupLocalBackups(): Promise<void> {
    const backupDir = this.config.localPath!;
    if (!fs.existsSync(backupDir)) {
      return;
    }

    // Only consider files matching backup naming pattern to avoid deleting live DBs
    const backupPattern = /^[a-zA-Z0-9_-]+-\d{4}-\d{2}-\d{2}T.*\.(db|db\.gz)$/;
    
    const files = fs.readdirSync(backupDir)
      .filter((file) => backupPattern.test(file))
      .map((file) => ({
        name: file,
        path: path.join(backupDir, file),
        stats: fs.statSync(path.join(backupDir, file)),
      }))
      .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime()); // Newest first

    // Group by database name for per-database retention
    const backupsByDb = this.groupBackupsByDatabase(files.map(f => f.name));
    
    const maxAge = this.config.retention!.maxAgeDays! * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const file of files) {
      const dbName = this.extractDatabaseName(file.name);
      const dbBackups = backupsByDb.get(dbName) || [];
      const indexInDb = dbBackups.indexOf(file.name);
      
      const shouldDelete =
        (this.config.retention!.maxBackups && 
         indexInDb >= this.config.retention!.maxBackups) ||
        (this.config.retention!.maxAgeDays &&
         now - file.stats.mtime.getTime() > maxAge);

      if (shouldDelete) {
        logger.info('Deleting old backup', { file: file.name, database: dbName });
        fs.unlinkSync(file.path);
      }
    }
  }

  /**
   * Clean up old S3 backups
   */
  private async cleanupS3Backups(): Promise<void> {
    try {
      const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      
      const s3Config = this.config.s3!;
      const client = new S3Client({
        region: s3Config.region,
        credentials: s3Config.accessKeyId && s3Config.secretAccessKey
          ? {
              accessKeyId: s3Config.accessKeyId,
              secretAccessKey: s3Config.secretAccessKey,
            }
          : undefined,
      });

      // Retrieve all objects from S3, handling pagination to ensure retention applies to every backup
      const allObjects: any[] = [];
      let continuationToken: string | undefined = undefined;

      do {
        const listResponse = await client.send(
          new ListObjectsV2Command({
            Bucket: s3Config.bucket,
            Prefix: s3Config.prefix || '',
            ContinuationToken: continuationToken,
          }),
        );

        if (listResponse.Contents && listResponse.Contents.length > 0) {
          allObjects.push(...listResponse.Contents);
        }

        continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
      } while (continuationToken);

      const objects = allObjects
        .filter((obj) => obj.Key?.endsWith('.db') || obj.Key?.endsWith('.db.gz'))
        .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0));

      // Group backups by database name for per-database retention
      const backupsByDb = this.groupBackupsByDatabase(objects.map(obj => obj.Key || ''));
      
      const maxAge = this.config.retention!.maxAgeDays! * 24 * 60 * 60 * 1000;
      const now = Date.now();

      for (const obj of objects) {
        if (!obj.Key) continue;
        
        const dbName = this.extractDatabaseName(obj.Key);
        const dbBackups = backupsByDb.get(dbName) || [];
        const indexInDb = dbBackups.indexOf(obj.Key);
        
        const shouldDelete =
          (this.config.retention!.maxBackups && 
           indexInDb >= this.config.retention!.maxBackups) ||
          (this.config.retention!.maxAgeDays &&
           obj.LastModified &&
           now - obj.LastModified.getTime() > maxAge);

        if (shouldDelete) {
          logger.info('Deleting old S3 backup', { key: obj.Key, database: dbName });
          await client.send(new DeleteObjectCommand({
            Bucket: s3Config.bucket,
            Key: obj.Key,
          }));
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup S3 backups', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clean up old GCS backups
   */
  private async cleanupGCSBackups(): Promise<void> {
    try {
      const { Storage } = await import('@google-cloud/storage');
      
      const gcsConfig = this.config.gcs!;
      const storage = new Storage({
        projectId: gcsConfig.projectId,
        keyFilename: gcsConfig.keyFilename,
      });

      const bucket = storage.bucket(gcsConfig.bucket);
      const [files] = await bucket.getFiles({
        prefix: gcsConfig.prefix || '',
      });

      const backups = files
        .filter((file) => file.name.endsWith('.db') || file.name.endsWith('.db.gz'))
        .sort((a, b) => {
          const aTime = a.metadata.updated ? new Date(a.metadata.updated).getTime() : 0;
          const bTime = b.metadata.updated ? new Date(b.metadata.updated).getTime() : 0;
          return bTime - aTime;
        });

      const maxAge = this.config.retention!.maxAgeDays! * 24 * 60 * 60 * 1000;
      const now = Date.now();

      for (const file of backups) {
        const fileTime = file.metadata.updated 
          ? new Date(file.metadata.updated).getTime() 
          : 0;

        const shouldDelete =
          (this.config.retention!.maxBackups && 
           backups.indexOf(file) >= this.config.retention!.maxBackups) ||
          (this.config.retention!.maxAgeDays &&
           now - fileTime > maxAge);

        if (shouldDelete) {
          logger.info('Deleting old GCS backup', { file: file.name });
          await file.delete();
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup GCS backups', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clean up old Azure backups
   */
  private async cleanupAzureBackups(): Promise<void> {
    try {
      const { BlobServiceClient, StorageSharedKeyCredential } = await import('@azure/storage-blob');
      
      const azureConfig = this.config.azure!;
      let blobServiceClient: any;

      if (azureConfig.connectionString) {
        blobServiceClient = BlobServiceClient.fromConnectionString(
          azureConfig.connectionString
        );
      } else if (azureConfig.accountName && azureConfig.accountKey) {
        const sharedKeyCredential = new StorageSharedKeyCredential(
          azureConfig.accountName,
          azureConfig.accountKey
        );
        blobServiceClient = new BlobServiceClient(
          `https://${azureConfig.accountName}.blob.core.windows.net`,
          sharedKeyCredential
        );
      } else {
        return;
      }

      const containerClient = blobServiceClient.getContainerClient(
        azureConfig.containerName
      );

      const blobs: Array<{ name: string; lastModified?: Date }> = [];
      for await (const blob of containerClient.listBlobsFlat({
        prefix: azureConfig.prefix || '',
      })) {
        if (blob.name.endsWith('.db') || blob.name.endsWith('.db.gz')) {
          blobs.push({
            name: blob.name,
            lastModified: blob.properties.lastModified,
          });
        }
      }

      blobs.sort((a, b) => {
        const aTime = a.lastModified?.getTime() || 0;
        const bTime = b.lastModified?.getTime() || 0;
        return bTime - aTime;
      });

      const maxAge = this.config.retention!.maxAgeDays! * 24 * 60 * 60 * 1000;
      const now = Date.now();

      for (const blob of blobs) {
        const blobTime = blob.lastModified?.getTime() || 0;

        const shouldDelete =
          (this.config.retention!.maxBackups && 
           blobs.indexOf(blob) >= this.config.retention!.maxBackups) ||
          (this.config.retention!.maxAgeDays &&
           now - blobTime > maxAge);

        if (shouldDelete) {
          logger.info('Deleting old Azure backup', { blob: blob.name });
          const blobClient = containerClient.getBlobClient(blob.name);
          await blobClient.delete();
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup Azure backups', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * List all backups
   */
  async listBackups(): Promise<Array<{ name: string; size: number; date: Date }>> {
    switch (this.config.storageType) {
      case 'local':
        return this.listLocalBackups();
      case 's3':
        return this.listS3Backups();
      case 'gcs':
        return this.listGCSBackups();
      case 'azure':
        return this.listAzureBackups();
      default:
        return [];
    }
  }

  private async listLocalBackups(): Promise<Array<{ name: string; size: number; date: Date }>> {
    const backupDir = this.config.localPath!;
    if (!fs.existsSync(backupDir)) {
      return [];
    }

    return fs.readdirSync(backupDir)
      .filter((file) => file.endsWith('.db') || file.endsWith('.db.gz'))
      .map((file) => {
        const stats = fs.statSync(path.join(backupDir, file));
        return {
          name: file,
          size: stats.size,
          date: stats.mtime,
        };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  private async listS3Backups(): Promise<Array<{ name: string; size: number; date: Date }>> {
    try {
      const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      
      const s3Config = this.config.s3!;
      const client = new S3Client({
        region: s3Config.region,
        credentials: s3Config.accessKeyId && s3Config.secretAccessKey
          ? {
              accessKeyId: s3Config.accessKeyId,
              secretAccessKey: s3Config.secretAccessKey,
            }
          : undefined,
      });

      const response = await client.send(new ListObjectsV2Command({
        Bucket: s3Config.bucket,
        Prefix: s3Config.prefix || '',
      }));

      return (response.Contents || [])
        .filter((obj) => obj.Key?.endsWith('.db') || obj.Key?.endsWith('.db.gz'))
        .map((obj) => ({
          name: obj.Key || '',
          size: obj.Size || 0,
          date: obj.LastModified || new Date(),
        }))
        .sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (error) {
      logger.error('Failed to list S3 backups', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async listGCSBackups(): Promise<Array<{ name: string; size: number; date: Date }>> {
    try {
      const { Storage } = await import('@google-cloud/storage');
      
      const gcsConfig = this.config.gcs!;
      const storage = new Storage({
        projectId: gcsConfig.projectId,
        keyFilename: gcsConfig.keyFilename,
      });

      const bucket = storage.bucket(gcsConfig.bucket);
      const [files] = await bucket.getFiles({
        prefix: gcsConfig.prefix || '',
      });

      return files
        .filter((file) => file.name.endsWith('.db') || file.name.endsWith('.db.gz'))
        .map((file) => ({
          name: file.name,
          size: parseInt(file.metadata.size || '0', 10),
          date: file.metadata.updated ? new Date(file.metadata.updated) : new Date(),
        }))
        .sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (error) {
      logger.error('Failed to list GCS backups', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async listAzureBackups(): Promise<Array<{ name: string; size: number; date: Date }>> {
    try {
      const { BlobServiceClient, StorageSharedKeyCredential } = await import('@azure/storage-blob');
      
      const azureConfig = this.config.azure!;
      let blobServiceClient: any;

      if (azureConfig.connectionString) {
        blobServiceClient = BlobServiceClient.fromConnectionString(
          azureConfig.connectionString
        );
      } else if (azureConfig.accountName && azureConfig.accountKey) {
        const sharedKeyCredential = new StorageSharedKeyCredential(
          azureConfig.accountName,
          azureConfig.accountKey
        );
        blobServiceClient = new BlobServiceClient(
          `https://${azureConfig.accountName}.blob.core.windows.net`,
          sharedKeyCredential
        );
      } else {
        return [];
      }

      const containerClient = blobServiceClient.getContainerClient(
        azureConfig.containerName
      );

      const backups: Array<{ name: string; size: number; date: Date }> = [];
      for await (const blob of containerClient.listBlobsFlat({
        prefix: azureConfig.prefix || '',
      })) {
        if (blob.name.endsWith('.db') || blob.name.endsWith('.db.gz')) {
          backups.push({
            name: blob.name,
            size: blob.properties.contentLength || 0,
            date: blob.properties.lastModified || new Date(),
          });
        }
      }

      return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (error) {
      logger.error('Failed to list Azure backups', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
