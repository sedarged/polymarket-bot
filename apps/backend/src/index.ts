#!/usr/bin/env node

import { run } from './cli';
import { startServer } from './server';
import { logger } from './utils/logger';

const args = process.argv.slice(2);

if (args.length === 0) {
  startServer();
} else {
  run(args).catch((error) => {
    logger.error('CLI command failed', { error: error.message });
    process.exit(1);
  });
}
