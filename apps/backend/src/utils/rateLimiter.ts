/**
 * In-memory rate limiter for HTTP requests
 * Addresses Audit Finding A-008: No Rate Limiting
 * 
 * Tracks requests per IP address and enforces configurable rate limits
 * to prevent DoS attacks and API abuse.
 */

import { logger } from './logger';

export interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Maximum requests per window
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private clients = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(private config: RateLimitConfig) {
    // Clean up expired entries every minute to prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Check if a request from the given IP should be allowed
   * Returns an object with allowed status and retry information
   */
  checkLimit(ip: string): { allowed: boolean; retryAfter?: number; remaining?: number } {
    const now = Date.now();
    const entry = this.clients.get(ip);

    // First request or window expired
    if (!entry || now >= entry.resetTime) {
      this.clients.set(ip, {
        count: 1,
        resetTime: now + this.config.windowMs,
      });
      return { allowed: true, remaining: this.config.maxRequests - 1 };
    }

    // Within rate limit
    if (entry.count < this.config.maxRequests) {
      entry.count++;
      return { allowed: true, remaining: this.config.maxRequests - entry.count };
    }

    // Rate limit exceeded
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    
    logger.warn('Rate limit exceeded', {
      ip,
      count: entry.count,
      maxRequests: this.config.maxRequests,
      retryAfter,
      audit: 'A-008',
    });

    return { allowed: false, retryAfter };
  }

  /**
   * Clean up expired entries to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [ip, entry] of this.clients.entries()) {
      if (now >= entry.resetTime) {
        this.clients.delete(ip);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Rate limiter cleanup', { entriesRemoved: cleaned });
    }
  }

  /**
   * Get current statistics
   */
  getStats(): { totalClients: number } {
    return {
      totalClients: this.clients.size,
    };
  }

  /**
   * Stop the cleanup interval
   */
  stop(): void {
    clearInterval(this.cleanupInterval);
  }
}
