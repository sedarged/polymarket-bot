import { config } from '../config';
import { Position } from '../types';

export class RiskManager {
  private errorCount = 0;
  private breakerUntil = 0;

  checkOrderSize(size: number): void {
    if (size > config.risk.maxOrderSize) {
      throw new Error('Order size exceeds max order size');
    }
  }

  checkPositionLimits(positions: Position[], marketId: string, deltaSize: number): void {
    const position = positions.find((pos) => pos.marketId === marketId);
    const currentSize = position?.size ?? 0;
    if (Math.abs(currentSize + deltaSize) > config.risk.maxPositionSize) {
      throw new Error('Position size exceeds risk limit');
    }
  }

  checkDailyLoss(totalPnl: number): void {
    if (totalPnl < -config.risk.maxDailyLoss) {
      throw new Error('Daily loss limit exceeded');
    }
  }

  recordError(): void {
    this.errorCount += 1;
    if (this.errorCount >= config.circuitBreaker.maxErrorCount) {
      this.breakerUntil = Date.now() + config.circuitBreaker.coolDownMs;
    }
  }

  resetBreaker(): void {
    this.errorCount = 0;
    this.breakerUntil = 0;
  }

  isBreakerTripped(): boolean {
    return Date.now() < this.breakerUntil;
  }
}
