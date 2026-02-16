#!/usr/bin/env bash
# Infrastructure Verification Script
# Verifies IaC configurations are valid and consistent
# Addresses GAP-040: Infrastructure as Code

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
CHECKS_SKIPPED=0

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Infrastructure as Code Verification${NC}"
echo -e "${BLUE}================================================${NC}"
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

# Check prerequisites
section "Prerequisites"

HAS_TERRAFORM=false
HAS_KUBECTL=false
HAS_ANSIBLE=false
HAS_JQ=false

# Check jq first since other tools may use it
if command -v jq &> /dev/null; then
  check_pass "jq installed"
  HAS_JQ=true
else
  check_warn "jq not installed (recommended for JSON parsing)"
fi

if command -v terraform &> /dev/null; then
  if [ "$HAS_JQ" = true ]; then
    VERSION=$(terraform version -json 2>/dev/null | jq -r '.terraform_version' 2>/dev/null || echo "unknown")
  else
    VERSION=$(terraform version | head -n1 | awk '{print $2}' | tr -d 'v')
  fi
  check_pass "Terraform installed (v$VERSION)"
  HAS_TERRAFORM=true
else
  check_skip "Terraform not installed"
fi

if command -v kubectl &> /dev/null; then
  if [ "$HAS_JQ" = true ]; then
    VERSION=$(kubectl version --client -o json 2>/dev/null | jq -r '.clientVersion.gitVersion' 2>/dev/null || echo "unknown")
  else
    VERSION=$(kubectl version --client --short 2>/dev/null | awk '{print $3}' || echo "unknown")
  fi
  check_pass "kubectl installed ($VERSION)"
  HAS_KUBECTL=true
else
  check_skip "kubectl not installed"
fi

if command -v ansible &> /dev/null; then
  VERSION=$(ansible --version | head -n1 | awk '{print $2}')
  check_pass "Ansible installed (v$VERSION)"
  HAS_ANSIBLE=true
else
  check_skip "Ansible not installed"
fi

# Check infrastructure directory structure
section "Directory Structure"

if [ -d "infrastructure" ]; then
  check_pass "infrastructure/ directory exists"
else
  check_fail "infrastructure/ directory missing"
  exit 1
fi

if [ -d "infrastructure/terraform/aws-ec2" ]; then
  check_pass "Terraform AWS EC2 configuration exists"
else
  check_skip "Terraform AWS EC2 configuration not found"
fi

if [ -d "infrastructure/kubernetes" ]; then
  check_pass "Kubernetes manifests exist"
else
  check_skip "Kubernetes manifests not found"
fi

if [ -d "infrastructure/ansible" ]; then
  check_pass "Ansible playbooks exist"
else
  check_skip "Ansible playbooks not found"
fi

# Verify Terraform configuration
if [ "$HAS_TERRAFORM" = true ] && [ -d "infrastructure/terraform/aws-ec2" ]; then
  section "Terraform Validation"
  
  cd infrastructure/terraform/aws-ec2
  
  # Format check
  if terraform fmt -check -recursive . &> /dev/null; then
    check_pass "Terraform formatting is correct"
  else
    check_warn "Terraform files need formatting (run: terraform fmt)"
  fi
  
  # Validate
  if terraform init -backend=false &> /dev/null; then
    if terraform validate &> /dev/null; then
      check_pass "Terraform configuration is valid"
    else
      check_fail "Terraform validation failed"
      terraform validate
    fi
  else
    check_warn "Cannot validate Terraform (run terraform init first)"
  fi
  
  # Check for required files
  if [ -f "main.tf" ]; then
    check_pass "main.tf exists"
  else
    check_fail "main.tf missing"
  fi
  
  if [ -f "variables.tf" ]; then
    check_pass "variables.tf exists"
  else
    check_fail "variables.tf missing"
  fi
  
  if [ -f "outputs.tf" ]; then
    check_pass "outputs.tf exists"
  else
    check_fail "outputs.tf missing"
  fi
  
  if [ -f "terraform.tfvars.example" ]; then
    check_pass "terraform.tfvars.example exists"
  else
    check_warn "terraform.tfvars.example missing (recommended)"
  fi
  
  # Check for secrets in .tf files
  # Pattern matches: Ethereum keys (0x + 64 hex), raw hex keys (64 hex), base64 (40+ chars), AWS-style secrets
  # Excludes: example files, markdown docs, and lines with "example" or "TODO"
  if grep -rE "(PRIVATE_KEY|SECRET|PASSWORD|API_KEY)[[:space:]]*[:=][[:space:]]*['\"]?(0x[0-9a-fA-F]{64}|[0-9a-fA-F]{64}|[A-Za-z0-9/+]{40,}={0,2}|[A-Za-z0-9/_+=.@-]{40,})['\"]?" \
      --include="*.tf" \
      --exclude="*.tf.example" \
      --exclude="*.md" \
      . 2>/dev/null | grep -viE "example|todo|sample"; then
    check_fail "SECURITY: Private key or secret found in .tf files!"
  else
    check_pass "No hardcoded private keys or secrets in .tf files"
  fi
  
  cd - > /dev/null
fi

