#!/usr/bin/env bash
# Pre-Deployment Environment Verification Script (GAP-016)
# Validates environment variables, credentials, connectivity, and cloud resources
# before deploying the bot to any environment.
#
# Usage:
#   ./scripts/verify-environment.sh [--env-file PATH] [--skip-connectivity]
#
# Options:
#   --env-file PATH       Path to .env file to validate (default: .env)
#   --skip-connectivity   Skip external service connectivity checks
#   --verbose            Show detailed output for all checks
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed
#   2 - Invalid usage or missing dependencies

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNED=0
CHECKS_SKIPPED=0

# Configuration
ENV_FILE=".env"
SKIP_CONNECTIVITY=false
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --skip-connectivity)
      SKIP_CONNECTIVITY=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    -h|--help)
      head -n 20 "$0" | tail -n 18 | sed 's/^# //'
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 2
      ;;
  esac
done

# Helper functions
check_pass() {
  echo -e "${GREEN}✓${NC} $1"
  CHECKS_PASSED=$((CHECKS_PASSED + 1))
}

check_fail() {
  echo -e "${RED}✗${NC} $1"
  CHECKS_FAILED=$((CHECKS_FAILED + 1))
}

check_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
  CHECKS_WARNED=$((CHECKS_WARNED + 1))
}

check_skip() {
  if [ "$VERBOSE" = true ]; then
    echo -e "${YELLOW}⊘${NC} $1"
  fi
  CHECKS_SKIPPED=$((CHECKS_SKIPPED + 1))
}

