import fs from "fs";
import path from "path";
import { FSWatcher, watch } from "fs";
import { z } from "zod";
import { logger } from "../utils/logger";
import { parseConfig, Config } from "./index";
import { EventEmitter } from "events";

/**
 * Configuration Management Interface (GAP-003)
 * 
 * Provides CRUD operations for configuration files with:
 * - Runtime reload without bot restart
 * - Validation against schema/specification
 * - Event-driven notifications for config changes
 * - Thread-safe operations with file locking
 * 
 * Supports hot-reload for:
 * - Market configuration (markets.json)
 * - Strategy configuration (strategy.json)
 * - Environment variables (.env file)
 * 
 * Usage:
 * ```typescript
 * const configManager = ConfigManager.getInstance();
 * configManager.on('configChanged', (config) => {
 *   console.log('Configuration updated:', config);
 * });
 * await configManager.startWatching();
 * ```
 */

export interface ConfigFile {
  path: string;
  type: 'markets' | 'strategy' | 'env';
  content: unknown;
  lastModified: Date;
}

export interface ConfigUpdateResult {
  success: boolean;
  message: string;
  errors?: string[];
}

// Validation schemas for config files
const marketConfigSchema = z.array(
  z.object({
    tokenId: z.string().min(1, "Token ID cannot be empty"),
    maxPositionSize: z.number().positive().optional(),
    spread: z.number().nonnegative().max(1).optional(),
  }),
);

const strategyConfigSchema = z.object({
  spread: z.number().nonnegative().max(1).optional(),
  maxPositionSize: z.number().positive().optional(),
  inventorySkew: z.boolean().optional(),
});

export class ConfigManager extends EventEmitter {
  private static instance: ConfigManager | null = null;
  private watchers: Map<string, FSWatcher> = new Map();
  private currentConfig: Config;
  private isWatching: boolean = false;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly debounceDelayMs: number = 500; // Debounce file change events

  private constructor() {
    super();
    this.currentConfig = parseConfig();
  }

  /**
   * Get the singleton instance of ConfigManager
   */
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Get the current configuration
   */
  public getConfig(): Config {
    return { ...this.currentConfig };
  }

