#!/usr/bin/env node

import { run } from './cli';

const args = process.argv.slice(2);

run(args).catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