section() {
  echo ""
  echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

# Load environment file if it exists
load_env_file() {
  if [ -f "$ENV_FILE" ]; then
    # Export variables from .env file, handling quotes and comments
    set -a
    # shellcheck disable=SC1090
    source <(grep -v '^#' "$ENV_FILE" | grep -v '^$' | sed 's/\r$//')
    set +a
    return 0
  else
    return 1
  fi
}

# Check if a variable is set (empty is OK, undefined is not)
is_var_set() {
  local var_name="$1"
  [ -n "${!var_name+x}" ]
}

# Get variable value or default
get_var() {
  local var_name="$1"
  local default="${2:-}"
  if is_var_set "$var_name"; then
    echo "${!var_name}"
  else
    echo "$default"
  fi
}

# Validate URL format
is_valid_url() {
  local url="$1"
  [[ "$url" =~ ^(http|https|wss)://[a-zA-Z0-9.\-]+(:[0-9]+)?(/.*)?$ ]]
}

# Check if command exists
command_exists() {
  command -v "$1" &> /dev/null
}

# Print header
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Pre-Deployment Environment Verification (GAP-016)${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo "Environment file: $ENV_FILE"
echo "Skip connectivity: $SKIP_CONNECTIVITY"
echo ""

# Check prerequisites
section "Prerequisites"

if ! command_exists curl; then
  check_fail "curl is required but not installed"
  exit 2
fi

if ! command_exists jq; then
  check_warn "jq not installed (recommended for JSON parsing)"
fi

if ! command_exists node; then
  check_fail "Node.js is required but not installed"
  exit 2
else
  NODE_VERSION=$(node --version)
  if [[ "$NODE_VERSION" =~ ^v([0-9]+) ]]; then
    MAJOR_VERSION="${BASH_REMATCH[1]}"
    if [ "$MAJOR_VERSION" -ge 20 ]; then
      check_pass "Node.js $NODE_VERSION (>= 20.0.0 required)"
    else
      check_fail "Node.js $NODE_VERSION is too old (>= 20.0.0 required)"
    fi
  else
    check_warn "Cannot parse Node.js version: $NODE_VERSION"
  fi
fi

# Load environment variables
section "Environment File"

if load_env_file; then
  check_pass "Loaded environment from $ENV_FILE"
else
  check_warn "$ENV_FILE not found - checking system environment only"
fi

# Validate required environment variables
section "Required Environment Variables"

# Core API URLs
if is_var_set GAMMA_API_URL; then
  GAMMA_API_URL=$(get_var GAMMA_API_URL)
  if is_valid_url "$GAMMA_API_URL"; then
    check_pass "GAMMA_API_URL is set and valid: $GAMMA_API_URL"
  else
    check_fail "GAMMA_API_URL is set but invalid: $GAMMA_API_URL"
  fi
else
  check_fail "GAMMA_API_URL is not set (required)"
fi

if is_var_set CLOB_API_URL; then
  CLOB_API_URL=$(get_var CLOB_API_URL)
  if is_valid_url "$CLOB_API_URL"; then
    check_pass "CLOB_API_URL is set and valid: $CLOB_API_URL"
  else
    check_fail "CLOB_API_URL is set but invalid: $CLOB_API_URL"
  fi
else
  check_fail "CLOB_API_URL is not set (required)"
fi

if is_var_set WS_MARKET_URL; then
  WS_MARKET_URL=$(get_var WS_MARKET_URL)
  if is_valid_url "$WS_MARKET_URL"; then
    check_pass "WS_MARKET_URL is set and valid: $WS_MARKET_URL"
  else
    check_fail "WS_MARKET_URL is set but invalid: $WS_MARKET_URL"
  fi
else
  check_fail "WS_MARKET_URL is not set (required)"
fi

# Validate trading gates and compliance
section "Trading Gates & Compliance"

LIVE_TRADING=$(get_var LIVE_TRADING "false")
COMPLIANCE_ACCEPTED=$(get_var COMPLIANCE_ACCEPTED "false")

if [ "$LIVE_TRADING" = "true" ]; then
  check_warn "LIVE_TRADING=true (live trading enabled)"
  
  if [ "$COMPLIANCE_ACCEPTED" = "true" ]; then
    check_pass "COMPLIANCE_ACCEPTED=true (required for live trading)"
  else
    check_fail "COMPLIANCE_ACCEPTED must be true when LIVE_TRADING=true"
  fi
  
  # Check for private key when live trading
  SECRET_SOURCE=$(get_var SECRET_SOURCE "env")
  case "$SECRET_SOURCE" in
    env)
      if is_var_set PRIVATE_KEY && [ -n "$(get_var PRIVATE_KEY)" ]; then
        check_pass "PRIVATE_KEY is set (SECRET_SOURCE=env)"
      else
        check_fail "PRIVATE_KEY is required for live trading when SECRET_SOURCE=env"
      fi
      ;;
    encrypted)
      if is_var_set ENCRYPTION_KEY && [ -n "$(get_var ENCRYPTION_KEY)" ]; then
        check_pass "ENCRYPTION_KEY is set (SECRET_SOURCE=encrypted)"
      else
        check_fail "ENCRYPTION_KEY is required when SECRET_SOURCE=encrypted"
      fi
      if is_var_set ENCRYPTED_PRIVATE_KEY && [ -n "$(get_var ENCRYPTED_PRIVATE_KEY)" ]; then
        check_pass "ENCRYPTED_PRIVATE_KEY is set (SECRET_SOURCE=encrypted)"
      else
        check_fail "ENCRYPTED_PRIVATE_KEY is required when SECRET_SOURCE=encrypted"
      fi
      ;;
    aws)
      if is_var_set AWS_SECRET_NAME && [ -n "$(get_var AWS_SECRET_NAME)" ]; then
        check_pass "AWS_SECRET_NAME is set (SECRET_SOURCE=aws)"
      else
        check_fail "AWS_SECRET_NAME is required when SECRET_SOURCE=aws"
      fi
      if is_var_set AWS_REGION && [ -n "$(get_var AWS_REGION)" ]; then
        check_pass "AWS_REGION is set (SECRET_SOURCE=aws)"
      else
        check_warn "AWS_REGION not set, using default: us-east-1"
      fi
      ;;
    vault)
      if is_var_set VAULT_ADDR && [ -n "$(get_var VAULT_ADDR)" ]; then
        check_pass "VAULT_ADDR is set (SECRET_SOURCE=vault)"
      else
        check_fail "VAULT_ADDR is required when SECRET_SOURCE=vault"
      fi
      if is_var_set VAULT_TOKEN && [ -n "$(get_var VAULT_TOKEN)" ]; then
        check_pass "VAULT_TOKEN is set (SECRET_SOURCE=vault)"
      else
        check_fail "VAULT_TOKEN is required when SECRET_SOURCE=vault"
      fi
      if is_var_set VAULT_PATH && [ -n "$(get_var VAULT_PATH)" ]; then
        check_pass "VAULT_PATH is set (SECRET_SOURCE=vault)"
      else
        check_fail "VAULT_PATH is required when SECRET_SOURCE=vault"
      fi
      ;;
    azure)
      if is_var_set AZURE_KEY_VAULT_NAME && [ -n "$(get_var AZURE_KEY_VAULT_NAME)" ]; then
        check_pass "AZURE_KEY_VAULT_NAME is set (SECRET_SOURCE=azure)"
      else
        check_fail "AZURE_KEY_VAULT_NAME is required when SECRET_SOURCE=azure"
      fi
      if is_var_set AZURE_SECRET_NAME && [ -n "$(get_var AZURE_SECRET_NAME)" ]; then
        check_pass "AZURE_SECRET_NAME is set (SECRET_SOURCE=azure)"
      else
        check_fail "AZURE_SECRET_NAME is required when SECRET_SOURCE=azure"
      fi
      if is_var_set AZURE_CLIENT_ID && [ -n "$(get_var AZURE_CLIENT_ID)" ]; then
        check_pass "AZURE_CLIENT_ID is set (SECRET_SOURCE=azure)"
      else
        check_fail "AZURE_CLIENT_ID is required when SECRET_SOURCE=azure"
      fi
      if is_var_set AZURE_CLIENT_SECRET && [ -n "$(get_var AZURE_CLIENT_SECRET)" ]; then
        check_pass "AZURE_CLIENT_SECRET is set (SECRET_SOURCE=azure)"
      else
        check_fail "AZURE_CLIENT_SECRET is required when SECRET_SOURCE=azure"
      fi
      if is_var_set AZURE_TENANT_ID && [ -n "$(get_var AZURE_TENANT_ID)" ]; then
        check_pass "AZURE_TENANT_ID is set (SECRET_SOURCE=azure)"
      else
        check_fail "AZURE_TENANT_ID is required when SECRET_SOURCE=azure"
      fi
      ;;
    *)
      check_fail "Invalid SECRET_SOURCE: $SECRET_SOURCE (must be: env, encrypted, aws, vault, azure)"
      ;;
  esac