# Verify Kubernetes manifests
if [ "$HAS_KUBECTL" = true ] && [ -d "infrastructure/kubernetes" ]; then
  section "Kubernetes Validation"
  
  cd infrastructure/kubernetes
  
  # Validate each manifest
  for file in *.yaml; do
    if kubectl apply -f "$file" --dry-run=client &> /dev/null; then
      check_pass "$file is valid"
    else
      check_fail "$file validation failed"
      kubectl apply -f "$file" --dry-run=client
    fi
  done
  
  # Check for required files
  REQUIRED_FILES=("namespace.yaml" "deployment.yaml" "service.yaml" "configmap.yaml")
  for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
      check_pass "$file exists"
    else
      check_fail "$file missing"
    fi
  done
  
  # Check for secrets in manifests
  if [ -f "secret.yaml" ]; then
    check_fail "SECURITY: secret.yaml should not exist (use secret.yaml.example)"
  else
    check_pass "No secret.yaml file (correct)"
  fi
  
  if [ -f "secret.yaml.example" ]; then
    check_pass "secret.yaml.example exists"
  else
    check_warn "secret.yaml.example missing (recommended)"
  fi
  
  cd - > /dev/null
fi

# Verify Ansible configuration
if [ "$HAS_ANSIBLE" = true ] && [ -d "infrastructure/ansible" ]; then
  section "Ansible Validation"
  
  cd infrastructure/ansible
  
  # Syntax check
  if ansible-playbook playbook.yml --syntax-check &> /dev/null; then
    check_pass "Playbook syntax is valid"
  else
    check_fail "Playbook syntax check failed"
    ansible-playbook playbook.yml --syntax-check
  fi
  
  # Check for required files
  if [ -f "playbook.yml" ]; then
    check_pass "playbook.yml exists"
  else
    check_fail "playbook.yml missing"
  fi
  
  if [ -f "ansible.cfg" ]; then
    check_pass "ansible.cfg exists"
  else
    check_warn "ansible.cfg missing (using defaults)"
  fi
  
  if [ -f "inventory.example" ]; then
    check_pass "inventory.example exists"
  else
    check_warn "inventory.example missing (recommended)"
  fi
  
  # Check for secrets
  if [ -f "inventory" ]; then
    check_warn "inventory file exists (should be in .gitignore)"
  else
    check_pass "No inventory file (use inventory.example)"
  fi
  
  if [ -f "group_vars/all/vault.yml" ]; then
    # Check if encrypted
    if head -n1 "group_vars/all/vault.yml" | grep -q "ANSIBLE_VAULT"; then
      check_pass "vault.yml is encrypted"
    else
      check_fail "SECURITY: vault.yml is not encrypted!"
    fi
  else
    check_skip "No vault.yml (use vault.yml.example)"
  fi
  
  if [ -f "group_vars/all/vault.yml.example" ]; then
    check_pass "vault.yml.example exists"
  else
    check_warn "vault.yml.example missing (recommended)"
  fi
  
  cd - > /dev/null
fi

# Check documentation
section "Documentation"

if [ -f "infrastructure/README.md" ]; then
  check_pass "infrastructure/README.md exists"
else
  check_fail "infrastructure/README.md missing"
fi

if [ -f "docs/infrastructure.md" ]; then
  check_pass "docs/infrastructure.md exists"
else
  check_warn "docs/infrastructure.md missing (recommended)"
fi

# Check gitignore
section "Security - .gitignore"

if [ -f "infrastructure/.gitignore" ]; then
  check_pass "infrastructure/.gitignore exists"
  
  # Check for important patterns
  GITIGNORE_PATTERNS=(
    "terraform.tfvars"
    "*.pem"
    "*.key"
    ".env"
    "inventory"
    "vault.yml"
  )
  
  for pattern in "${GITIGNORE_PATTERNS[@]}"; do
    if grep -q "$pattern" infrastructure/.gitignore; then
      check_pass ".gitignore includes $pattern"
    else
      check_warn ".gitignore missing pattern: $pattern"
    fi
  done
else
  check_fail "infrastructure/.gitignore missing"
fi

# Check for accidentally committed secrets
section "Security - Secret Scan"

# Use exact path matching to avoid false positives
# Each pattern is a literal file path or glob pattern
check_secret_file() {
  local pattern="$1"
  local description="$2"
  
  # For glob patterns, use find; for exact paths, use git ls-files
  if [[ "$pattern" == *"*"* ]]; then
    # Glob pattern - use find
    if find infrastructure -type f -path "$pattern" 2>/dev/null | grep -q .; then
      check_fail "SECURITY: Found committed file matching: $description"
      return 1
    fi
  else
    # Exact path - check if it exists in git
    if git ls-files --error-unmatch "$pattern" &>/dev/null; then
      check_fail "SECURITY: Found committed file: $description"
      return 1
    fi
  fi
  
  check_pass "No committed secrets: $description"
  return 0
}

# Check for sensitive files (exact paths only, not examples)
check_secret_file "infrastructure/terraform/aws-ec2/terraform.tfvars" "terraform.tfvars"
check_secret_file "infrastructure/kubernetes/secret.yaml" "kubernetes secret.yaml"
check_secret_file "infrastructure/ansible/inventory" "ansible inventory"
check_secret_file "infrastructure/ansible/group_vars/all/vault.yml" "ansible vault.yml (unencrypted)"

# Check for any .env files (not .env.example)
if git ls-files 'infrastructure/**/.env' | grep -v '\.env\.example' | grep -q .; then
  check_fail "SECURITY: Found committed .env file"
else
  check_pass "No committed .env files"
fi

# Check for private keys
if git ls-files 'infrastructure/**/*.pem' 'infrastructure/**/*.key' | grep -q .; then
  check_fail "SECURITY: Found committed private key files"
else
  check_pass "No committed private keys"
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
  echo -e "${GREEN}✓ Infrastructure verification PASSED${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 0
else
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}✗ Infrastructure verification FAILED${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "Please fix the failed checks above."
  echo "For help, see: infrastructure/README.md"
  exit 1
fi
