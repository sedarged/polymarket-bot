import { logger } from './logger';

export interface RetryOptions {
  attempts?: number;
  delay?: number;
  backoffMultiplier?: number;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    attempts = 3,
    delay = 1000,
    backoffMultiplier = 2,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      logger.warn(
        `Attempt ${attempt}/${attempts} failed: ${lastError.message}`
      );

      if (attempt < attempts) {
        const waitTime = delay * Math.pow(backoffMultiplier, attempt - 1);
        logger.debug(`Waiting ${waitTime}ms before retry...`);
        await sleep(waitTime);
      }
    }
  }

  throw lastError || new Error(`Retry failed: Unknown error after ${attempts} attempts`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