else
  check_pass "LIVE_TRADING=false (paper trading mode - safe default)"
  if [ "$COMPLIANCE_ACCEPTED" = "true" ]; then
    check_warn "COMPLIANCE_ACCEPTED=true but LIVE_TRADING=false (no effect)"
  fi
fi

# Validate server configuration
section "Server Configuration"

PORT=$(get_var PORT "3000")
if [[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ]; then
  check_pass "PORT=$PORT (valid port number)"
else
  check_fail "PORT=$PORT (invalid port number)"
fi

METRICS_PORT=$(get_var METRICS_PORT "9090")
if [[ "$METRICS_PORT" =~ ^[0-9]+$ ]] && [ "$METRICS_PORT" -ge 1 ] && [ "$METRICS_PORT" -le 65535 ]; then
  check_pass "METRICS_PORT=$METRICS_PORT (valid port number)"
  if [ "$METRICS_PORT" = "$PORT" ]; then
    check_warn "METRICS_PORT=$PORT (same as PORT - single-port mode)"
  else
    check_pass "METRICS_PORT=$METRICS_PORT (dedicated metrics port)"
  fi
else
  check_fail "METRICS_PORT=$METRICS_PORT (invalid port number)"
fi

CHAIN_ID=$(get_var CHAIN_ID "137")
if [ "$CHAIN_ID" = "137" ]; then
  check_pass "CHAIN_ID=$CHAIN_ID (Polygon Mainnet)"
else
  check_warn "CHAIN_ID=$CHAIN_ID (non-standard chain)"
fi

# Validate risk management configuration
section "Risk Management"

RISK_MAX_EXPOSURE=$(get_var RISK_MAX_EXPOSURE_PER_MARKET "")
if [ -n "$RISK_MAX_EXPOSURE" ]; then
  check_pass "RISK_MAX_EXPOSURE_PER_MARKET=$RISK_MAX_EXPOSURE"
else
  check_skip "RISK_MAX_EXPOSURE_PER_MARKET not set (optional)"
fi

RISK_MAX_OPEN_ORDERS=$(get_var RISK_MAX_OPEN_ORDERS "")
if [ -n "$RISK_MAX_OPEN_ORDERS" ]; then
  check_pass "RISK_MAX_OPEN_ORDERS=$RISK_MAX_OPEN_ORDERS"
else
  check_skip "RISK_MAX_OPEN_ORDERS not set (optional)"
fi

RISK_MAX_DRAWDOWN=$(get_var RISK_MAX_DRAWDOWN "")
if [ -n "$RISK_MAX_DRAWDOWN" ]; then
  check_pass "RISK_MAX_DRAWDOWN=$RISK_MAX_DRAWDOWN"
else
  check_skip "RISK_MAX_DRAWDOWN not set (optional)"
fi

# Validate circuit breaker configuration
section "Circuit Breaker Configuration"

CB_FAILURE_THRESHOLD=$(get_var CIRCUIT_BREAKER_FAILURE_THRESHOLD "")
if [ -n "$CB_FAILURE_THRESHOLD" ]; then
  check_pass "CIRCUIT_BREAKER_FAILURE_THRESHOLD=$CB_FAILURE_THRESHOLD"
else
  check_skip "CIRCUIT_BREAKER_FAILURE_THRESHOLD not set (using default)"
fi

CB_RESET_TIMEOUT=$(get_var CIRCUIT_BREAKER_RESET_TIMEOUT "")
if [ -n "$CB_RESET_TIMEOUT" ]; then
  check_pass "CIRCUIT_BREAKER_RESET_TIMEOUT=$CB_RESET_TIMEOUT"
else
  check_skip "CIRCUIT_BREAKER_RESET_TIMEOUT not set (using default)"
fi

# Validate rate limiting configuration
section "Rate Limiting"

RATE_LIMIT_MAX=$(get_var RATE_LIMIT_MAX_REQUESTS "")
if [ -n "$RATE_LIMIT_MAX" ]; then
  check_pass "RATE_LIMIT_MAX_REQUESTS=$RATE_LIMIT_MAX"
else
  check_skip "RATE_LIMIT_MAX_REQUESTS not set (using default)"
fi

RATE_LIMIT_WINDOW=$(get_var RATE_LIMIT_WINDOW_MS "")
if [ -n "$RATE_LIMIT_WINDOW" ]; then
  check_pass "RATE_LIMIT_WINDOW_MS=$RATE_LIMIT_WINDOW"
else
  check_skip "RATE_LIMIT_WINDOW_MS not set (using default)"
fi

# Validate alerting configuration
section "Alerting Configuration"

TELEGRAM_BOT_TOKEN=$(get_var TELEGRAM_BOT_TOKEN "")
TELEGRAM_CHAT_ID=$(get_var TELEGRAM_CHAT_ID "")

if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
  check_pass "Telegram alerting configured (bot token and chat ID set)"
elif [ -n "$TELEGRAM_BOT_TOKEN" ] || [ -n "$TELEGRAM_CHAT_ID" ]; then
  check_warn "Telegram partially configured (need both bot token and chat ID)"
else
  check_skip "Telegram alerting not configured (optional)"
fi

# Validate backup configuration
section "Backup Configuration"

BACKUP_STORAGE_TYPE=$(get_var BACKUP_STORAGE_TYPE "")
if [ -n "$BACKUP_STORAGE_TYPE" ]; then
  case "$BACKUP_STORAGE_TYPE" in
    local)
      check_pass "BACKUP_STORAGE_TYPE=local (filesystem backup)"
      ;;
    s3)
      check_pass "BACKUP_STORAGE_TYPE=s3"
      if [ -n "$(get_var BACKUP_S3_BUCKET)" ]; then
        check_pass "BACKUP_S3_BUCKET is set"
      else
        check_fail "BACKUP_S3_BUCKET is required when BACKUP_STORAGE_TYPE=s3"
      fi
      if [ -n "$(get_var BACKUP_S3_REGION)" ]; then
        check_pass "BACKUP_S3_REGION is set"
      else
        check_warn "BACKUP_S3_REGION not set (using default)"
      fi
      ;;
    gcs)
      check_pass "BACKUP_STORAGE_TYPE=gcs"
      if [ -n "$(get_var BACKUP_GCS_BUCKET)" ]; then
        check_pass "BACKUP_GCS_BUCKET is set"
      else
        check_fail "BACKUP_GCS_BUCKET is required when BACKUP_STORAGE_TYPE=gcs"
      fi
      ;;
    azure)
      check_pass "BACKUP_STORAGE_TYPE=azure"
      if [ -n "$(get_var BACKUP_AZURE_CONTAINER)" ]; then
        check_pass "BACKUP_AZURE_CONTAINER is set"
      else
        check_fail "BACKUP_AZURE_CONTAINER is required when BACKUP_STORAGE_TYPE=azure"
      fi
      ;;
    *)
      check_fail "Invalid BACKUP_STORAGE_TYPE: $BACKUP_STORAGE_TYPE (must be: local, s3, gcs, azure)"
      ;;
  esac
