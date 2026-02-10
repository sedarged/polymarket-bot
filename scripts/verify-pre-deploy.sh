#!/usr/bin/env bash
# Pre-deployment verification script (Research §12.2).
# Run from repo root.
# - BASE_URL: main API (default http://localhost:3000). Health and ready are checked here.
# - METRICS_URL: optional. If set (e.g. http://localhost:9090 when METRICS_PORT=9090), metrics are checked here instead of BASE_URL/metrics. Use when metrics are on a dedicated port.
# If METRICS_URL is unset, metrics are checked at BASE_URL/metrics (single-port deployment).

set -e
BASE_URL="${BASE_URL:-http://localhost:3000}"
METRICS_URL="${METRICS_URL:-}"

echo "Pre-deployment verification (Research §12.2)"
echo "Base URL: $BASE_URL"
if [ -n "$METRICS_URL" ]; then
  echo "Metrics URL: $METRICS_URL (dedicated)"
else
  echo "Metrics: $BASE_URL/metrics (same as base)"
fi
echo ""

# Health
echo -n "Health endpoint ... "
if curl -sf --max-time 5 "$BASE_URL/health" > /dev/null; then
  echo "OK"
else
  echo "FAIL"
  exit 1
fi

# Metrics (dedicated port or same as base)
if [ -n "$METRICS_URL" ]; then
  echo -n "Metrics endpoint (dedicated) ... "
  if curl -sf --max-time 5 "$METRICS_URL/metrics" | grep -q .; then
    echo "OK"
  else
    echo "FAIL"
    exit 1
  fi
else
  echo -n "Metrics endpoint ... "
  if curl -sf --max-time 5 "$BASE_URL/metrics" | grep -q .; then
    echo "OK"
  else
    echo "FAIL"
    exit 1
  fi
fi

# Ready (if server is up)
echo -n "Ready endpoint ... "
if curl -sf --max-time 5 "$BASE_URL/ready" > /dev/null; then
  echo "OK"
else
  echo "FAIL (or not ready yet)"
fi

echo ""
echo "Automated checks passed. Complete the checklist in docs/pre-deployment-verification.md"
echo "(ban-status, balance, allowances, auth, paper trading, alerts, failure recovery)."
