#!/usr/bin/env node
/**
 * Safety Check Script
 * 
 * Enforces safety gates before running tests or scripts that perform live writes.
 * This script validates environment variables to prevent accidental live trading
 * in development or CI environments.
 * 
 * Required Environment Variables:
 * - LIVE_TRADING: Must be 'true' for write operations
 * - COMPLIANCE_ACCEPTED: Must be 'true' to acknowledge compliance responsibilities
 * - FORCE_REAL_TEST: Must be 'true' to run real API tests with write operations
 * - ALLOWED_TEST_RUNNERS: Optional comma-separated list of allowed usernames/hostnames
 * 
 * Usage:
 *   node scripts/safety-check.js --action=write
 *   node scripts/safety-check.js --action=read
 */

const os = require('os');
const process = require('process');

// Parse command line arguments
const args = process.argv.slice(2);
const actionArg = args.find(arg => arg.startsWith('--action='));
const action = actionArg ? actionArg.split('=')[1] : 'write';

// Get environment variables
const LIVE_TRADING = process.env.LIVE_TRADING;
const COMPLIANCE_ACCEPTED = process.env.COMPLIANCE_ACCEPTED;
const FORCE_REAL_TEST = process.env.FORCE_REAL_TEST;
const ALLOWED_TEST_RUNNERS = process.env.ALLOWED_TEST_RUNNERS;

// Get current user and hostname
const currentUser = process.env.USER || process.env.USERNAME || 'unknown';
const currentHostname = os.hostname();

/**
 * Check if the current runner is allowed
 * @returns {boolean} True if allowed or no restrictions set
 */
function isRunnerAllowed() {
  if (!ALLOWED_TEST_RUNNERS) {
    // No restrictions - allow any runner
    return true;
  }
  
  const allowedRunners = ALLOWED_TEST_RUNNERS.split(',').map(r => r.trim().toLowerCase());
  const userMatch = allowedRunners.includes(currentUser.toLowerCase());
  const hostnameMatch = allowedRunners.includes(currentHostname.toLowerCase());
  
  return userMatch || hostnameMatch;
}

/**
 * Perform safety checks based on action type
 * @param {string} action - 'read' or 'write'
 * @returns {boolean} True if checks pass
 */
function performSafetyChecks(action) {
  console.log(`[Safety Check] Running safety checks for action: ${action}`);
  console.log(`[Safety Check] Current user: ${currentUser}`);
  console.log(`[Safety Check] Current hostname: ${currentHostname}`);
  
  // Read-only operations have minimal requirements
  if (action === 'read') {
    console.log('[Safety Check] ✓ Read-only operation - no write gates required');
    return true;
  }
  
  // Write operations require all safety gates
  if (action === 'write') {
    const checks = [];
    
    // Check LIVE_TRADING
    if (LIVE_TRADING !== 'true') {
      checks.push('❌ LIVE_TRADING must be set to "true"');
    } else {
      checks.push('✓ LIVE_TRADING is enabled');
    }
    
    // Check COMPLIANCE_ACCEPTED
    if (COMPLIANCE_ACCEPTED !== 'true') {
      checks.push('❌ COMPLIANCE_ACCEPTED must be set to "true"');
    } else {
      checks.push('✓ COMPLIANCE_ACCEPTED is acknowledged');
    }
    
    // Check FORCE_REAL_TEST
    if (FORCE_REAL_TEST !== 'true') {
      checks.push('❌ FORCE_REAL_TEST must be set to "true"');
    } else {
      checks.push('✓ FORCE_REAL_TEST is enabled');
    }
    
    // Check runner restrictions
    if (ALLOWED_TEST_RUNNERS && !isRunnerAllowed()) {
      checks.push(`❌ Current runner not allowed. Allowed: ${ALLOWED_TEST_RUNNERS}`);
    } else if (ALLOWED_TEST_RUNNERS) {
      checks.push('✓ Runner is in allowed list');
    } else {
      checks.push('⚠ No runner restrictions configured (ALLOWED_TEST_RUNNERS not set)');
    }
    
    // Print all checks
    checks.forEach(check => console.log(`[Safety Check] ${check}`));
    
    // Determine if all required checks passed
    const allPassed = LIVE_TRADING === 'true' 
      && COMPLIANCE_ACCEPTED === 'true' 
      && FORCE_REAL_TEST === 'true'
      && isRunnerAllowed();
    
    if (!allPassed) {
      console.error('\n[Safety Check] ❌ SAFETY CHECK FAILED');
      console.error('[Safety Check] Write operations are BLOCKED due to missing safety gates.');
      console.error('[Safety Check] Set the following environment variables to proceed:');
      console.error('[Safety Check]   LIVE_TRADING=true');
      console.error('[Safety Check]   COMPLIANCE_ACCEPTED=true');
      console.error('[Safety Check]   FORCE_REAL_TEST=true');
      if (ALLOWED_TEST_RUNNERS) {
        console.error('[Safety Check]   Ensure runner is in ALLOWED_TEST_RUNNERS list');
      }
      return false;
    }
    
    console.log('\n[Safety Check] ✓ ALL SAFETY CHECKS PASSED');
    console.log('[Safety Check] Write operations are ALLOWED');
    console.log('[Safety Check] WARNING: This will perform REAL API calls with write operations!');
    return true;
  }
  
  // Unknown action
  console.error(`[Safety Check] ❌ Unknown action: ${action}`);
  console.error('[Safety Check] Valid actions: read, write');
  return false;
}

// Run safety checks
const passed = performSafetyChecks(action);

// Exit with appropriate code
process.exit(passed ? 0 : 1);