else
  check_skip "Backup storage not configured (optional)"
fi

# External service connectivity checks
if [ "$SKIP_CONNECTIVITY" = false ]; then
  section "External Service Connectivity"
  
  # Check Gamma API
  if [ -n "${GAMMA_API_URL:-}" ]; then
    echo -n "Checking Gamma API connectivity... "
    if curl -sf --max-time 10 "${GAMMA_API_URL}/markets?limit=1" > /dev/null 2>&1; then
      check_pass "Gamma API ($GAMMA_API_URL) is accessible"
    else
      check_fail "Gamma API ($GAMMA_API_URL) is not accessible"
    fi
  fi
  
  # Check CLOB API
  if [ -n "${CLOB_API_URL:-}" ]; then
    echo -n "Checking CLOB API connectivity... "
    if curl -sf --max-time 10 "${CLOB_API_URL}/markets" > /dev/null 2>&1; then
      check_pass "CLOB API ($CLOB_API_URL) is accessible"
    else
      check_fail "CLOB API ($CLOB_API_URL) is not accessible"
    fi
  fi
  
  # Check WebSocket endpoint (just verify DNS resolves and port is open)
  if [ -n "${WS_MARKET_URL:-}" ]; then
    # Extract hostname from WebSocket URL
    WS_HOST=$(echo "$WS_MARKET_URL" | sed -E 's|wss?://([^/:]+).*|\1|')
    if [ -n "$WS_HOST" ]; then
      echo -n "Checking WebSocket endpoint DNS... "
      if host "$WS_HOST" > /dev/null 2>&1 || nslookup "$WS_HOST" > /dev/null 2>&1 || ping -c 1 -W 2 "$WS_HOST" > /dev/null 2>&1; then
        check_pass "WebSocket endpoint DNS resolves ($WS_HOST)"
      else
        check_fail "WebSocket endpoint DNS does not resolve ($WS_HOST)"
      fi
    fi
  fi
  
  # Check cloud secret manager connectivity (if configured)
  if [ "$LIVE_TRADING" = "true" ]; then
    SECRET_SOURCE=$(get_var SECRET_SOURCE "env")
    
    case "$SECRET_SOURCE" in
      aws)
        if command_exists aws; then
          echo -n "Checking AWS Secrets Manager connectivity... "
          AWS_REGION=$(get_var AWS_REGION "us-east-1")
          if aws secretsmanager list-secrets --region "$AWS_REGION" --max-results 1 > /dev/null 2>&1; then
            check_pass "AWS Secrets Manager is accessible"
          else
            check_warn "Cannot verify AWS Secrets Manager access (credentials may be missing)"
          fi
        else
          check_warn "AWS CLI not installed (cannot verify AWS Secrets Manager)"
        fi
        ;;
      vault)
        if [ -n "$(get_var VAULT_ADDR)" ]; then
          echo -n "Checking HashiCorp Vault connectivity... "
          VAULT_ADDR=$(get_var VAULT_ADDR)
          if curl -sf --max-time 10 "${VAULT_ADDR}/v1/sys/health" > /dev/null 2>&1; then
            check_pass "HashiCorp Vault is accessible"
          else
            check_fail "HashiCorp Vault ($VAULT_ADDR) is not accessible"
          fi
        fi
        ;;
      azure)
        check_skip "Azure Key Vault connectivity check not implemented (requires Azure CLI)"
        ;;
    esac
  fi
  
  # Check Telegram Bot API (if configured)
  if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    echo -n "Checking Telegram Bot API connectivity... "
    if curl -sf --max-time 10 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe" > /dev/null 2>&1; then
      check_pass "Telegram Bot API is accessible"
    else
      check_warn "Telegram Bot API is not accessible (check bot token)"
    fi
  fi
