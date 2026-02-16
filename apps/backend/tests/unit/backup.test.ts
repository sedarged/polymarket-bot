import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BackupService } from '../../src/utils/backup';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

describe('BackupService - Issue #406 [GAP-017]', () => {
  const testDir = path.join(process.cwd(), 'data', 'test-backup');
  const backupDir = path.join(testDir, 'backups');
  const testDbPath = path.join(testDir, 'test.db');

  beforeEach(() => {
    // Clean up test directories
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(backupDir, { recursive: true });

    // Create a test database
    const db = new Database(testDbPath);
    db.exec(`
      CREATE TABLE test_table (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        value INTEGER
      )
    `);
    
    // Insert test data
    const stmt = db.prepare('INSERT INTO test_table (name, value) VALUES (?, ?)');
    for (let i = 1; i <= 10; i++) {
      stmt.run(`test-${i}`, i * 10);
    }
    
    db.close();
  });

  afterEach(() => {
    // Clean up test directories
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Configuration Validation', () => {
    it('should throw error if no databases configured', () => {
      expect(() => {
        new BackupService({
          storageType: 'local',
          localPath: backupDir,
          databases: [],
        });
      }).toThrow('At least one database must be configured for backup');
    });

    it('should throw error if S3 config missing when storageType is s3', () => {
      expect(() => {
        new BackupService({
          storageType: 's3',
          databases: [{ name: 'test', path: testDbPath }],
        });
      }).toThrow('S3 configuration required when storageType is "s3"');
    });

    it('should throw error if GCS config missing when storageType is gcs', () => {
      expect(() => {
        new BackupService({
          storageType: 'gcs',
          databases: [{ name: 'test', path: testDbPath }],
        });
      }).toThrow('GCS configuration required when storageType is "gcs"');
    });

    it('should throw error if Azure config missing when storageType is azure', () => {
      expect(() => {
        new BackupService({
          storageType: 'azure',
          databases: [{ name: 'test', path: testDbPath }],
        });
      }).toThrow('Azure configuration required when storageType is "azure"');
    });

    it('should throw error if local path missing when storageType is local', () => {
      expect(() => {
        new BackupService({
          storageType: 'local',
          databases: [{ name: 'test', path: testDbPath }],
        });
      }).toThrow('Local path required when storageType is "local"');
    });

    it('should accept valid configuration', () => {
      expect(() => {
        new BackupService({
          storageType: 'local',
          localPath: backupDir,
          databases: [{ name: 'test', path: testDbPath }],
        });
      }).not.toThrow();
    });
  });

  describe('Local Backup', () => {
    it('should create backup of database', async () => {
      const backupService = new BackupService({
        storageType: 'local',
        localPath: backupDir,
        compress: false, // Disable compression for easier verification
        databases: [
          { name: 'test', path: testDbPath },
        ],
      });

      const results = await backupService.backup();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].database).toBe('test');
      expect(results[0].size).toBeGreaterThan(0);
      
      // Verify backup file exists
      const backupFiles = fs.readdirSync(backupDir);
      expect(backupFiles.length).toBe(1);
      expect(backupFiles[0]).toMatch(/^test-.*\.db$/);
      
      // Verify backup integrity by opening it
      const backupPath = path.join(backupDir, backupFiles[0]);
      const backupDb = new Database(backupPath, { readonly: true });
      const count = backupDb.prepare('SELECT COUNT(*) as count FROM test_table').get() as { count: number };
      expect(count.count).toBe(10);
      backupDb.close();
    });

    it('should create compressed backup when enabled', async () => {
      const backupService = new BackupService({
        storageType: 'local',
        localPath: backupDir,
        compress: true,
        databases: [
          { name: 'test', path: testDbPath },
        ],
      });

      const results = await backupService.backup();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      
      // Verify compressed backup file exists
      const backupFiles = fs.readdirSync(backupDir);
      expect(backupFiles.length).toBe(1);
      expect(backupFiles[0]).toMatch(/^test-.*\.db\.gz$/);
      
      // Compressed file should be smaller than original
      const originalSize = fs.statSync(testDbPath).size;
      expect(results[0].size).toBeLessThan(originalSize);
    });

    it('should backup multiple databases', async () => {
      // Create a second test database
      const testDb2Path = path.join(testDir, 'test2.db');
      const db2 = new Database(testDb2Path);
      db2.exec('CREATE TABLE test_table (id INTEGER PRIMARY KEY, data TEXT)');
      db2.prepare('INSERT INTO test_table (data) VALUES (?)').run('test-data');
      db2.close();

      const backupService = new BackupService({
        storageType: 'local',
        localPath: backupDir,
        compress: false,
        databases: [
          { name: 'test1', path: testDbPath },
          { name: 'test2', path: testDb2Path },
        ],
      });

      const results = await backupService.backup();

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      
      const backupFiles = fs.readdirSync(backupDir);
      expect(backupFiles.length).toBe(2);
    });

    it('should handle missing database file gracefully', async () => {
      const backupService = new BackupService({
        storageType: 'local',
        localPath: backupDir,
        databases: [
          { name: 'missing', path: '/nonexistent/database.db' },
        ],
      });

      const results = await backupService.backup();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('Database file not found');
    });
  });

  describe('Retention Policy', () => {
    it('should delete old backups based on maxBackups', async () => {
      const backupService = new BackupService({
        storageType: 'local',
        localPath: backupDir,
        compress: false,
        retention: {
          maxBackups: 3,
        },
        databases: [
          { name: 'test', path: testDbPath },
        ],
      });

      // Create 5 backups
      for (let i = 0; i < 5; i++) {
        await backupService.backup();
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const backupFiles = fs.readdirSync(backupDir);
      
      // Should only keep 3 most recent backups
      expect(backupFiles.length).toBe(3);
    });

    it('should delete old backups based on maxAgeDays', async () => {
      const backupService = new BackupService({
        storageType: 'local',
        localPath: backupDir,
        compress: false,
        retention: {
          maxAgeDays: 1, // 1 day
        },
        databases: [
          { name: 'test', path: testDbPath },
        ],
      });

      // Create a backup
      await backupService.backup();
      
      const backupFiles = fs.readdirSync(backupDir);
      expect(backupFiles.length).toBe(1);
      
      // Modify the file's mtime to be 2 days old
      const backupPath = path.join(backupDir, backupFiles[0]);
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      fs.utimesSync(backupPath, twoDaysAgo, twoDaysAgo);

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create a new backup (should trigger cleanup)
      await backupService.backup();

      const remainingFiles = fs.readdirSync(backupDir);
      
      // Should only keep the new backup (old one deleted)
      expect(remainingFiles.length).toBe(1);
      
      // Verify the old file was deleted by checking it doesn't exist
      expect(fs.existsSync(backupPath)).toBe(false);
    });
  });

  describe('List Backups', () => {
    it('should list all backups', async () => {
      const backupService = new BackupService({
        storageType: 'local',
        localPath: backupDir,
        compress: false,
        databases: [
          { name: 'test', path: testDbPath },
        ],
      });

      // Create 3 backups
      await backupService.backup();
      await new Promise(resolve => setTimeout(resolve, 100));
      await backupService.backup();
      await new Promise(resolve => setTimeout(resolve, 100));
      await backupService.backup();

      const backups = await backupService.listBackups();

      expect(backups.length).toBe(3);
      
      // Should be sorted by date (newest first)
      expect(backups[0].date.getTime()).toBeGreaterThanOrEqual(backups[1].date.getTime());
      expect(backups[1].date.getTime()).toBeGreaterThanOrEqual(backups[2].date.getTime());
      
      // Each backup should have required properties
      backups.forEach((backup) => {
        expect(backup.name).toMatch(/^test-.*\.db$/);
        expect(backup.size).toBeGreaterThan(0);
        expect(backup.date).toBeInstanceOf(Date);
      });
    });

    it('should return empty array when no backups exist', async () => {
      const backupService = new BackupService({
        storageType: 'local',
        localPath: backupDir,
        databases: [
          { name: 'test', path: testDbPath },
        ],
      });

      const backups = await backupService.listBackups();
      expect(backups).toEqual([]);
    });
  });

  describe('Alerting Integration', () => {
    it('should call alerting service on backup failure', async () => {
      const mockAlertingService = {
        sendAlert: vi.fn().mockResolvedValue(undefined),
      };

      const backupService = new BackupService({
        storageType: 'local',
        localPath: backupDir,
        databases: [
          { name: 'missing', path: '/nonexistent/database.db' },
        ],
        alertingService: mockAlertingService as any,
      });

      await backupService.backup();

      expect(mockAlertingService.sendAlert).toHaveBeenCalledWith(
        expect.stringContaining('Database backup failed for missing'),
        'error'
      );
    });

    it('should not call alerting service on successful backup', async () => {
      const mockAlertingService = {
        sendAlert: vi.fn().mockResolvedValue(undefined),
      };

      const backupService = new BackupService({
        storageType: 'local',
        localPath: backupDir,
        databases: [
          { name: 'test', path: testDbPath },
        ],
        alertingService: mockAlertingService as any,
      });

      await backupService.backup();

      expect(mockAlertingService.sendAlert).not.toHaveBeenCalled();
    });
  });

  describe('Cloud Storage Configuration', () => {
    it('should validate S3 configuration', () => {
      expect(() => {
        new BackupService({
          storageType: 's3',
          s3: {
            bucket: 'test-bucket',
            region: 'us-east-1',
          },
          databases: [
            { name: 'test', path: testDbPath },
          ],
        });
      }).not.toThrow();
    });

    it('should validate GCS configuration', () => {
      expect(() => {
        new BackupService({
          storageType: 'gcs',
          gcs: {
            bucket: 'test-bucket',
            projectId: 'test-project',
          },
          databases: [
            { name: 'test', path: testDbPath },
          ],
        });
      }).not.toThrow();
    });

    it('should validate Azure configuration with connection string', () => {
      expect(() => {
        new BackupService({
          storageType: 'azure',
          azure: {
            connectionString: 'DefaultEndpointsProtocol=https;...',
            containerName: 'backups',
          },
          databases: [
            { name: 'test', path: testDbPath },
          ],
        });
      }).not.toThrow();
    });

    it('should validate Azure configuration with account name and key', () => {
      expect(() => {
        new BackupService({
          storageType: 'azure',
          azure: {
            accountName: 'testaccount',
            accountKey: 'testkey',
            containerName: 'backups',
          },
          databases: [
            { name: 'test', path: testDbPath },
          ],
        });
      }).not.toThrow();
    });
  });

  describe('Backup Result', () => {
    it('should return complete backup result', async () => {
      const backupService = new BackupService({
        storageType: 'local',
        localPath: backupDir,
        compress: false,
        databases: [
          { name: 'test', path: testDbPath },
        ],
      });

      const results = await backupService.backup();
      const result = results[0];

      expect(result).toMatchObject({
        success: true,
        database: 'test',
      });
      expect(result.backupName).toMatch(/^test-.*\.db$/);
      expect(result.timestamp).toBeTruthy();
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
      expect(result.size).toBeGreaterThan(0);
      expect(result.location).toContain(backupDir);
    });

    it('should return error in result on failure', async () => {
      const backupService = new BackupService({
        storageType: 'local',
        localPath: backupDir,
        databases: [
          { name: 'missing', path: '/nonexistent/database.db' },
        ],
      });

      const results = await backupService.backup();
      const result = results[0];

      expect(result).toMatchObject({
        success: false,
        database: 'missing',
      });
      expect(result.error).toBeTruthy();
      expect(result.error).toContain('Database file not found');
    });
  });
});