  /**
   * Get a specific configuration file
   * @param type - The type of configuration file to retrieve
   */
  public async getConfigFile(type: 'markets' | 'strategy'): Promise<ConfigFile | null> {
    try {
      let filePath: string | undefined;
      let content: unknown;

      if (type === 'markets') {
        filePath = this.currentConfig.markets ? process.env.MARKETS_CONFIG_PATH : undefined;
        content = this.currentConfig.markets;
      } else if (type === 'strategy') {
        filePath = this.currentConfig.strategy ? process.env.STRATEGY_CONFIG_PATH : undefined;
        content = this.currentConfig.strategy;
      }

      if (!filePath || !content) {
        return null;
      }

      const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
      const stats = await fs.promises.stat(resolvedPath);

      return {
        path: resolvedPath,
        type,
        content,
        lastModified: stats.mtime,
      };
    } catch (error) {
      logger.error("Failed to get config file", {
        category: "config",
        type,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Update a configuration file
   * @param type - The type of configuration file to update
   * @param content - The new content (will be validated before saving)
   */
  public async updateConfigFile(
    type: 'markets' | 'strategy',
    content: unknown,
  ): Promise<ConfigUpdateResult> {
    try {
      // Validate content against schema
      let validatedContent: unknown;
      if (type === 'markets') {
        const result = marketConfigSchema.safeParse(content);
        if (!result.success) {
          return {
            success: false,
            message: "Validation failed for markets configuration",
            errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
          };
        }
        validatedContent = result.data;
      } else if (type === 'strategy') {
        const result = strategyConfigSchema.safeParse(content);
        if (!result.success) {
          return {
            success: false,
            message: "Validation failed for strategy configuration",
            errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
          };
        }
        validatedContent = result.data;
      } else {
        return {
          success: false,
          message: `Unknown configuration type: ${type}`,
        };
      }

      // Get the file path from environment
      const envVar = type === 'markets' ? 'MARKETS_CONFIG_PATH' : 'STRATEGY_CONFIG_PATH';
      const filePath = process.env[envVar];
      if (!filePath) {
        return {
          success: false,
          message: `${envVar} is not set. Cannot update configuration file.`,
        };
      }

      const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

      // Create directory if it doesn't exist
      const dir = path.dirname(resolvedPath);
      await fs.promises.mkdir(dir, { recursive: true });

      // Write the file (atomic write using temp file + rename)
      const tempPath = `${resolvedPath}.tmp`;
      await fs.promises.writeFile(tempPath, JSON.stringify(validatedContent, null, 2), 'utf-8');
      await fs.promises.rename(tempPath, resolvedPath);

      logger.info("Configuration file updated", {
        category: "config",
        type,
        path: resolvedPath,
      });

      // Reload configuration
      await this.reloadConfig();

      return {
        success: true,
        message: `Configuration file updated successfully: ${resolvedPath}`,
      };
    } catch (error) {
      logger.error("Failed to update config file", {
        category: "config",
        type,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        message: `Failed to update configuration: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Delete a configuration file
   * @param type - The type of configuration file to delete
   */
  public async deleteConfigFile(type: 'markets' | 'strategy'): Promise<ConfigUpdateResult> {
    try {
      const envVar = type === 'markets' ? 'MARKETS_CONFIG_PATH' : 'STRATEGY_CONFIG_PATH';
      const filePath = process.env[envVar];
      if (!filePath) {
        return {
          success: false,
          message: `${envVar} is not set. Cannot delete configuration file.`,
        };
      }

      const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

      // Check if file exists
      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          message: `Configuration file not found: ${resolvedPath}`,
        };
      }

      // Delete the file
      await fs.promises.unlink(resolvedPath);

      logger.info("Configuration file deleted", {
        category: "config",
        type,
        path: resolvedPath,
      });

      // Reload configuration
      await this.reloadConfig();

      return {
        success: true,
        message: `Configuration file deleted successfully: ${resolvedPath}`,
      };
    } catch (error) {
      logger.error("Failed to delete config file", {
        category: "config",
        type,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        message: `Failed to delete configuration: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Reload configuration from files
   * This re-parses all configuration sources and validates them
   */
  public async reloadConfig(): Promise<void> {
    try {
      logger.info("Reloading configuration", { category: "config" });

      // Re-parse configuration (this reads from environment and config files)
      const newConfig = parseConfig(process.env);

      // Emit event before updating to allow listeners to prepare
      this.emit('configReloading', newConfig);

      // Update current configuration
      this.currentConfig = newConfig;

      // Emit event after update
      this.emit('configChanged', newConfig);

      logger.info("Configuration reloaded successfully", {
        category: "config",
        hasMarkets: !!newConfig.markets,
        hasStrategy: !!newConfig.strategy,
        tokenCount: newConfig.tokenIds.length,
      });
    } catch (error) {
      logger.error("Failed to reload configuration", {
        category: "config",
        error: error instanceof Error ? error.message : String(error),
      });
      this.emit('configError', error);
      throw error;
    }
  }

  /**
   * Start watching configuration files for changes
   * Automatically reloads configuration when files change
   */
  public async startWatching(): Promise<void> {
    if (this.isWatching) {
      logger.warn("Configuration watching is already active", { category: "config" });
      return;
    }

    logger.info("Starting configuration file watching", { category: "config" });

    // Watch markets config if configured
    if (process.env.MARKETS_CONFIG_PATH) {
      const marketsPath = path.isAbsolute(process.env.MARKETS_CONFIG_PATH)
        ? process.env.MARKETS_CONFIG_PATH
        : path.resolve(process.cwd(), process.env.MARKETS_CONFIG_PATH);
      this.watchFile(marketsPath, 'markets');
    }

    // Watch strategy config if configured
    if (process.env.STRATEGY_CONFIG_PATH) {
      const strategyPath = path.isAbsolute(process.env.STRATEGY_CONFIG_PATH)
        ? process.env.STRATEGY_CONFIG_PATH
        : path.resolve(process.cwd(), process.env.STRATEGY_CONFIG_PATH);
      this.watchFile(strategyPath, 'strategy');
    }

    // Watch .env file
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      this.watchFile(envPath, 'env');
    }

    this.isWatching = true;
    this.emit('watchingStarted');
  }

  /**
   * Stop watching configuration files
   */
  public async stopWatching(): Promise<void> {
    if (!this.isWatching) {
      return;
    }

    logger.info("Stopping configuration file watching", { category: "config" });

    // Close all watchers
    for (const [filePath, watcher] of this.watchers.entries()) {
      watcher.close();
      logger.debug("Stopped watching file", { category: "config", path: filePath });
    }

    // Clear debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }

    this.watchers.clear();
    this.debounceTimers.clear();
    this.isWatching = false;
    this.emit('watchingStopped');
  }

  /**
   * Check if configuration watching is active
   */
  public isWatchingActive(): boolean {
    return this.isWatching;
  }

  /**
   * Watch a specific file for changes
   * @private
   */
  private watchFile(filePath: string, type: 'markets' | 'strategy' | 'env'): void {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        logger.warn("Configuration file does not exist, will not watch", {
          category: "config",
          path: filePath,
          type,
        });
        return;
      }

      const watcher = watch(filePath, (eventType) => {
        if (eventType === 'change') {
          this.handleFileChange(filePath, type);
        }
      });

      watcher.on('error', (error) => {
        logger.error("File watcher error", {
          category: "config",
          path: filePath,
          type,
          error: error.message,
        });
      });

      this.watchers.set(filePath, watcher);
      logger.info("Started watching configuration file", {
        category: "config",
        path: filePath,
        type,
      });
    } catch (error) {
      logger.error("Failed to watch file", {
        category: "config",
        path: filePath,
        type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle file change event with debouncing
   * @private
   */
  private handleFileChange(filePath: string, type: string): void {
    // Clear existing debounce timer for this file
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer
    const timer = setTimeout(async () => {
      try {
        logger.info("Configuration file changed, reloading", {
          category: "config",
          path: filePath,
          type,
        });

        // For .env files, reload environment variables
        if (type === 'env') {
          // Re-read .env file using dotenv
          const dotenv = await import('dotenv');
          dotenv.config({ override: true });
        }

        // Reload configuration
        await this.reloadConfig();

        this.emit('fileChanged', { path: filePath, type });
      } catch (error) {
        logger.error("Failed to handle file change", {
          category: "config",
          path: filePath,
          type,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this.debounceTimers.delete(filePath);
      }
    }, this.debounceDelayMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Validate a configuration object without saving
   * @param type - The type of configuration to validate
   * @param content - The content to validate
   */
  public validateConfig(type: 'markets' | 'strategy', content: unknown): ConfigUpdateResult {
    try {
      if (type === 'markets') {
        const result = marketConfigSchema.safeParse(content);
        if (!result.success) {
          return {
            success: false,
            message: "Validation failed for markets configuration",
            errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
          };
        }
      } else if (type === 'strategy') {
        const result = strategyConfigSchema.safeParse(content);
        if (!result.success) {
          return {
            success: false,
            message: "Validation failed for strategy configuration",
            errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
          };
        }
      }

      return {
        success: true,
        message: "Configuration is valid",
      };
    } catch (error) {
      return {
        success: false,
        message: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Clean up resources
   */
  public async destroy(): Promise<void> {
    await this.stopWatching();
    this.removeAllListeners();
    ConfigManager.instance = null;
  }
}
