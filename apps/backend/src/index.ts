#!/usr/bin/env node

import { run } from './cli';
import { startServer } from './server';
import { logger } from './utils/logger';

const args = process.argv.slice(2);

if (args.length === 0) {
  try {
    const maybePromise = startServer();
    if (maybePromise && typeof (maybePromise as Promise<unknown>).catch === 'function') {
      (maybePromise as Promise<unknown>).catch((error: unknown) => {
        logger.error('Server failed to start', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      });
    }
  } catch (error: unknown) {
    logger.error('Server failed to start', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
} else {
  run(args).catch((error) => {
    logger.error('CLI command failed', { error: error.message });
    process.exit(1);
  });
}
