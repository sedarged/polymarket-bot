#!/bin/bash
# Docker Setup Verification Script
# Tests Docker deployment infrastructure without building/running containers

set -e

echo "========================================="
echo "Docker Deployment Verification Script"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

# Check Docker installation
echo "1. Checking Docker installation..."
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    success "Docker installed: $DOCKER_VERSION"
else
    error "Docker is not installed"
    exit 1
fi

# Check Docker Compose installation
echo ""
echo "2. Checking Docker Compose installation..."
if docker compose version &> /dev/null; then
    COMPOSE_VERSION=$(docker compose version)
    success "Docker Compose installed: $COMPOSE_VERSION"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_VERSION=$(docker-compose --version)
    warning "Docker Compose V1 found. Consider upgrading to V2."
    success "Docker Compose installed: $COMPOSE_VERSION"
else
    error "Docker Compose is not installed"
    exit 1
fi

# Verify Dockerfile exists
echo ""
echo "3. Checking Dockerfile..."
if [ -f "Dockerfile" ]; then
    success "Dockerfile exists"
    # Count stages
    STAGES=$(grep -c "^FROM" Dockerfile || echo "0")
    success "Multi-stage build detected: $STAGES stages"
else
    error "Dockerfile not found"
    exit 1
fi

# Verify .dockerignore exists
echo ""
echo "4. Checking .dockerignore..."
if [ -f ".dockerignore" ]; then
    success ".dockerignore exists"
    IGNORE_LINES=$(wc -l < .dockerignore)
    success "Ignoring $IGNORE_LINES patterns"
else
    warning ".dockerignore not found (optional but recommended)"
fi

# Verify docker-compose.yml
echo ""
echo "5. Validating docker-compose.yml..."
if [ -f "docker-compose.yml" ]; then
    success "docker-compose.yml exists"
    # Validate syntax
    if docker compose config --quiet; then
        success "docker-compose.yml syntax is valid"
        # Count services
        SERVICES=$(docker compose config --services | wc -l)
        success "Services defined: $SERVICES"
        docker compose config --services | while read service; do
            echo "  - $service"
        done
    else
        error "docker-compose.yml has syntax errors"
        exit 1
    fi
else
    error "docker-compose.yml not found"
    exit 1
fi

# Check for health check in Dockerfile
echo ""
echo "6. Checking health check configuration..."
if grep -q "HEALTHCHECK" Dockerfile; then
    success "Health check defined in Dockerfile"
else
    warning "No health check found in Dockerfile"
fi

# Check for non-root user
echo ""
echo "7. Checking security configuration..."
if grep -q "USER" Dockerfile; then
    USER_LINE=$(grep "USER" Dockerfile | tail -1)
    success "Non-root user configured: $USER_LINE"
else
    warning "No non-root user configured (security risk)"
fi

# Verify environment file
echo ""
echo "8. Checking environment configuration..."
if [ -f ".env.example" ]; then
    success ".env.example exists"
    ENV_VARS=$(grep -c "^[A-Z_]" .env.example || echo "0")
    success "Environment variables documented: $ENV_VARS"
else
    error ".env.example not found"
    exit 1
fi

if [ -f ".env" ]; then
    warning ".env file exists (should not be committed)"
else
    success ".env file not present (good - use .env.example)"
fi

# Check documentation
echo ""
echo "9. Checking documentation..."
if [ -f "docs/docker.md" ]; then
    success "Docker documentation exists: docs/docker.md"
    DOC_LINES=$(wc -l < docs/docker.md)
    success "Documentation size: $DOC_LINES lines"
else
    warning "Docker documentation not found: docs/docker.md"
fi

# Check GitHub Actions workflow
echo ""
echo "10. Checking CI/CD integration..."
if [ -f ".github/workflows/docker-security-scan.yml" ]; then
    success "Docker security scan workflow exists"
else
    warning "Docker security scan workflow not found"
fi

# Summary
echo ""
echo "========================================="
echo "Verification Summary"
echo "========================================="
echo ""
echo "Docker deployment infrastructure is properly configured!"
echo ""
echo "Next steps:"
echo "1. Copy .env.example to .env and configure your environment"
echo "2. Build the image: docker build -t polymarket-bot:latest ."
echo "3. Run with docker-compose: docker compose up -d"
echo "4. Check health: curl http://localhost:3000/health"
echo ""
echo "For detailed instructions, see docs/docker.md"
echo ""
