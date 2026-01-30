import { Position, Fill, PnlSnapshot } from '../types';
import { SqliteStore } from '../storage/sqlite';

export class PnlTracker {
  private positions = new Map<string, Position>();

  constructor(private store: SqliteStore) {}

  onFill(fill: Fill): void {
    const key = fill.marketId;
    const existing = this.positions.get(key);
    const signedSize = fill.side === 'buy' ? fill.size : -fill.size;
    if (!existing) {
      this.positions.set(key, {
        marketId: fill.marketId,
        size: signedSize,
        avgPrice: fill.price,
        realizedPnl: 0,
        unrealizedPnl: 0,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    const newSize = existing.size + signedSize;
    const realized = this.calculateRealized(existing, fill);
    const avgPrice = newSize === 0 ? 0 : this.calculateAvgPrice(existing, fill, newSize);

    this.positions.set(key, {
      ...existing,
      size: newSize,
      avgPrice,
      realizedPnl: existing.realizedPnl + realized,
      updatedAt: new Date().toISOString(),
    });
  }

  updateUnrealized(marketId: string, markPrice: number): void {
    const position = this.positions.get(marketId);
    if (!position) return;
    const unrealized = (markPrice - position.avgPrice) * position.size;
    this.positions.set(marketId, {
      ...position,
      unrealizedPnl: unrealized,
      updatedAt: new Date().toISOString(),
    });
  }

  listPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  totalPnl(): number {
    return Array.from(this.positions.values()).reduce((sum, pos) => sum + pos.realizedPnl + pos.unrealizedPnl, 0);
  }

  snapshot(): PnlSnapshot {
    const realized = Array.from(this.positions.values()).reduce((sum, pos) => sum + pos.realizedPnl, 0);
    const unrealized = Array.from(this.positions.values()).reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
    const snapshot: PnlSnapshot = {
      timestamp: new Date().toISOString(),
      totalPnl: realized + unrealized,
      realizedPnl: realized,
      unrealizedPnl: unrealized,
    };
    this.store.insertPnlSnapshot(snapshot);
    return snapshot;
  }

  private calculateRealized(position: Position, fill: Fill): number {
    const closing = position.size !== 0 && Math.sign(position.size) !== Math.sign(fill.side === 'buy' ? 1 : -1);
    if (!closing) return 0;
    const sizeClosed = Math.min(Math.abs(position.size), fill.size);
    const priceDelta = (fill.price - position.avgPrice) * Math.sign(position.size);
    return sizeClosed * priceDelta;
  }

  private calculateAvgPrice(position: Position, fill: Fill, newSize: number): number {
    if (newSize === 0) return 0;

    const prevSize = position.size;
    const prevAbs = Math.abs(prevSize);
    const newAbs = Math.abs(newSize);

    // If we were flat before, the fill opens a new position at the fill price.
    if (prevAbs === 0) {
      return fill.price;
    }

    const positionDir = Math.sign(prevSize); // +1 for long, -1 for short
    const fillDir = fill.side === 'buy' ? 1 : -1;
    const newDir = Math.sign(newSize);

    // Opposite direction trade: either a partial close or a flip.
    if (positionDir !== 0 && positionDir !== fillDir) {
      // If the new position has the opposite sign from the old position, we've flipped.
      if (newDir !== 0 && newDir !== positionDir) {
        // Flip: position direction changed; the remaining open size comes from this fill.
        return fill.price;
      }
      // Partial close: remaining position is smaller in absolute terms; keep avg price unchanged.
      if (newAbs < prevAbs) {
        return position.avgPrice;
      }
      // newAbs === prevAbs would imply newSize === 0, which is handled at the top.
    }

    // Same direction (increasing position): recompute weighted average using absolute quantities.
    const totalQty = prevAbs + fill.size;
    if (totalQty === 0) {
      return 0;
    }
    const existingNotional = position.avgPrice * prevAbs;
    const fillNotional = fill.price * fill.size;
    return (existingNotional + fillNotional) / totalQty;
  }
}