else
  check_skip "External service connectivity checks skipped (--skip-connectivity)"
fi

# Check for common configuration issues
section "Configuration Validation"

# Check for conflicting configuration
if [ "$LIVE_TRADING" = "false" ] && [ -n "$(get_var MIN_BALANCE_USDC)" ]; then
  MIN_BALANCE=$(get_var MIN_BALANCE_USDC "0")
  if [ "$MIN_BALANCE" != "0" ]; then
    check_warn "MIN_BALANCE_USDC is set but LIVE_TRADING=false (no effect in paper mode)"
  fi
fi

# Check for heartbeat URL format (if set)
HEARTBEAT_URL=$(get_var HEARTBEAT_URL "")
if [ -n "$HEARTBEAT_URL" ]; then
  if is_valid_url "$HEARTBEAT_URL"; then
    check_pass "HEARTBEAT_URL is set and valid"
  else
    check_fail "HEARTBEAT_URL is set but invalid: $HEARTBEAT_URL"
  fi
fi

# Check for markets config file (if specified)
MARKETS_CONFIG_PATH=$(get_var MARKETS_CONFIG_PATH "")
if [ -n "$MARKETS_CONFIG_PATH" ]; then
  if [ -f "$MARKETS_CONFIG_PATH" ]; then
    check_pass "MARKETS_CONFIG_PATH points to existing file: $MARKETS_CONFIG_PATH"
    # Validate JSON format if jq is available
    if command_exists jq; then
      if jq empty "$MARKETS_CONFIG_PATH" 2>/dev/null; then
        check_pass "Markets config file is valid JSON"
      else
        check_fail "Markets config file is not valid JSON: $MARKETS_CONFIG_PATH"
      fi
    fi
  else
    check_fail "MARKETS_CONFIG_PATH points to non-existent file: $MARKETS_CONFIG_PATH"
  fi
