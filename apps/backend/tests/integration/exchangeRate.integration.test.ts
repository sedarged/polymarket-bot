import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExchangeRateClient } from '../../src/clients/exchangeRate';

/**
 * Integration tests for ExchangeRateClient
 * 
 * These tests make real API calls to CoinGecko.
 * They are skipped by default to avoid:
 * - Rate limiting
 * - Network dependency in CI
 * - Slow test execution
 * 
 * To run these tests locally:
 * npm test tests/integration/exchangeRate.integration.test.ts
 */

describe.skip('ExchangeRateClient - Integration Tests (GAP-007)', () => {
  let client: ExchangeRateClient;

  beforeEach(() => {
    // Use shorter cache TTL for testing
    client = new ExchangeRateClient(60000); // 1 minute
  });

  afterEach(() => {
    if (client) {
      client.destroy();
    }
  });

  describe('Real API Calls', () => {
    it('should fetch USDC/USD rate from CoinGecko', async () => {
      const result = await client.getExchangeRate('USDC', 'USD');

      expect(result).toBeDefined();
      expect(result.from).toBe('USDC');
      expect(result.to).toBe('USD');
      expect(result.rate).toBeGreaterThan(0);
      expect(result.rate).toBeLessThan(2); // USDC should be close to $1
      expect(result.timestamp).toBeGreaterThan(0);
    }, 10000); // 10 second timeout

    it('should fetch ETH/USD rate from CoinGecko', async () => {
      const result = await client.getExchangeRate('ETH', 'USD');

      expect(result).toBeDefined();
      expect(result.from).toBe('ETH');
      expect(result.to).toBe('USD');
      expect(result.rate).toBeGreaterThan(0);
      expect(result.timestamp).toBeGreaterThan(0);
    }, 10000);

    it('should fetch BTC/USD rate from CoinGecko', async () => {
      const result = await client.getExchangeRate('BTC', 'USD');

      expect(result).toBeDefined();
      expect(result.from).toBe('BTC');
      expect(result.to).toBe('USD');
      expect(result.rate).toBeGreaterThan(1000); // BTC should be > $1000
      expect(result.timestamp).toBeGreaterThan(0);
    }, 10000);

    it('should fetch MATIC/USD rate from CoinGecko', async () => {
      const result = await client.getExchangeRate('MATIC', 'USD');

      expect(result).toBeDefined();
      expect(result.from).toBe('MATIC');
      expect(result.to).toBe('USD');
      expect(result.rate).toBeGreaterThan(0);
      expect(result.timestamp).toBeGreaterThan(0);
    }, 10000);

    it('should fetch multiple rates in batch', async () => {
      const results = await client.getBatchExchangeRates([
        ['USDC', 'USD'],
        ['ETH', 'USD'],
        ['BTC', 'USD'],
      ]);

      expect(results).toHaveLength(3);
      
      const [usdc, eth, btc] = results;
      
      expect(usdc.from).toBe('USDC');
      expect(usdc.rate).toBeGreaterThan(0);
      
      expect(eth.from).toBe('ETH');
      expect(eth.rate).toBeGreaterThan(0);
      
      expect(btc.from).toBe('BTC');
      expect(btc.rate).toBeGreaterThan(1000);
    }, 15000);
  });

  describe('Caching with Real API', () => {
    it('should cache rates and not make duplicate API calls', async () => {
      const startTime = Date.now();
      
      // First call - should hit API
      const result1 = await client.getExchangeRate('USDC', 'USD');
      const firstCallTime = Date.now() - startTime;
      
      const midTime = Date.now();
      
      // Second call - should use cache (much faster)
      const result2 = await client.getExchangeRate('USDC', 'USD');
      const secondCallTime = Date.now() - midTime;
      
      // Both should return same rate
      expect(result1.rate).toBe(result2.rate);
      
      // Cache hit should be significantly faster
      expect(secondCallTime).toBeLessThan(firstCallTime / 2);
      
      // Timestamps should be identical (same cached value)
      expect(result1.timestamp).toBe(result2.timestamp);
    }, 15000);

    it('should fetch fresh data after cache expires', async () => {
      const shortTtlClient = new ExchangeRateClient(1000); // 1 second TTL
      
      try {
        // First call
        const result1 = await shortTtlClient.getExchangeRate('USDC', 'USD');
        
        // Wait for cache to expire
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Second call - should fetch fresh data
        const result2 = await shortTtlClient.getExchangeRate('USDC', 'USD');
        
        // Timestamps should be different (new fetch)
        expect(result2.timestamp).toBeGreaterThan(result1.timestamp);
      } finally {
        shortTtlClient.destroy();
      }
    }, 15000);
  });

  describe('Error Handling with Real API', () => {
    it('should handle unsupported currencies gracefully', async () => {
      await expect(
        client.getExchangeRate('NOTACOIN', 'USD')
      ).rejects.toThrow('Unsupported source currency');
    });
  });

  describe('Cache Management', () => {
    it('should report accurate cache statistics', async () => {
      const stats1 = client.getCacheStats();
      expect(stats1.size).toBe(0);
      
      await client.getExchangeRate('USDC', 'USD');
      await client.getExchangeRate('ETH', 'USD');
      
      const stats2 = client.getCacheStats();
      expect(stats2.size).toBe(2);
      expect(stats2.entries).toHaveLength(2);
      
      const usdcEntry = stats2.entries.find(e => e.from === 'USDC');
      expect(usdcEntry).toBeDefined();
      expect(usdcEntry!.to).toBe('USD');
      expect(usdcEntry!.age).toBeGreaterThanOrEqual(0);
    }, 15000);

    it('should clear cache completely', async () => {
      await client.getExchangeRate('USDC', 'USD');
      expect(client.getCacheStats().size).toBe(1);
      
      client.clearCache();
      expect(client.getCacheStats().size).toBe(0);
    }, 10000);
  });

  describe('Circuit Breaker Behavior', () => {
    it('should provide circuit breaker metrics', async () => {
      const metrics1 = client.getCircuitBreakerMetrics();
      expect(metrics1.state).toBe('closed');
      expect(metrics1.failures).toBe(0);
      expect(metrics1.successes).toBe(0);
      
      // Make a successful request
      await client.getExchangeRate('USDC', 'USD');
      
      const metrics2 = client.getCircuitBreakerMetrics();
      expect(metrics2.successes).toBeGreaterThan(0);
    }, 10000);
  });
});
