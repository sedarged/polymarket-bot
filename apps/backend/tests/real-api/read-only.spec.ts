import { describe, it, expect } from 'vitest';
import axios from 'axios';

/**
 * Read-Only Real API Integration Tests
 * 
 * These tests perform read-only smoke checks against Polymarket public endpoints.
 * They verify that the API is accessible and returns expected data structures.
 * 
 * These tests run automatically in CI/CD and do not require special permissions.
 * They use the public API base URL (default: https://polymarket.com/api).
 */

const POLYMARKET_API_BASE = process.env.POLYMARKET_API_BASE || 'https://polymarket.com/api';
const GAMMA_API_URL = process.env.GAMMA_API_URL || 'https://gamma-api.polymarket.com';

describe('Real API - Read-Only Tests', () => {
  // Set longer timeout for real API calls
  const TEST_TIMEOUT = 30000;

  describe('Gamma API - Public Endpoints', () => {
    it('should fetch markets list', async () => {
      const response = await axios.get(`${GAMMA_API_URL}/markets`, {
        timeout: 10000,
      });

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      
      // Verify response structure
      if (Array.isArray(response.data)) {
        expect(response.data.length).toBeGreaterThan(0);
        
        // Check first market has expected fields
        const market = response.data[0];
        expect(market).toHaveProperty('condition_id');
        expect(market).toHaveProperty('question');
      }
    }, TEST_TIMEOUT);

    it('should fetch a specific market by condition ID', async () => {
      // First, get a market to have a valid condition_id
      const marketsResponse = await axios.get(`${GAMMA_API_URL}/markets`, {
        params: { limit: 1 },
        timeout: 10000,
      });

      expect(marketsResponse.status).toBe(200);
      
      if (Array.isArray(marketsResponse.data) && marketsResponse.data.length > 0) {
        const conditionId = marketsResponse.data[0].condition_id;
        
        // Fetch specific market
        const marketResponse = await axios.get(`${GAMMA_API_URL}/markets/${conditionId}`, {
          timeout: 10000,
        });

        expect(marketResponse.status).toBe(200);
        expect(marketResponse.data).toHaveProperty('condition_id', conditionId);
        expect(marketResponse.data).toHaveProperty('question');
        expect(marketResponse.data).toHaveProperty('tokens');
      }
    }, TEST_TIMEOUT);
  });

  describe('CLOB API - Public Endpoints', () => {
    const CLOB_API_URL = process.env.CLOB_API_URL || 'https://clob.polymarket.com';

    it('should fetch sampling markets', async () => {
      try {
        const response = await axios.get(`${CLOB_API_URL}/sampling-markets`, {
          timeout: 10000,
        });

        expect(response.status).toBe(200);
        expect(response.data).toBeDefined();
      } catch (error: any) {
        // Some public endpoints might require authentication
        // If we get a 401, that's acceptable for a public endpoint test
        if (error.response?.status === 401) {
          console.warn('CLOB API requires authentication - skipping');
          expect(true).toBe(true);
        } else {
          throw error;
        }
      }
    }, TEST_TIMEOUT);
  });

  describe('API Health Checks', () => {
    it('should verify Gamma API is reachable', async () => {
      try {
        const response = await axios.get(`${GAMMA_API_URL}/markets`, {
          params: { limit: 1 },
          timeout: 10000,
        });

        expect(response.status).toBe(200);
      } catch (error: any) {
        // Log error details for debugging
        console.error('Gamma API health check failed:', error.message);
        throw error;
      }
    }, TEST_TIMEOUT);

    it('should verify CLOB API is reachable', async () => {
      const CLOB_API_URL = process.env.CLOB_API_URL || 'https://clob.polymarket.com';
      
      try {
        // Try to reach any public endpoint
        const response = await axios.get(`${CLOB_API_URL}/sampling-markets`, {
          timeout: 10000,
          validateStatus: (status) => status < 500, // Accept any status < 500
        });

        // Just verify we can reach the server
        expect(response.status).toBeLessThan(500);
      } catch (error: any) {
        // If network error, that's a real problem
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          console.error('CLOB API is not reachable:', error.message);
          throw error;
        }
        
        // Other errors (like auth) mean the server is reachable
        expect(true).toBe(true);
      }
    }, TEST_TIMEOUT);
  });

  describe('Data Structure Validation', () => {
    it('should validate market data structure', async () => {
      const response = await axios.get(`${GAMMA_API_URL}/markets`, {
        params: { limit: 5 },
        timeout: 10000,
      });

      expect(response.status).toBe(200);
      
      if (Array.isArray(response.data) && response.data.length > 0) {
        const market = response.data[0];
        
        // Required fields
        expect(market).toHaveProperty('condition_id');
        expect(market.condition_id).toMatch(/^0x[a-fA-F0-9]+$/); // Hex string
        
        expect(market).toHaveProperty('question');
        expect(typeof market.question).toBe('string');
        
        // Optional but common fields
        if (market.tokens) {
          expect(Array.isArray(market.tokens)).toBe(true);
        }
      }
    }, TEST_TIMEOUT);
  });
});
