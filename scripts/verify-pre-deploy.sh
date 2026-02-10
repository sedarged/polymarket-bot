#!/usr/bin/env bash
# Pre-deployment verification script (Research §12.2).
# Run from repo root. Set BASE_URL (default http://localhost:3000) to target deployment.

set -e
BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "Pre-deployment verification (Research §12.2)"
echo "Base URL: $BASE_URL"
echo ""

# Health
echo -n "Health endpoint ... "
if curl -sf --max-time 5 "$BASE_URL/health" > /dev/null; then
  echo "OK"
else
  echo "FAIL"
  exit 1
fi

# Metrics
echo -n "Metrics endpoint ... "
if curl -sf --max-time 5 "$BASE_URL/metrics" | grep -q .; then
  echo "OK"
else
  echo "FAIL"
  exit 1
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
