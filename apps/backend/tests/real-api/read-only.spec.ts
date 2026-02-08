import { describe, it, expect } from 'vitest';
import axios from 'axios';

/**
 * Real API Read-Only Tests
 * 
 * These tests perform read-only smoke checks against the Polymarket public API.
 * They verify that the API is accessible and returns expected data structures.
 * 
 * Environment Variables:
 * - POLYMARKET_API_BASE: API base URL (default: https://polymarket.com/api)
 * - POLYMARKET_API_KEY_READONLY: Optional read-only API key
 * - POLYMARKET_API_SECRET_READONLY: Optional read-only API secret
 * 
 * These tests do NOT require:
 * - LIVE_TRADING
 * - COMPLIANCE_ACCEPTED
 * - FORCE_REAL_TEST
 * 
 * They are safe to run automatically in CI/CD pipelines.
 */

const API_BASE = process.env.POLYMARKET_API_BASE || 'https://gamma-api.polymarket.com';
const API_KEY = process.env.POLYMARKET_API_KEY_READONLY;
const API_SECRET = process.env.POLYMARKET_API_SECRET_READONLY;

// Create axios instance with optional authentication
const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: API_KEY ? {
    'Authorization': `Bearer ${API_KEY}`,
  } : {},
});

describe('Real API - Read-Only Smoke Tests', () => {
  it('should fetch markets list from Gamma API', async () => {
    try {
      const response = await api.get('/markets');
      
      // Verify response structure
      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
      
      // If we have markets, verify basic structure
      if (response.data.length > 0) {
        const market = response.data[0];
        expect(market).toHaveProperty('condition_id');
        expect(market).toHaveProperty('question');
        expect(market).toHaveProperty('tokens');
      }
      
      console.log(`✓ Successfully fetched ${response.data.length} markets`);
    } catch (error: any) {
      // Log error details for debugging
      console.error('Failed to fetch markets:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });
      
      // Re-throw to fail the test
      throw error;
    }
  });

  it('should fetch a specific market by condition_id', async () => {
    try {
      // First get markets list to get a valid condition_id
      const marketsResponse = await api.get('/markets');
      expect(marketsResponse.data.length).toBeGreaterThan(0);
      
      const firstMarket = marketsResponse.data[0];
      const conditionId = firstMarket.condition_id;
      
      // Now fetch that specific market
      const response = await api.get(`/markets/${conditionId}`);
      
      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data.condition_id).toBe(conditionId);
      
      console.log(`✓ Successfully fetched market: ${response.data.question}`);
    } catch (error: any) {
      console.error('Failed to fetch specific market:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });
      
      throw error;
    }
  });

  it('should verify API endpoint is accessible', async () => {
    try {
      // Simple health check - verify we can reach the API
      const response = await api.get('/markets', {
        params: {
          limit: 1, // Request minimal data
        },
      });
      
      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      
      console.log('✓ API endpoint is accessible');
    } catch (error: any) {
      console.error('API endpoint not accessible:', {
        baseURL: API_BASE,
        status: error.response?.status,
        message: error.message,
      });
      
      throw error;
    }
  });

  it('should handle rate limiting gracefully', async () => {
    try {
      // Make multiple requests to test rate limiting behavior
      const requests = Array.from({ length: 3 }, (_, i) => 
        api.get('/markets', {
          params: { limit: 1 },
        }).catch(error => {
          // If we get rate limited, that's expected behavior
          if (error.response?.status === 429) {
            console.log('✓ Rate limiting detected (expected behavior)');
            return { status: 429, rateLimited: true };
          }
          throw error;
        })
      );
      
      const responses = await Promise.all(requests);
      
      // All requests should either succeed or be rate limited
      responses.forEach((response: any) => {
        expect([200, 429]).toContain(response.status);
      });
      
      console.log('✓ Rate limiting behavior verified');
    } catch (error: any) {
      console.error('Rate limiting test failed:', error.message);
      throw error;
    }
  });
});