fi

# Check for strategy config file (if specified)
STRATEGY_CONFIG_PATH=$(get_var STRATEGY_CONFIG_PATH "")
if [ -n "$STRATEGY_CONFIG_PATH" ]; then
  if [ -f "$STRATEGY_CONFIG_PATH" ]; then
    check_pass "STRATEGY_CONFIG_PATH points to existing file: $STRATEGY_CONFIG_PATH"
    # Validate JSON format if jq is available
    if command_exists jq; then
      if jq empty "$STRATEGY_CONFIG_PATH" 2>/dev/null; then
        check_pass "Strategy config file is valid JSON"
      else
        check_fail "Strategy config file is not valid JSON: $STRATEGY_CONFIG_PATH"
      fi
    fi
  else
    check_fail "STRATEGY_CONFIG_PATH points to non-existent file: $STRATEGY_CONFIG_PATH"
  fi
fi

# Security checks
section "Security Checks"

# Check for hardcoded secrets in environment file
if [ -f "$ENV_FILE" ]; then
  # Check for uncommented PRIVATE_KEY with a value that looks like a real key
  if grep -E '^[^#]*PRIVATE_KEY=.*[0-9a-fA-F]{40,}' "$ENV_FILE" > /dev/null 2>&1; then
    check_warn "PRIVATE_KEY appears to be set in $ENV_FILE (ensure file is in .gitignore)"
  fi
  
  # Check if .env is in .gitignore
  if [ -f .gitignore ]; then
    if grep -q "^\.env$" .gitignore || grep -q "^\.env" .gitignore; then
      check_pass ".env is in .gitignore"
    else
      check_fail ".env is not in .gitignore (SECURITY RISK)"
    fi
  else
    check_warn ".gitignore not found (create one and add .env)"
  fi
