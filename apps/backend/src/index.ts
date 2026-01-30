import express from 'express';
import { randomUUID } from 'crypto';
import { config } from './config';
import { SqliteStore } from './storage/sqlite';
import { LogService } from './services/logService';
import { MarketDiscoveryService } from './services/marketDiscovery';
import { OrderbookService } from './services/orderbook';
import { SnapshotService } from './services/snapshotService';
import { WsClient } from './services/wsClient';
import { PaperTradingEngine } from './services/paperTrading';
import { PnlTracker } from './services/pnlTracker';
import { RiskManager } from './services/riskManager';
import { KillSwitch } from './services/killSwitch';
import { TradingGate } from './services/tradingGate';
import { OrderSide, OrderStatus } from './types';

const app = express();
app.use(express.json());

const store = new SqliteStore();
const logger = new LogService(store);
const marketDiscovery = new MarketDiscoveryService(logger);
const orderbook = new OrderbookService();
const snapshotService = new SnapshotService(logger);
const pnlTracker = new PnlTracker(store);
const riskManager = new RiskManager();
const killSwitch = new KillSwitch(logger);
const tradingGate = new TradingGate(logger);

const paperEngine = new PaperTradingEngine(orderbook, store, logger, (fill) => {
  pnlTracker.onFill(fill);
});

const wsClient = new WsClient(logger);

// Hydrate PnL tracker from stored fills on startup
(async () => {
  try {
    const fills = store.listFills();
    if (Array.isArray(fills)) {
      fills.sort((a, b) => {
        const ta = new Date(a.timestamp).getTime();
        const tb = new Date(b.timestamp).getTime();
        return ta - tb;
      });
      for (const fill of fills) {
        pnlTracker.onFill(fill);
      }
      logger.info('Hydrated PnL tracker from stored fills', { fillCount: fills.length });
    } else {
      logger.warn('store.listFills() did not return an array; skipping PnL hydration');
    }
  } catch (error) {
    logger.error('Failed to hydrate PnL tracker from stored fills', { error });
  }
})();

const recordExternalFill = (payload: Record<string, unknown>): void => {
  const marketId = typeof payload.marketId === 'string' ? payload.marketId : undefined;
  const orderId = typeof payload.orderId === 'string' ? payload.orderId : undefined;
  const side: OrderSide | undefined =
    payload.side === 'buy' || payload.side === 'sell' ? payload.side : undefined;
  const price = typeof payload.price === 'number' ? payload.price : undefined;
  const size = typeof payload.size === 'number' ? payload.size : undefined;
  if (!marketId || !orderId || !side || price === undefined || size === undefined) {
    logger.warn('User fill payload missing fields', { payload });
    return;
  }
  const fill = {
    id: typeof payload.id === 'string' ? payload.id : randomUUID(),
    orderId,
    marketId,
    side,
    price,
    size,
    fee: typeof payload.fee === 'number' ? payload.fee : 0,
    timestamp: typeof payload.timestamp === 'string' ? payload.timestamp : new Date().toISOString(),
  };
  store.insertFill(fill);
  pnlTracker.onFill(fill);
};

const recordExternalOrder = (payload: Record<string, unknown>): void => {
  const marketId = typeof payload.marketId === 'string' ? payload.marketId : undefined;
  const orderId = typeof payload.id === 'string' ? payload.id : undefined;
  const side: OrderSide | undefined =
    payload.side === 'buy' || payload.side === 'sell' ? payload.side : undefined;
  const price = typeof payload.price === 'number' ? payload.price : undefined;
  const size = typeof payload.size === 'number' ? payload.size : undefined;
  if (!marketId || !orderId || !side || price === undefined || size === undefined) {
    logger.warn('User order payload missing fields', { payload });
    return;
  }
  const validStatuses = ['open', 'filled', 'cancelled', 'rejected'];
  const rawStatus = typeof payload.status === 'string' ? payload.status : 'open';
  const status = validStatuses.includes(rawStatus) ? rawStatus : 'open';
  if (!validStatuses.includes(rawStatus)) {
    logger.warn('User order payload has invalid status, defaulting to "open"', { payload, rawStatus });
  }
  const now = new Date().toISOString();
  store.upsertOrder({
    id: orderId,
    marketId,
    tokenId: typeof payload.tokenId === 'string' ? payload.tokenId : undefined,
    side,
    price,
    size,
    status: status as OrderStatus,
    createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : now,
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : now,
    live: true,
  });
};

wsClient.on('message', (message) => {
  if (message.channel === 'market' && message.type === 'orderbook') {
    if (typeof message.payload !== 'object' || message.payload === null) {
      logger.warn('Orderbook payload is not an object', { payload: message.payload });
      return;
    }
    const payload = message.payload as Record<string, unknown>;
    const marketId = typeof payload.marketId === 'string' ? payload.marketId : undefined;
    const bids = Array.isArray(payload.bids) ? payload.bids : [];
    const asks = Array.isArray(payload.asks) ? payload.asks : [];
    if (!marketId) {
      logger.warn('Orderbook payload missing marketId', { payload });
      return;
    }
    orderbook.applyDelta(marketId, bids, asks);
    const bestBid = bids[0]?.price;
    const bestAsk = asks[0]?.price;
    if (bestBid !== undefined && bestAsk !== undefined) {
      const mid = (bestBid + bestAsk) / 2;
      pnlTracker.updateUnrealized(marketId, mid);
    }
    return;
  }
  if (message.channel === 'user' && typeof message.payload === 'object' && message.payload !== null) {
    const payload = message.payload as Record<string, unknown>;
    if (message.type === 'fill') {
      recordExternalFill(payload);
    } else if (message.type === 'order') {
      recordExternalOrder(payload);
    } else {
      logger.info('Unhandled user message', { type: message.type });
    }
  }
});

