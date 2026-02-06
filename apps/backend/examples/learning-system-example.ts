/**
 * Learning System Integration Example
 * 
 * Demonstrates how to use the event store, signal catalog, and backtest engine together.
 * This example shows a complete workflow from market data ingestion to strategy evaluation.
 */

import { EventStore, SignalCatalog, BacktestEngine } from '../src/learning';
import type {
  MarketEvent,
  SignalEvent,
  StrategyDecisionEvent,
  ExecutionOutcomeEvent,
} from '../src/learning/types';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  console.log('=== Learning System Integration Example ===\n');

  // Initialize components
  const eventStore = new EventStore({ path: './data/example-events.db' });
  const signalCatalog = new SignalCatalog({ path: './data/example-signals.db' });
  const backtestEngine = new BacktestEngine({
    path: './data/example-backtests.db',
    eventStore,
  });

  try {
    // Step 1: Register signal definitions
    console.log('1. Registering signal definitions...');
    
    signalCatalog.registerSignal({
      signalName: 'mid_price',
      description: 'Midpoint between best bid and ask',
      featureGroup: 'market',
      inputFields: ['bestBid', 'bestAsk'],
      outputType: 'number',
      version: '1.0.0',
      owner: 'system',
    });

    signalCatalog.registerSignal({
      signalName: 'spread_bps',
      description: 'Spread in basis points',
      featureGroup: 'liquidity',
      inputFields: ['bestBid', 'bestAsk', 'mid'],
      outputType: 'number',
      version: '1.0.0',
      owner: 'system',
    });

    signalCatalog.registerSignal({
      signalName: 'mean_reversion_signal',
      description: 'Mean reversion trading signal',
      featureGroup: 'strategy',
      inputFields: ['mid_price', 'moving_average'],
      outputType: 'number',
      defaultWindow: '5m',
      version: '1.0.0',
      owner: 'strategy_team',
    });

    console.log(`✓ Registered ${signalCatalog.getStats().totalSignals} signals\n`);

    // Step 2: Simulate market data ingestion
    console.log('2. Ingesting market data...');

    const marketId = 'market-example-1';
    const startTime = new Date('2026-02-06T10:00:00.000Z');

    // Simulate 1 hour of market data at 5-minute intervals
    for (let i = 0; i < 12; i++) {
      const timestamp = new Date(startTime.getTime() + i * 5 * 60 * 1000).toISOString();
      
      // Simulate price movement
      const basePrice = 0.50;
      const priceChange = Math.sin(i / 2) * 0.05; // Oscillating price
      const mid = basePrice + priceChange;
      const spread = 0.04;

      const marketEvent: MarketEvent = {
        marketStatus: 'open',
        bestBid: mid - spread / 2,
        bestAsk: mid + spread / 2,
        mid,
        spread,
        liquidity: 1000 + Math.random() * 500,
        tickSize: 0.01,
      };

      eventStore.writeEvent('MarketEvent', marketId, 'websocket', marketEvent, timestamp);
    }

    console.log(`✓ Ingested ${eventStore.getEventCount({ marketId })} market events\n`);

    // Step 3: Generate signals from market data
    console.log('3. Generating trading signals...');

    const events = eventStore.queryEvents({
      marketId,
      eventType: 'MarketEvent',
    });

    let movingAverage = 0.50; // Simple moving average
    const alpha = 0.2; // EMA smoothing factor

    for (const event of events) {
      const marketData = event.payload as MarketEvent;
      
      // Update moving average
      movingAverage = alpha * marketData.mid + (1 - alpha) * movingAverage;

      // Generate mean reversion signal
      const deviation = marketData.mid - movingAverage;
      const signalValue = -deviation * 10; // Negative when price above MA (sell signal)

      const signal: SignalEvent = {
        signalId: uuidv4(),
        signalName: 'mean_reversion_signal',
        signalValue,
        signalVersion: '1.0.0',
        featureSetId: 'feature-set-example',
        metadata: {
          mid: marketData.mid,
          movingAverage,
          deviation,
          confidence: Math.abs(signalValue) > 0.5 ? 0.8 : 0.5,
        },
      };

      eventStore.writeEvent('SignalEvent', marketId, 'strategy', signal, event.occurredAt);

      // Generate strategy decision if signal is strong
      if (Math.abs(signalValue) > 0.5) {
        const decision: StrategyDecisionEvent = {
          strategyId: 'mean-reversion-v1',
          strategyVersion: '1.0.0',
          decisionId: uuidv4(),
          action: 'place_order',
          rationale: `Mean reversion signal: ${signalValue.toFixed(2)}`,
          confidence: signal.metadata.confidence as number,
          inputs: {
            signal: signalValue,
            mid: marketData.mid,
            ma: movingAverage,
          },
          constraints: {
            maxPositionSize: 100,
            riskLimit: 0.05,
          },
        };

        eventStore.writeEvent(
          'StrategyDecisionEvent',
          marketId,
          'strategy',
          decision,
          event.occurredAt
        );

        // Simulate paper trading execution
        const outcome: ExecutionOutcomeEvent = {
          decisionId: decision.decisionId,
          simulatedOrderId: `paper-${uuidv4()}`,
          status: 'filled',
          requested: {
            side: signalValue > 0 ? 'buy' : 'sell',
            price: marketData.mid,
            size: 50,
          },
          executed: {
            price: marketData.mid * (1 + (Math.random() - 0.5) * 0.01),
            size: 50,
          },
          fees: marketData.mid * 50 * 0.002,
          latencyMs: 100 + Math.random() * 100,
        };

        eventStore.writeEvent(
          'ExecutionOutcomeEvent',
          marketId,
          'simulation',
          outcome,
          event.occurredAt
        );
      }
    }

    const signalCount = eventStore.getEventCount({
      marketId,
      eventType: 'SignalEvent',
    });
    const decisionCount = eventStore.getEventCount({
      marketId,
      eventType: 'StrategyDecisionEvent',
    });
    const executionCount = eventStore.getEventCount({
      marketId,
      eventType: 'ExecutionOutcomeEvent',
    });

    console.log(`✓ Generated ${signalCount} signals`);
    console.log(`✓ Made ${decisionCount} strategy decisions`);
    console.log(`✓ Executed ${executionCount} paper trades\n`);

    // Step 4: Run backtest
    console.log('4. Running backtest...');

    const backtestId = await backtestEngine.runBacktest({
      strategyId: 'mean-reversion-v1',
      startDate: events[0].occurredAt,
      endDate: events[events.length - 1].occurredAt,
      markets: [marketId],
      initialBalance: 10000,
      slippage: 0.01,
      feeRate: 0.002,
      seed: 12345,
    });

    const result = backtestEngine.getBacktest(backtestId);
    
    if (result) {
      console.log('\n=== Backtest Results ===');
      console.log(`Strategy: ${result.strategyId}`);
      console.log(`Period: ${result.config.startDate} to ${result.config.endDate}`);
      console.log('\nMetrics:');
      console.log(`  PnL: $${result.metrics.pnl.toFixed(2)}`);
      console.log(`  Sharpe Ratio: ${result.metrics.sharpe.toFixed(2)}`);
      console.log(`  Max Drawdown: ${(result.metrics.maxDrawdown * 100).toFixed(2)}%`);
      console.log(`  Win Rate: ${(result.metrics.winRate * 100).toFixed(2)}%`);
      console.log(`  Total Trades: ${result.metrics.totalTrades}`);
      console.log(`  Avg Trade Size: ${result.metrics.avgTradeSize.toFixed(2)}\n`);
    }

    // Step 5: Query and analyze events
    console.log('5. Event store statistics...');
    
    const stats = eventStore.getStats();
    console.log(`Total events: ${stats.totalEvents}`);
    console.log('Events by type:');
    Object.entries(stats.eventsByType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
    console.log(`Date range: ${stats.dateRange.earliest} to ${stats.dateRange.latest}\n`);

    // Step 6: Signal catalog statistics
    console.log('6. Signal catalog statistics...');
    
    const catalogStats = signalCatalog.getStats();
    console.log(`Total signals: ${catalogStats.totalSignals}`);
    console.log(`Total versions: ${catalogStats.totalVersions}`);
    console.log('Signals by feature group:');
    Object.entries(catalogStats.signalsByGroup).forEach(([group, count]) => {
      console.log(`  ${group}: ${count}`);
    });
    console.log();

    // Step 7: Backtest engine statistics
    console.log('7. Backtest engine statistics...');
    
    const backtestStats = backtestEngine.getStats();
    console.log(`Total backtests: ${backtestStats.totalBacktests}`);
    console.log(`Completed: ${backtestStats.completedBacktests}`);
    console.log(`Failed: ${backtestStats.failedBacktests}`);
    console.log(`Running: ${backtestStats.runningBacktests}\n`);

    console.log('=== Example Complete ===');
  } finally {
    // Clean up
    eventStore.close();
    signalCatalog.close();
    backtestEngine.close();
  }
}

// Run example
if (require.main === module) {
  main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}

export { main };