fi

# Check LOG_LEVEL (should not be 'debug' in production)
LOG_LEVEL=$(get_var LOG_LEVEL "info")
if [ "$LOG_LEVEL" = "debug" ]; then
  check_warn "LOG_LEVEL=debug (verbose logging - may impact performance)"
elif [ "$LOG_LEVEL" = "info" ] || [ "$LOG_LEVEL" = "warn" ] || [ "$LOG_LEVEL" = "error" ]; then
  check_pass "LOG_LEVEL=$LOG_LEVEL (appropriate for production)"
else
  check_warn "LOG_LEVEL=$LOG_LEVEL (non-standard log level)"
fi

# Summary
section "Summary"

TOTAL_CHECKS=$((CHECKS_PASSED + CHECKS_FAILED + CHECKS_WARNED + CHECKS_SKIPPED))

echo ""
echo "Total checks: $TOTAL_CHECKS"
echo -e "${GREEN}Passed: $CHECKS_PASSED${NC}"
echo -e "${RED}Failed: $CHECKS_FAILED${NC}"
echo -e "${YELLOW}Warnings: $CHECKS_WARNED${NC}"
if [ "$VERBOSE" = true ]; then
  echo -e "${YELLOW}Skipped: $CHECKS_SKIPPED${NC}"
fi
echo ""

# Deployment readiness assessment
if [ "$CHECKS_FAILED" -eq 0 ]; then
  if [ "$CHECKS_WARNED" -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✓ Environment verification PASSED${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${GREEN}Environment is ready for deployment!${NC}"
    exit 0
  else
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}⚠ Environment verification PASSED with warnings${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${YELLOW}Environment is ready for deployment, but review warnings above.${NC}"
    exit 0
  fi
else
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}✗ Environment verification FAILED${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "${RED}Environment is NOT ready for deployment.${NC}"
  echo -e "${RED}Please fix the failed checks above before deploying.${NC}"
  echo ""
  echo "For help, see:"
  echo "  - docs/pre-deployment-verification.md"
  echo "  - docs/ENV_VARIABLE_REFERENCE.md"
  echo "  - .env.example"
  exit 1
fi
