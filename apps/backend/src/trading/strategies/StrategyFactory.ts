/**
 * Strategy Factory
 * 
 * Factory pattern implementation for creating trading strategy instances.
 * Supports:
 * - Strategy registration (plugin-style architecture)
 * - Dynamic instantiation from configuration
 * - Extensibility for adding new strategies
 * 
 * Usage:
 * ```typescript
 * // Register a strategy
 * StrategyFactory.register('random', () => new RandomStrategy());
 * 
 * // Create from config
 * const strategy = await StrategyFactory.create({
 *   strategyId: 'my-strategy-1',
 *   type: 'random',
 *   params: { ... },
 *   enabled: true
 * });
 * ```
 */

import { logger } from '../../utils/logger';
import type { IStrategy, StrategyConfig, StrategyRegistration } from './types';

export class StrategyFactory {
  private static strategies = new Map<string, StrategyRegistration>();

  /**
   * Register a strategy type
   * 
   * @param registration - Strategy registration details
   */
  static register(registration: StrategyRegistration): void {
    if (this.strategies.has(registration.type)) {
      logger.warn('Strategy type already registered, overwriting', {
        type: registration.type,
      });
    }

    this.strategies.set(registration.type, registration);

    logger.info('Strategy registered', {
      type: registration.type,
      description: registration.description,
    });
  }

  /**
   * Unregister a strategy type
   * Useful for testing or hot-reloading
   * 
   * @param type - Strategy type to unregister
   */
  static unregister(type: string): boolean {
    const existed = this.strategies.delete(type);
    
    if (existed) {
      logger.info('Strategy unregistered', { type });
    }
    
    return existed;
  }

  /**
   * Get all registered strategy types
   */
  static getRegisteredTypes(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Get registration info for a strategy type
   */
  static getRegistration(type: string): StrategyRegistration | undefined {
    return this.strategies.get(type);
  }

  /**
   * Check if a strategy type is registered
   */
  static isRegistered(type: string): boolean {
    return this.strategies.has(type);
  }

  /**
   * Create a strategy instance from configuration
   * 
   * @param config - Strategy configuration
   * @returns Initialized strategy instance
   * @throws Error if strategy type not registered
   */
  static async create(config: StrategyConfig): Promise<IStrategy> {
    // Validate config
    if (!config.type) {
      throw new Error('Strategy type is required');
    }

    // Get registration
    const registration = this.strategies.get(config.type);
    if (!registration) {
      throw new Error(
        `Unknown strategy type: ${config.type}. ` +
        `Available types: ${this.getRegisteredTypes().join(', ')}`
      );
    }

    // Merge with default config
    const fullConfig: StrategyConfig = {
      ...registration.defaultConfig,
      ...config,
      params: {
        ...registration.defaultConfig.params,
        ...config.params,
      },
    };

    logger.info('Creating strategy instance', {
      type: config.type,
      strategyId: config.strategyId,
    });

    try {
      // Create instance
      const strategy = registration.factory();

      // Initialize with config
      await strategy.initialize(fullConfig);

      logger.info('Strategy instance created successfully', {
        type: config.type,
        strategyId: strategy.id,
        name: strategy.name,
        version: strategy.version,
      });

      return strategy;
    } catch (error) {
      logger.error('Failed to create strategy instance', {
        type: config.type,
        strategyId: config.strategyId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create multiple strategy instances from configurations
   * 
   * @param configs - Array of strategy configurations
   * @returns Array of initialized strategy instances
   */
  static async createAll(configs: StrategyConfig[]): Promise<IStrategy[]> {
    const strategies: IStrategy[] = [];
    const errors: Array<{ config: StrategyConfig; error: Error }> = [];

    for (const config of configs) {
      try {
        const strategy = await this.create(config);
        strategies.push(strategy);
      } catch (error) {
        errors.push({
          config,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    if (errors.length > 0) {
      logger.warn('Some strategies failed to create', {
        total: configs.length,
        successful: strategies.length,
        failed: errors.length,
        errors: errors.map(e => ({
          type: e.config.type,
          strategyId: e.config.strategyId,
          error: e.error.message,
        })),
      });
    }

    return strategies;
  }

  /**
   * Clear all registered strategies
   * Primarily for testing
   */
  static clear(): void {
    this.strategies.clear();
    logger.debug('All strategies cleared from factory');
  }

  /**
   * Get info about all registered strategies
   */
  static listStrategies(): Array<{
    type: string;
    description: string;
    defaultConfig: Partial<StrategyConfig>;
  }> {
    return Array.from(this.strategies.values()).map(reg => ({
      type: reg.type,
      description: reg.description,
      defaultConfig: reg.defaultConfig,
    }));
  }
}
