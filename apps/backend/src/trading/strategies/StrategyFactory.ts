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
import { StrategyValidator, type ValidationCriteria } from './validator';

export class StrategyFactory {
  private static strategies = new Map<string, StrategyRegistration>();
  private static validationEnabled = true;
  private static validationCriteria: ValidationCriteria = {};

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
   * Set validation criteria for all strategy creation
   * 
   * @param criteria - Validation criteria to apply
   */
  static setValidationCriteria(criteria: ValidationCriteria): void {
    this.validationCriteria = criteria;
    logger.info('Strategy validation criteria updated', {
      hasRequiredParams: !!criteria.requiredParams,
      hasParamBounds: !!criteria.paramBounds,
      validateBehavior: criteria.validateBehavior,
    });
  }

  /**
   * Enable or disable validation
   * 
   * @param enabled - Whether to enable validation
   */
  static setValidationEnabled(enabled: boolean): void {
    this.validationEnabled = enabled;
    logger.info('Strategy validation', {
      enabled: this.validationEnabled,
    });
  }

  /**
   * Create a strategy instance from configuration
   * 
   * @param config - Strategy configuration
   * @param skipValidation - Skip validation for this strategy (optional)
   * @returns Initialized strategy instance
   * @throws Error if strategy type not registered or validation fails
   */
  static async create(
    config: StrategyConfig,
    skipValidation = false
  ): Promise<IStrategy> {
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

      // Validate strategy before returning (if enabled)
      if (this.validationEnabled && !skipValidation) {
        logger.info('Validating strategy before deployment', {
          strategyId: strategy.id,
          type: config.type,
        });

        const validator = new StrategyValidator(this.validationCriteria);
        const report = await validator.validate(strategy);

        if (!report.valid) {
          const formattedReport = StrategyValidator.formatReport(report);
          logger.error('Strategy validation failed', {
            strategyId: strategy.id,
            errors: report.errorCount,
            warnings: report.warningCount,
            report: formattedReport,
          });
          
          throw new Error(
            `Strategy validation failed with ${report.errorCount} error(s). ` +
            `Review validation report for details.`
          );
        }

        logger.info('Strategy validation passed', {
          strategyId: strategy.id,
          warnings: report.warningCount,
        });

        if (report.warningCount > 0) {
          const formattedReport = StrategyValidator.formatReport(report);
          logger.warn('Strategy has warnings', {
            strategyId: strategy.id,
            warnings: report.warningCount,
            report: formattedReport,
          });
        }
      }

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
