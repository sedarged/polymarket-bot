#!/usr/bin/env node
/**
 * Safety Check Script
 * 
 * Enforces environment guards before write actions or write-test runs.
 * Validates LIVE_TRADING, COMPLIANCE_ACCEPTED, FORCE_REAL_TEST, and ALLOWED_TEST_RUNNERS.
 * Exits with non-zero code if requirements are not satisfied.
 * 
 * Usage:
 *   node scripts/safety-check.js [--write] [--runner <runner-name>]
 * 
 * Options:
 *   --write    Check for write operation permissions (paper trading)
 *   --runner   Specify the test runner name for ALLOWED_TEST_RUNNERS validation
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env if it exists
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    write: false,
    runner: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--write') {
      options.write = true;
    } else if (args[i] === '--runner' && i + 1 < args.length) {
      options.runner = args[i + 1];
      i++;
    }
  }

  return options;
}

function checkEnvVar(name, expectedValue = 'true') {
  const value = process.env[name];
  return value === expectedValue;
}

function main() {
  const options = parseArgs();

  console.log('🔒 Running safety checks...');
  console.log(`   Mode: ${options.write ? 'WRITE (Paper Trading)' : 'READ-ONLY'}`);
  
  if (options.write) {
    // Write operations require multiple gates
    const checks = [
      {
        name: 'LIVE_TRADING',
        value: process.env.LIVE_TRADING,
        required: 'true',
        reason: 'Write operations require LIVE_TRADING=true to acknowledge risk',
      },
      {
        name: 'COMPLIANCE_ACCEPTED',
        value: process.env.COMPLIANCE_ACCEPTED,
        required: 'true',
        reason: 'Write operations require COMPLIANCE_ACCEPTED=true to confirm compliance',
      },
      {
        name: 'FORCE_REAL_TEST',
        value: process.env.FORCE_REAL_TEST,
        required: 'any-non-empty',
        reason: 'Write operations require FORCE_REAL_TEST token for authorization',
      },
    ];

    let failed = false;

    for (const check of checks) {
      const passed =
        check.required === 'any-non-empty'
          ? check.value && check.value.trim().length > 0
          : check.value === check.required;

      if (!passed) {
        console.error(`❌ FAILED: ${check.name}`);
        console.error(`   Current value: ${check.value || '(not set)'}`);
        console.error(`   Required: ${check.required}`);
        console.error(`   Reason: ${check.reason}`);
        failed = true;
      } else {
        console.log(`✅ PASSED: ${check.name}`);
      }
    }

    // Check ALLOWED_TEST_RUNNERS if runner is specified
    if (options.runner) {
      const allowed = process.env.ALLOWED_TEST_RUNNERS || '';
      const allowedList = allowed.split(',').map((r) => r.trim()).filter(Boolean);
      
      if (allowedList.length === 0 || allowedList.includes(options.runner)) {
        console.log(`✅ PASSED: Test runner "${options.runner}" is allowed`);
      } else {
        console.error(`❌ FAILED: Test runner not allowed`);
        console.error(`   Current runner: ${options.runner}`);
        console.error(`   Allowed runners: ${allowedList.join(', ') || '(none)'}`);
        console.error(`   Reason: ALLOWED_TEST_RUNNERS must include the test runner name`);
        failed = true;
      }
    }

    if (failed) {
      console.error('\n🚫 Safety checks failed. Write operations are not permitted.');
      console.error('   Please verify environment variables and authorization.');
      process.exit(1);
    }

    console.log('\n✅ All safety checks passed. Write operations are permitted.');
  } else {
    // Read-only operations don't require special gates
    console.log('✅ Read-only mode. No special gates required.');
  }

  console.log('');
  process.exit(0);
}

main();
