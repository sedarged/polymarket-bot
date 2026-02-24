/**
 * Chaos Testing Helpers
 * 
 * Utilities for injecting failures and validating recovery in chaos engineering tests.
 */

/**
 * Simulate network latency
 */
export async function simulateNetworkLatency(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simulate intermittent network failure (randomly fails based on probability)
 */
export function createIntermittentNetworkFailure(failureProbability: number = 0.3) {
  return () => Math.random() < failureProbability;
}

/**
 * Wait for condition with timeout
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  pollIntervalMs: number = 50
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const result = await Promise.resolve(condition());
    if (result) {
      return true;
    }
    await simulateNetworkLatency(pollIntervalMs);
  }
  
  return false;
}

/**
 * Wait for event to be emitted
 */
export function waitForEvent<T = any>(
  emitter: any,
  eventName: string,
  timeoutMs: number = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    let timeout: NodeJS.Timeout;

    const handler = (data: T) => {
      clearTimeout(timeout);
      resolve(data);
    };

    timeout = setTimeout(() => {
      emitter.off(eventName, handler);
      reject(new Error(`Timeout waiting for event: ${eventName}`));
    }, timeoutMs);

    emitter.once(eventName, handler);
  });
}

/**
 * Count events emitted within a time window
 */
export async function countEvents(
  emitter: any,
  eventName: string,
  durationMs: number
): Promise<number> {
  return new Promise((resolve) => {
    let count = 0;
    
    const handler = () => {
      count++;
    };
    
    emitter.on(eventName, handler);
    
    setTimeout(() => {
      emitter.off(eventName, handler);
      resolve(count);
    }, durationMs);
  });
}

/**
 * Simulate random process crash (throws error)
 */
export function simulateProcessCrash(message: string = 'Simulated process crash'): never {
  throw new Error(message);
}

/**
 * Create a mock server that can be programmatically crashed
 */
export class CrashableWebSocketServer {
  private connections: Set<any> = new Set();
  
  constructor(private server: any) {
    server.on('connection', (ws: any) => {
      this.connections.add(ws);
      
      ws.on('close', () => {
        this.connections.delete(ws);
      });
    });
  }
  
  /**
   * Crash server by closing all connections immediately
   */
  crash(): void {
    this.connections.forEach((ws) => {
      ws.terminate(); // Abrupt close without handshake
    });
    this.connections.clear();
  }
  
  /**
   * Gracefully close all connections
   */
  gracefulShutdown(): void {
    this.connections.forEach((ws) => {
      ws.close(); // Proper close with handshake
    });
    this.connections.clear();
  }
  
  /**
   * Simulate network partition (stop responding but don't close)
   */
  simulateNetworkPartition(): void {
    this.connections.forEach((ws) => {
      // Pause the socket to simulate network partition
      ws.pause();
    });
  }
  
  /**
   * Resume after network partition
   */
  resumeFromPartition(): void {
    this.connections.forEach((ws) => {
      ws.resume();
    });
  }
  
  getConnectionCount(): number {
    return this.connections.size;
  }
}

/**
 * Measure time taken for async operation
 */
export async function measureTime<T>(
  operation: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await operation();
  const durationMs = Date.now() - start;
  
  return { result, durationMs };
}

/**
 * Retry operation with validation
 */
export async function retryUntilSuccess<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 5,
  delayMs: number = 100
): Promise<{ result: T; attempts: number }> {
  let attempts = 0;
  let lastError: Error | undefined;
  
  while (attempts < maxAttempts) {
    attempts++;
    try {
      const result = await operation();
      return { result, attempts };
    } catch (error) {
      lastError = error as Error;
      if (attempts < maxAttempts) {
        await simulateNetworkLatency(delayMs);
      }
    }
  }
  
  throw lastError || new Error('Retry failed');
}

/**
 * Check if exponential backoff is being applied
 */
export function validateExponentialBackoff(
  delays: number[],
  baseDelay: number,
  maxDelay: number,
  tolerance: number = 0.5
): boolean {
  for (let i = 1; i < delays.length; i++) {
    const expectedDelay = Math.min(baseDelay * Math.pow(2, i - 1), maxDelay);
    const actualDelay = delays[i] - delays[i - 1];
    
    // Check if delay is within tolerance range (accounts for jitter)
    const minExpected = expectedDelay * (1 - tolerance);
    const maxExpected = expectedDelay * (1 + tolerance);
    
    if (actualDelay < minExpected || actualDelay > maxExpected) {
      return false;
    }
  }
  
  return true;
}
