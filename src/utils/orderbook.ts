import { Orderbook, OrderbookSummary } from '../domain/orderbook';

export function calculateOrderbookSummary(orderbook: Orderbook): OrderbookSummary {
  const bestBid = orderbook.bids.length > 0 ? orderbook.bids[0].price : null;
  const bestAsk = orderbook.asks.length > 0 ? orderbook.asks[0].price : null;
  
  let mid: string | null = null;
  let spread: string | null = null;

  if (bestBid !== null && bestAsk !== null) {
    const bidNum = parseFloat(bestBid);
    const askNum = parseFloat(bestAsk);
    
    mid = ((bidNum + askNum) / 2).toFixed(4);
    spread = (askNum - bidNum).toFixed(4);
  }

  return {
    tokenId: orderbook.asset_id,
    bestBid,
    bestAsk,
    mid,
    spread,
  };
}

export function formatOrderbookSummary(summary: OrderbookSummary): string {
  const lines = [
    `Token ID: ${summary.tokenId}`,
    `Best Bid: ${summary.bestBid || 'N/A'}`,
    `Best Ask: ${summary.bestAsk || 'N/A'}`,
    `Mid Price: ${summary.mid || 'N/A'}`,
    `Spread: ${summary.spread || 'N/A'}`,
  ];
  
  return lines.join('\n');
}
