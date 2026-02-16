#!/usr/bin/env bash
# Deployment Verification Script
# Verifies that a deployment is healthy and functioning correctly
# Usage: ./scripts/verify-deployment.sh <environment> [base-url]
#   environment: staging or production
#   base-url: Optional. Defaults to localhost:3000

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_SKIPPED=0

# Configuration
ENVIRONMENT="${1:-staging}"
BASE_URL="${2:-http://localhost:3000}"
TIMEOUT=10

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Deployment Verification Script${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo "Environment: ${ENVIRONMENT}"
echo "Base URL: ${BASE_URL}"
echo "Timeout: ${TIMEOUT}s"
echo ""

# Helper functions
check_pass() {
  echo -e "${GREEN}✓${NC} $1"
  CHECKS_PASSED=$((CHECKS_PASSED + 1))
}

check_fail() {
  echo -e "${RED}✗${NC} $1"
  CHECKS_FAILED=$((CHECKS_FAILED + 1))
}

check_skip() {
  echo -e "${YELLOW}⊘${NC} $1"
  CHECKS_SKIPPED=$((CHECKS_SKIPPED + 1))
}

check_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

section() {
  echo ""
  echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

# Check if required tools are installed
section "Prerequisites"

if command -v curl &> /dev/null; then
  check_pass "curl is installed"
else
  check_fail "curl is not installed"
  echo "Please install curl to run this script"
  exit 1
fi

if command -v jq &> /dev/null; then
  check_pass "jq is installed"
  HAS_JQ=true
else
  check_warn "jq is not installed (JSON validation will be skipped)"
  HAS_JQ=false
fi

# 1. Health Check
section "Health Check"

HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" --max-time "$TIMEOUT" "${BASE_URL}/health" || echo "000")
HEALTH_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

if [ "$HEALTH_CODE" = "200" ]; then
  check_pass "Health endpoint returns 200 OK"
  
  if [ "$HAS_JQ" = true ]; then
    if echo "$HEALTH_BODY" | jq -e '.status == "ok"' > /dev/null 2>&1; then
      check_pass "Health response has valid JSON with status: ok"
    else
      check_fail "Health response JSON is invalid or missing status"
      echo "Response: $HEALTH_BODY"
    fi
  fi
else
  check_fail "Health endpoint failed (HTTP $HEALTH_CODE)"
  echo "Response: $HEALTH_BODY"
fi

# 2. Metrics Check
section "Metrics Endpoint"

METRICS_RESPONSE=$(curl -s -w "\n%{http_code}" --max-time "$TIMEOUT" "${BASE_URL}/metrics" || echo "000")
METRICS_CODE=$(echo "$METRICS_RESPONSE" | tail -n1)
METRICS_BODY=$(echo "$METRICS_RESPONSE" | head -n-1)

if [ "$METRICS_CODE" = "200" ]; then
  check_pass "Metrics endpoint returns 200 OK"
  
  # Check for Prometheus format
  if echo "$METRICS_BODY" | grep -q "^# HELP"; then
    check_pass "Metrics endpoint returns Prometheus format"
  else
    check_warn "Metrics endpoint doesn't appear to be Prometheus format"
  fi
  
  # Check for key metrics
  if echo "$METRICS_BODY" | grep -q "http_requests_total"; then
    check_pass "HTTP request metrics present"
  else
    check_skip "HTTP request metrics not found (may not be available yet)"
  fi
else
  check_fail "Metrics endpoint failed (HTTP $METRICS_CODE)"
fi

# 3. API Endpoints
section "API Endpoints"

# Markets endpoint
MARKETS_RESPONSE=$(curl -s -w "\n%{http_code}" --max-time "$TIMEOUT" "${BASE_URL}/api/markets?limit=1" || echo "000")
MARKETS_CODE=$(echo "$MARKETS_RESPONSE" | tail -n1)

if [ "$MARKETS_CODE" = "200" ]; then
  check_pass "Markets API endpoint accessible"
else
  check_warn "Markets API endpoint returned HTTP $MARKETS_CODE (may require authentication)"
fi

# Status endpoint
STATUS_RESPONSE=$(curl -s -w "\n%{http_code}" --max-time "$TIMEOUT" "${BASE_URL}/api/status" || echo "000")
STATUS_CODE=$(echo "$STATUS_RESPONSE" | tail -n1)

if [ "$STATUS_CODE" = "200" ] || [ "$STATUS_CODE" = "401" ]; then
  check_pass "Status API endpoint exists"
else
  check_skip "Status API endpoint not found (HTTP $STATUS_CODE)"
fi

# 4. Configuration Checks
section "Configuration"

# Check if we can access environment info (may require auth)
CONFIG_RESPONSE=$(curl -s -w "\n%{http_code}" --max-time "$TIMEOUT" "${BASE_URL}/api/config" || echo "000")
CONFIG_CODE=$(echo "$CONFIG_RESPONSE" | tail -n1)

if [ "$CONFIG_CODE" = "200" ]; then
  CONFIG_BODY=$(echo "$CONFIG_RESPONSE" | head -n-1)
  check_pass "Configuration endpoint accessible"
  
  if [ "$HAS_JQ" = true ]; then
    # Check trading gates for production
    if [ "$ENVIRONMENT" = "production" ]; then
      LIVE_TRADING=$(echo "$CONFIG_BODY" | jq -r '.liveTrading // "unknown"')
      if [ "$LIVE_TRADING" = "true" ]; then
        check_pass "LIVE_TRADING is enabled (production)"
      elif [ "$LIVE_TRADING" = "unknown" ]; then
        check_skip "Cannot verify LIVE_TRADING setting"
      else
        check_warn "LIVE_TRADING is disabled in production"
      fi
    else
      # Staging should have live trading disabled
      check_skip "Trading gates check (not applicable to staging)"
    fi
  fi
elif [ "$CONFIG_CODE" = "401" ] || [ "$CONFIG_CODE" = "403" ]; then
  check_skip "Configuration endpoint requires authentication"
else
  check_skip "Configuration endpoint not accessible (HTTP $CONFIG_CODE)"
fi

# 5. Database/Persistence
section "Data Persistence"

# This check requires SSH access or Docker access to the deployment
if [ -n "${SSH_HOST:-}" ]; then
  # Check if data directory exists
  if ssh -o ConnectTimeout=5 "$SSH_HOST" "test -d /app/data" 2>/dev/null; then
    check_pass "Data directory exists on deployment server"
    
    # Check for database files
    if ssh "$SSH_HOST" "ls /app/data/*.db 2>/dev/null | wc -l | grep -q -v '^0$'"; then
      check_pass "Database files found in data directory"
    else
      check_warn "No database files found (may be first deployment)"
    fi
  else
    check_fail "Data directory not found on deployment server"
  fi
elif command -v docker &> /dev/null && docker ps | grep -q "polymarket-bot"; then
  # Local Docker check
  if docker exec polymarket-bot test -d /app/data 2>/dev/null; then
    check_pass "Data directory exists in container"
    
    if docker exec polymarket-bot sh -c 'ls /app/data/*.db 2>/dev/null | wc -l | grep -q -v "^0$"' 2>/dev/null; then
      check_pass "Database files found in container"
    else
      check_warn "No database files found (may be first deployment)"
    fi
  else
    check_fail "Data directory not found in container"
  fi
else
  check_skip "Cannot verify data persistence (no SSH or Docker access)"
fi

# 6. Logging
section "Logging"

# Check if we can access logs
if [ -n "${SSH_HOST:-}" ]; then
  # Get last 10 lines of logs
  LOGS=$(ssh "$SSH_HOST" "docker logs --tail 10 polymarket-bot 2>&1" || echo "")
  
  if [ -n "$LOGS" ]; then
    check_pass "Can access application logs"
    
    # Check for critical errors in recent logs
    if echo "$LOGS" | grep -qi "fatal\|critical"; then
      check_fail "FATAL or CRITICAL errors found in recent logs"
      echo "Last 10 log lines:"
      echo "$LOGS"
    else
      check_pass "No critical errors in recent logs"
    fi
  else
    check_skip "Cannot access logs via SSH"
  fi
elif command -v docker &> /dev/null && docker ps | grep -q "polymarket-bot"; then
  # Local Docker check
  LOGS=$(docker logs --tail 10 polymarket-bot 2>&1)
  
  check_pass "Can access application logs"
  
  if echo "$LOGS" | grep -qi "fatal\|critical"; then
    check_fail "FATAL or CRITICAL errors found in recent logs"
    echo "Last 10 log lines:"
    echo "$LOGS"
  else
    check_pass "No critical errors in recent logs"
  fi
else
  check_skip "Cannot verify logging (no SSH or Docker access)"
fi

# 7. Security
section "Security Checks"

# Check if secrets are exposed in health endpoint
if echo "$HEALTH_BODY" | grep -qiE "private.?key|secret|password|token.*[a-f0-9]{32}"; then
  check_fail "Potential secrets exposed in health endpoint"
  echo "SECURITY WARNING: Health endpoint may be leaking sensitive information"
else
  check_pass "No obvious secrets in health endpoint"
fi

# Check HTTPS in production
if [ "$ENVIRONMENT" = "production" ]; then
  if echo "$BASE_URL" | grep -q "^https://"; then
    check_pass "Using HTTPS in production"
  else
    check_warn "Not using HTTPS in production (BASE_URL: $BASE_URL)"
  fi
else
  check_skip "HTTPS check (not required for staging)"
fi

# 8. Monitoring & Alerting
section "Monitoring"

# Check if Telegram alerting is configured
ALERT_TEST_RESPONSE=$(curl -s -w "\n%{http_code}" --max-time "$TIMEOUT" -X POST "${BASE_URL}/api/test-alert" || echo "000")
ALERT_TEST_CODE=$(echo "$ALERT_TEST_RESPONSE" | tail -n1)

if [ "$ALERT_TEST_CODE" = "200" ]; then
  check_pass "Alert testing endpoint accessible"
  check_warn "Manual verification: Check if test alert was received"
elif [ "$ALERT_TEST_CODE" = "401" ] || [ "$ALERT_TEST_CODE" = "403" ]; then
  check_skip "Alert testing requires authentication"
else
  check_skip "Alert testing endpoint not found (HTTP $ALERT_TEST_CODE)"
fi

# 9. Performance
section "Performance"

# Response time check
START_TIME=$(date +%s%N)
curl -s --max-time "$TIMEOUT" "${BASE_URL}/health" > /dev/null
END_TIME=$(date +%s%N)
RESPONSE_TIME_MS=$(( (END_TIME - START_TIME) / 1000000 ))

if [ "$RESPONSE_TIME_MS" -lt 1000 ]; then
  check_pass "Health endpoint response time: ${RESPONSE_TIME_MS}ms (good)"
elif [ "$RESPONSE_TIME_MS" -lt 3000 ]; then
  check_warn "Health endpoint response time: ${RESPONSE_TIME_MS}ms (acceptable)"
else
  check_fail "Health endpoint response time: ${RESPONSE_TIME_MS}ms (too slow)"
fi

# Summary
section "Summary"

TOTAL_CHECKS=$((CHECKS_PASSED + CHECKS_FAILED + CHECKS_SKIPPED))

echo ""
echo "Total checks: $TOTAL_CHECKS"
echo -e "${GREEN}Passed: $CHECKS_PASSED${NC}"
echo -e "${RED}Failed: $CHECKS_FAILED${NC}"
echo -e "${YELLOW}Skipped: $CHECKS_SKIPPED${NC}"
echo ""

if [ "$CHECKS_FAILED" -eq 0 ]; then
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}✓ Deployment verification PASSED${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 0
else
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}✗ Deployment verification FAILED${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "Please review the failed checks above and fix any issues."
  echo "For troubleshooting, see: docs/deployment-guide.md#troubleshooting"
  exit 1
fi
