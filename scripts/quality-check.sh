#!/bin/bash
# Pre-commit Quality Check Script
# Runs essential quality checks before committing code

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

log_error() {
    echo -e "${RED}✗${NC} $1"
}

FAILURES=0

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Code Quality Check                                      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"

# TypeScript type checking
log_section "TypeScript Type Check"
echo "Running tsc..."
if npm run build > /tmp/tsc-output.txt 2>&1; then
    log_success "Type check passed"
else
    log_error "Type check failed"
    echo "Errors:"
    tail -20 /tmp/tsc-output.txt | sed 's/^/  /'
    FAILURES=$((FAILURES + 1))
fi

# Linting
log_section "ESLint Check"
if [ -f "eslint.config.js" ]; then
    echo "Running eslint..."
    if npm run lint > /tmp/lint-output.txt 2>&1; then
        log_success "Linting passed"
    else
        log_error "Linting failed"
        echo "Issues:"
        tail -20 /tmp/lint-output.txt | sed 's/^/  /'
        FAILURES=$((FAILURES + 1))
    fi
else
    echo "No eslint config found, skipping..."
fi

# Unit tests
log_section "Unit Tests"
echo "Running tests..."
if npm test > /tmp/test-output.txt 2>&1; then
    log_success "All tests passed"
    
    # Show test summary
    if grep -q "Test Files" /tmp/test-output.txt; then
        grep "Test Files" /tmp/test-output.txt | sed 's/^/  /'
        grep "Tests" /tmp/test-output.txt | head -1 | sed 's/^/  /'
    fi
else
    log_error "Tests failed"
    
    # Show summary
    if grep -q "Test Files" /tmp/test-output.txt; then
        grep "Test Files" /tmp/test-output.txt | sed 's/^/  /'
        grep "Tests" /tmp/test-output.txt | head -3 | sed 's/^/  /'
    fi
    
    echo ""
    echo "Failed tests:"
    grep "FAIL" /tmp/test-output.txt | head -10 | sed 's/^/  /'
    FAILURES=$((FAILURES + 1))
fi

# Secret detection
log_section "Secret Detection"
echo "Checking for hardcoded secrets..."

# Check staged files for secrets
SECRETS_FOUND=0

# Common secret patterns
if git diff --cached | grep -iE "(password|secret|api[_-]?key|private[_-]?key|token).*=.*['\"]" > /dev/null 2>&1; then
    log_error "Possible hardcoded secrets detected in staged changes"
    echo ""
    echo "Suspicious lines:"
    git diff --cached | grep -iE "(password|secret|api[_-]?key|private[_-]?key|token).*=.*['\"]" | sed 's/^/  /'
    SECRETS_FOUND=1
    FAILURES=$((FAILURES + 1))
fi

# Check for .env file being staged
if git diff --cached --name-only | grep -q "^\.env$"; then
    log_error ".env file is staged - this should not be committed!"
    FAILURES=$((FAILURES + 1))
fi

if [ $SECRETS_FOUND -eq 0 ]; then
    log_success "No obvious secrets detected"
fi

# Security audit
log_section "Dependency Security Audit"
echo "Running npm audit..."
if npm audit --audit-level=high > /tmp/audit-output.txt 2>&1; then
    log_success "No high/critical vulnerabilities"
else
    AUDIT_EXIT=$?
    log_error "Security vulnerabilities found (exit code: $AUDIT_EXIT)"
    echo ""
    echo "Summary:"
    grep -E "^found|^# npm audit report" /tmp/audit-output.txt | sed 's/^/  /'
    echo ""
    echo "Run 'npm audit' for full details"
    FAILURES=$((FAILURES + 1))
fi

# Summary
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}✓ All quality checks passed!${NC}"
    echo ""
    echo "Ready to commit. Remember to:"
    echo "  - Use conventional commit format (feat:, fix:, docs:, etc.)"
    echo "  - Keep commits small and focused"
    echo "  - Run 'scripts/verify-codespaces.sh' before creating PR"
    exit 0
else
    echo -e "${RED}✗ Quality checks failed ($FAILURES issue(s))${NC}"
    echo ""
    echo "Fix the issues above before committing:"
    echo "  - Review detailed output in /tmp/*-output.txt"
    echo "  - Fix code/test issues"
    echo "  - Remove any hardcoded secrets"
    echo "  - Update dependencies if needed"
    exit 1
fi
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