const reconcileStartup = async (): Promise<void> => {
  if (!tradingGate.isLive()) {
    logger.info('Startup reconciliation skipped (paper mode).');
    return;
  }
  logger.info('Reconciling open orders and balances.');
  await tradingGate.refreshBanStatus();
  const balances = await tradingGate.fetchBalances();
  const openOrders = await tradingGate.fetchOpenOrders();
  logger.info('Balance snapshot captured', { balances });
  logger.info('Open orders snapshot captured', { openOrders });
};

const ensureTradingReady = (): void => {
  if (killSwitch.isEnabled()) {
    throw new Error('Kill switch is enabled');
  }
  if (riskManager.isBreakerTripped()) {
    throw new Error('Circuit breaker is tripped');
  }
  tradingGate.ensureTradingAllowed();
};

app.get('/api/status', (_req, res) => {
  res.json({
    ok: true,
    liveTrading: tradingGate.isLive(),
    banned: tradingGate.isLive() ? tradingGate.isBanned() : false,
    breakerTripped: riskManager.isBreakerTripped(),
    killSwitch: killSwitch.isEnabled(),
    markets: marketDiscovery.list().length,
    orders: store.listOrders().length,
  });
});

app.get('/api/markets', (_req, res) => {
  res.json({ markets: marketDiscovery.list() });
});

app.post('/api/markets/refresh', async (_req, res) => {
  const markets = await marketDiscovery.refresh();
  res.json({ markets });
});

app.get('/api/markets/:id/orderbook/snapshot', async (req, res) => {
  const snapshot = await snapshotService.fetchOrderbook(req.params.id);
  orderbook.applySnapshot(snapshot);
  res.json({ snapshot });
});

app.get('/api/orders', (_req, res) => {
  res.json({ orders: store.listOrders(), fills: store.listFills() });
});

app.post('/api/orders', async (req, res) => {
  const { marketId, side, price, size } = req.body as {
    marketId: string;
    side: OrderSide;
    price: number;
    size: number;
  };
  try {
    riskManager.checkOrderSize(size);
    riskManager.checkPositionLimits(pnlTracker.listPositions(), marketId, side === 'buy' ? size : -size);
    riskManager.checkDailyLoss(pnlTracker.totalPnl());
    if (tradingGate.isLive()) {
      ensureTradingReady();
      const now = new Date().toISOString();
      const order = {
        id: `${marketId}-${now}`,
        marketId,
        side,
        price,
        size,
        status: 'open' as const,
        createdAt: now,
        updatedAt: now,
        live: true,
      };
      store.upsertOrder(order);
      logger.info('Live order accepted (stub)', { marketId, side, price, size });
      res.json({ order });
      return;
    }
    const order = paperEngine.placeOrder(marketId, side, price, size);
    pnlTracker.snapshot();
    res.json({ order });
  } catch (error) {
    riskManager.recordError();
    logger.error('Order rejected', { error: String(error) });
    res.status(400).json({ error: String(error) });
  }
});

app.delete('/api/orders/:id', (req, res) => {
  const order = paperEngine.cancelOrder(req.params.id);
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  res.json({ order });
});

app.get('/api/positions', (_req, res) => {
  res.json({ positions: pnlTracker.listPositions() });
});

app.get('/api/pnl', (_req, res) => {
  res.json({ snapshot: pnlTracker.snapshot(), history: store.listPnlSnapshots() });
});

app.get('/api/logs', (_req, res) => {
  res.json({ logs: logger.list(200) });
});

app.post('/api/control/kill-switch', (req, res) => {
  const { enabled } = req.body as { enabled: boolean };
  killSwitch.setEnabled(Boolean(enabled));
  res.json({ enabled: killSwitch.isEnabled() });
});

app.post('/api/control/circuit-breaker/reset', (_req, res) => {
  riskManager.resetBreaker();
  res.json({ breakerTripped: riskManager.isBreakerTripped() });
});

app.post('/api/control/resync', async (_req, res) => {
  await reconcileStartup();
  wsClient.resync();
  res.json({ status: 'resynced' });
});

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const onLog = (entry: unknown) => send('log', entry);
  logger.on('log', onLog);

  req.on('close', () => {
    logger.off('log', onLog);
    res.end();
  });
});

const start = async (): Promise<void> => {
  await tradingGate.initialize();
  await reconcileStartup();
  let markets = [] as { id: string }[];
  try {
    markets = await marketDiscovery.refresh();
  } catch (error) {
    logger.error('Market refresh failed', { error: String(error) });
  }
  wsClient.connect();
  if (markets.length) {
    wsClient.subscribe('market', { marketIds: markets.map((market) => market.id) });
  }
  if (config.userId) {
    wsClient.subscribe('user', { userId: config.userId });
  }
  app.listen(config.port, () => {
    logger.info(`Backend listening on ${config.port}`);
  });
};

start().catch((error) => {
  logger.error('Failed to start backend', { error: String(error) });
});
