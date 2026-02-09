#!/bin/bash
# Codespaces Verification Helper Script
# This script automates the verification checklist for Codespaces
# See docs/CODESPACES_VERIFICATION_CHECKLIST.md for full checklist

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Output functions
log_section() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Track failures
FAILURES=0

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    log_error "Must run from repository root"
    exit 1
fi

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Polymarket Bot - Codespaces Verification Helper        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"

# Section 1: Environment Setup
log_section "Section 1: Environment Setup Verification"

# Check Node version
NODE_VERSION=$(node --version)
log_success "Node.js version: $NODE_VERSION"

# Check npm version
NPM_VERSION=$(npm --version)
log_success "npm version: $NPM_VERSION"

# Check .env file
if [ -f ".env" ]; then
    log_success ".env file exists"
    
    # Check critical env vars (without printing values)
    if grep -q "LIVE_TRADING" .env; then
        LIVE_TRADING=$(grep "LIVE_TRADING" .env | cut -d'=' -f2)
        if [ "$LIVE_TRADING" = "false" ]; then
            log_success "LIVE_TRADING=false (paper trading mode)"
        else
            log_warning "LIVE_TRADING=$LIVE_TRADING (should be false for Codespaces)"
            FAILURES=$((FAILURES + 1))
        fi
    else
        log_warning "LIVE_TRADING not set in .env"
    fi
else
    log_warning ".env file not found - create from .env.example"
    FAILURES=$((FAILURES + 1))
fi

# Check dependencies
if [ -d "node_modules" ]; then
    NUM_PACKAGES=$(ls node_modules | wc -l)
    log_success "Dependencies installed ($NUM_PACKAGES packages)"
else
    log_error "node_modules not found - run npm install"
    FAILURES=$((FAILURES + 1))
fi

# Section 2: Build & Test
log_section "Section 2: Build & Test Verification"

# Run build
echo "Running build..."
if npm run build > /tmp/build-output.txt 2>&1; then
    log_success "Build completed successfully"
else
    BUILD_EXIT=$?
    log_warning "Build completed with errors (exit code: $BUILD_EXIT)"
    log_warning "Check /tmp/build-output.txt for details"
    log_warning "Compare errors to docs/environment.md for pre-existing issues"
fi

# Run tests
echo "Running tests..."
if npm test > /tmp/test-output.txt 2>&1; then
    log_success "All tests passed"
else
    TEST_EXIT=$?
    log_warning "Tests completed with failures (exit code: $TEST_EXIT)"
    
    # Show summary
    if grep -q "Test Files" /tmp/test-output.txt; then
        echo ""
        grep "Test Files" /tmp/test-output.txt
        grep "Tests" /tmp/test-output.txt | head -3
        echo ""
    fi
    
    log_warning "Compare failures to docs/testing.md for pre-existing issues"
fi

# Section 3: CLI Commands
log_section "Section 3: CLI Commands Verification"

# Test markets command
echo "Testing markets command..."
if timeout 10 npm run markets -- --limit 3 > /tmp/markets-output.txt 2>&1; then
    log_success "Markets command works"
    echo "Sample output:"
    head -15 /tmp/markets-output.txt | sed 's/^/  /'
else
    log_warning "Markets command failed or timed out"
    FAILURES=$((FAILURES + 1))
fi

# Section 7: Security Verification
log_section "Section 7: Security Verification"

# Check for obvious secrets in diff
echo "Checking for obvious secrets..."
if git diff origin/main 2>/dev/null | grep -iE "password.*=|secret.*=|private.*key.*=|token.*=" > /dev/null; then
    log_error "Possible secrets found in diff!"
    FAILURES=$((FAILURES + 1))
else
    log_success "No obvious secrets in diff"
fi

# Run npm audit
echo "Running npm audit..."
if npm audit --audit-level=high > /tmp/audit-output.txt 2>&1; then
    log_success "No high/critical vulnerabilities found"
else
    AUDIT_EXIT=$?
    log_warning "npm audit found issues (exit code: $AUDIT_EXIT)"
    log_warning "Check /tmp/audit-output.txt for details"
fi

# Paper trading mode check
if [ -f ".env" ]; then
    if grep -q "LIVE_TRADING=false" .env && grep -q "COMPLIANCE_ACCEPTED=false" .env; then
        log_success "Paper trading mode confirmed"
    else
        log_warning "Live trading mode may be enabled - verify .env settings"
        FAILURES=$((FAILURES + 1))
    fi
fi

# Summary
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}✓ Basic verification passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review full output above"
    echo "  2. Complete manual sections (Backend API, Frontend, WebSocket)"
    echo "  3. See docs/CODESPACES_VERIFICATION_CHECKLIST.md for complete checklist"
    echo "  4. Add all proof to your PR description"
else
    echo -e "${YELLOW}⚠ Verification completed with $FAILURES warning(s)${NC}"
    echo ""
    echo "Review warnings above and:"
    echo "  1. Fix any critical issues"
    echo "  2. Compare warnings to documented pre-existing issues"
    echo "  3. Complete remaining manual sections"
    echo "  4. See docs/CODESPACES_VERIFICATION_CHECKLIST.md"
fi
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "Detailed logs saved to /tmp/ for review"
echo ""

exit 0
