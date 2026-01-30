import { Market } from '@polymarket/shared';

export function formatMarketHeadline(market: Market): string {
  return `${market.question} (${market.marketSlug})`;
}
