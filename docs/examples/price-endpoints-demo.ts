/**
 * Price & Market Endpoints Demo
 * 
 * This script demonstrates the usage of the new price query endpoints
 * implemented in PR-005. It shows real-world examples of how to use
 * each endpoint for trading decisions.
 * 
 * Related: Issue #233, Issue #226
 * Documentation: docs/price-endpoints-usage.md
 * 
 * To run: tsx docs/examples/price-endpoints-demo.ts
 */

import { ClobClient } from '../../apps/backend/src/clients/clob';

// Example token ID from a Polymarket market
// In production, get this from GammaClient.getActiveMarkets()
const EXAMPLE_TOKEN_ID = '21742633143463906290569050155826241533067272736897614950488156847949938836455';

async function demonstratePriceEndpoints() {
  console.log('=== Price & Market Endpoints Demo ===\n');
  
  const clobClient = new ClobClient();
  
  try {
    // 1. GET /price - Quick price check
    console.log('1. GET /price - Current Market Prices');
    console.log('-----------------------------------');
    
    const buyPrice = await clobClient.getPrice(EXAMPLE_TOKEN_ID, 'BUY');
    console.log(`Best Ask (BUY price): ${buyPrice}`);
    
    const sellPrice = await clobClient.getPrice(EXAMPLE_TOKEN_ID, 'SELL');
    console.log(`Best Bid (SELL price): ${sellPrice}`);
    
    const priceGap = (parseFloat(buyPrice) - parseFloat(sellPrice)).toFixed(6);
    console.log(`Price gap: ${priceGap}\n`);
    
    // 2. GET /spread - Liquidity analysis
    console.log('2. GET /spread - Market Liquidity');
    console.log('---------------------------------');
    
    const spread = await clobClient.getSpread(EXAMPLE_TOKEN_ID);
    console.log(`Bid: ${spread.bid}`);
    console.log(`Ask: ${spread.ask}`);
    console.log(`Spread: ${spread.spread}`);
    
    const spreadPercent = (parseFloat(spread.spread) / parseFloat(spread.bid) * 100).toFixed(2);
    console.log(`Spread %: ${spreadPercent}%`);
    
    const liquidity = parseFloat(spread.spread) < 0.05 ? 'Good' : 'Poor';
    console.log(`Liquidity: ${liquidity}\n`);
    
    // 3. GET /midpoint - Fair value
    console.log('3. GET /midpoint - Fair Value Estimate');
    console.log('--------------------------------------');
    
    const midpoint = await clobClient.getMidpoint(EXAMPLE_TOKEN_ID);
    console.log(`Midpoint (fair value): ${midpoint.midpoint}`);
    
    // Calculate suggested limit order prices
    const mid = parseFloat(midpoint.midpoint);
    const buyLimitPrice = (mid * 0.995).toFixed(6); // 0.5% below midpoint
    const sellLimitPrice = (mid * 1.005).toFixed(6); // 0.5% above midpoint
    console.log(`Suggested BUY limit: ${buyLimitPrice}`);
    console.log(`Suggested SELL limit: ${sellLimitPrice}\n`);
    
    // 4. GET /lasttrade - Market activity
    console.log('4. GET /lasttrade - Recent Activity');
    console.log('-----------------------------------');
    
    const lastTrade = await clobClient.getLastTrade(EXAMPLE_TOKEN_ID);
    console.log(`Last trade price: ${lastTrade.price}`);
    console.log(`Last trade size: ${lastTrade.size}`);
    console.log(`Last trade time: ${lastTrade.timestamp}`);
    
    const tradeAge = Date.now() - new Date(lastTrade.timestamp).getTime();
    const minutesAgo = Math.floor(tradeAge / 60000);
    console.log(`Trade age: ${minutesAgo} minutes ago`);
    
    const isActive = tradeAge < 10 * 60 * 1000; // Active if < 10 minutes
    console.log(`Market is active: ${isActive}\n`);
    
    // 5. Market quality assessment
    console.log('5. Market Quality Assessment');
    console.log('---------------------------');
    
    const qualityScore = assessMarketQuality(
      parseFloat(spread.spread),
      tradeAge
    );
    
    console.log(`Quality score: ${qualityScore.score}/100`);
    console.log(`Assessment: ${qualityScore.assessment}`);
    console.log(`Recommendation: ${qualityScore.recommendation}\n`);
    
    // 6. Circuit breaker metrics
    console.log('6. Circuit Breaker Status');
    console.log('------------------------');
    
    const metrics = clobClient.getCircuitBreakerMetrics();
    console.log(`State: ${metrics.state}`);
    console.log(`Successes: ${metrics.successes}`);
    console.log(`Failures: ${metrics.failures}`);
    const successRate = metrics.successes + metrics.failures > 0 
      ? (metrics.successes / (metrics.successes + metrics.failures) * 100).toFixed(2)
      : '0.00';
    console.log(`Success rate: ${successRate}%\n`);
    
  } catch (error: any) {
    console.error('Error demonstrating endpoints:', error.message);
    
    if (error.response) {
      console.error(`API Status: ${error.response.status}`);
      console.error(`API Error: ${JSON.stringify(error.response.data)}`);
    }
    
    // Show circuit breaker state on error
    const metrics = clobClient.getCircuitBreakerMetrics();
    console.error(`Circuit breaker state: ${metrics.state}`);
  } finally {
    // Clean up
    clobClient.destroy();
  }
}

/**
 * Assess market quality based on spread and activity
 */
function assessMarketQuality(
  spread: number,
  tradeAgeMs: number
): {
  score: number;
  assessment: string;
  recommendation: string;
} {
  let score = 100;
  
  // Penalize wide spreads
  if (spread > 0.10) {
    score -= 40;
  } else if (spread > 0.05) {
    score -= 20;
  } else if (spread > 0.02) {
    score -= 10;
  }
  
  // Penalize stale markets
  const minutesSinceLastTrade = tradeAgeMs / 60000;
  if (minutesSinceLastTrade > 60) {
    score -= 30;
  } else if (minutesSinceLastTrade > 30) {
    score -= 20;
  } else if (minutesSinceLastTrade > 10) {
    score -= 10;
  }
  
  // Determine assessment
  let assessment: string;
  let recommendation: string;
  
  if (score >= 80) {
    assessment = 'Excellent - Very liquid and active';
    recommendation = 'Good for trading with tight spreads';
  } else if (score >= 60) {
    assessment = 'Good - Reasonable liquidity';
    recommendation = 'Suitable for most trading strategies';
  } else if (score >= 40) {
    assessment = 'Fair - Moderate liquidity concerns';
    recommendation = 'Use limit orders and monitor carefully';
  } else {
    assessment = 'Poor - Low liquidity or inactive';
    recommendation = 'Avoid or use extreme caution';
  }
  
  return { score, assessment, recommendation };
}

// Run the demonstration
demonstratePriceEndpoints()
  .then(() => {
    console.log('Demo completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Demo failed:', error);
    process.exit(1);
  });
