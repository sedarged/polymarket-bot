#!/bin/bash
# Setup Staging Environment
# Creates necessary directories and configuration for staging deployment
# Addresses: GAP-042 - Staging Environment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Configuration
STAGING_DATA_DIR="${PROJECT_ROOT}/data/staging"
STAGING_BACKUP_DIR="${STAGING_DATA_DIR}/backups"
STAGING_ENV_FILE="${PROJECT_ROOT}/.env.staging"
STAGING_ENV_EXAMPLE="${PROJECT_ROOT}/.env.staging.example"

# Functions
print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    local missing_deps=0
    
    # Check Docker
    if command -v docker &> /dev/null; then
        print_success "Docker is installed ($(docker --version))"
    else
        print_error "Docker is not installed"
        missing_deps=1
    fi
    
    # Check Docker Compose
    if docker compose version &> /dev/null; then
        print_success "Docker Compose is installed ($(docker compose version))"
    else
        print_error "Docker Compose is not installed"
        missing_deps=1
    fi
    
    # Check if Docker daemon is running
    if docker info &> /dev/null; then
        print_success "Docker daemon is running"
    else
        print_error "Docker daemon is not running"
        missing_deps=1
    fi
    
    if [ $missing_deps -eq 1 ]; then
        print_error "Missing prerequisites. Please install required dependencies."
        exit 1
    fi
    
    echo ""
}

# Create directory structure
create_directories() {
    print_header "Creating Directory Structure"
    
    # Create staging data directories
    mkdir -p "${STAGING_DATA_DIR}"
    print_success "Created: ${STAGING_DATA_DIR}"
    
    mkdir -p "${STAGING_BACKUP_DIR}"
    print_success "Created: ${STAGING_BACKUP_DIR}"
    
    # Create subdirectories for databases
    mkdir -p "${STAGING_DATA_DIR}/events"
    mkdir -p "${STAGING_DATA_DIR}/signals"
    mkdir -p "${STAGING_DATA_DIR}/backtests"
    mkdir -p "${STAGING_DATA_DIR}/promotions"
    print_success "Created database subdirectories"
    
    echo ""
}

# Setup environment file
setup_env_file() {
    print_header "Setting Up Environment File"
    
    if [ -f "${STAGING_ENV_FILE}" ]; then
        print_warning "Staging environment file already exists"
        read -p "Overwrite existing .env.staging? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Keeping existing .env.staging"
            echo ""
            return
        fi
    fi
    
    if [ ! -f "${STAGING_ENV_EXAMPLE}" ]; then
        print_error "Template file not found: ${STAGING_ENV_EXAMPLE}"
        exit 1
    fi
    
    # Copy template
    cp "${STAGING_ENV_EXAMPLE}" "${STAGING_ENV_FILE}"
    print_success "Created .env.staging from template"
    
    # Generate random admin token
    if command -v openssl &> /dev/null; then
        ADMIN_TOKEN=$(openssl rand -hex 32)
        # Use proper escaping for sed
        sed -i.bak "s/ADMIN_TOKEN=staging-admin-token-change-me/ADMIN_TOKEN=${ADMIN_TOKEN}/" "${STAGING_ENV_FILE}" 2>/dev/null || \
        sed -i '' "s/ADMIN_TOKEN=staging-admin-token-change-me/ADMIN_TOKEN=${ADMIN_TOKEN}/" "${STAGING_ENV_FILE}"
        rm -f "${STAGING_ENV_FILE}.bak"
        print_success "Generated random admin token"
    else
        print_warning "openssl not found, using default admin token (change manually)"
    fi
    
    print_info "Edit .env.staging to configure your staging environment"
    echo ""
}

# Create .gitignore entries
update_gitignore() {
    print_header "Updating .gitignore"
    
    local gitignore="${PROJECT_ROOT}/.gitignore"
    
    # Check if entries already exist
    if grep -q ".env.staging" "${gitignore}" 2>/dev/null; then
        print_info ".env.staging already in .gitignore"
    else
        echo "" >> "${gitignore}"
        echo "# Staging environment" >> "${gitignore}"
        echo ".env.staging" >> "${gitignore}"
        echo "data/staging/*.db" >> "${gitignore}"
        echo "data/staging/backups/*" >> "${gitignore}"
        print_success "Added staging entries to .gitignore"
    fi
    
    echo ""
}

# Pull Docker images
pull_images() {
    print_header "Pulling Docker Images"
    
    print_info "This may take a few minutes..."
    
    if docker compose -f "${PROJECT_ROOT}/docker-compose.staging.yml" pull; then
        print_success "Docker images pulled successfully"
    else
        print_warning "Failed to pull some images (may need to build locally)"
    fi
    
    echo ""
}

# Verify setup
verify_setup() {
    print_header "Verifying Setup"
    
    # Check directories
    if [ -d "${STAGING_DATA_DIR}" ]; then
        print_success "Staging data directory exists"
    else
        print_error "Staging data directory not found"
    fi
    
    # Check env file
    if [ -f "${STAGING_ENV_FILE}" ]; then
        print_success "Staging environment file exists"
    else
        print_error "Staging environment file not found"
    fi
    
    # Check docker-compose file
    if [ -f "${PROJECT_ROOT}/docker-compose.staging.yml" ]; then
        print_success "Docker Compose staging file exists"
    else
        print_error "Docker Compose staging file not found"
    fi
    
    echo ""
}

# Print next steps
print_next_steps() {
    print_header "Setup Complete!"
    
    echo -e "${GREEN}Staging environment is ready!${NC}\n"
    
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "  1. Edit ${YELLOW}.env.staging${NC} to configure your environment"
    echo -e "  2. Add your staging wallet private key (if needed)"
    echo -e "  3. Start the staging environment:"
    echo -e "     ${YELLOW}docker compose -f docker-compose.staging.yml up -d${NC}"
    echo -e "  4. Verify the deployment:"
    echo -e "     ${YELLOW}./scripts/verify-deployment.sh staging http://localhost:3001${NC}"
    echo -e "  5. View logs:"
    echo -e "     ${YELLOW}docker compose -f docker-compose.staging.yml logs -f${NC}"
    echo ""
    
    echo -e "${BLUE}Staging URLs:${NC}"
    echo -e "  Backend API:    ${YELLOW}http://localhost:3001${NC}"
    echo -e "  Frontend:       ${YELLOW}http://localhost:8081${NC}"
    echo -e "  Metrics:        ${YELLOW}http://localhost:9091/metrics${NC}"
    echo -e "  Prometheus:     ${YELLOW}http://localhost:9092${NC}"
    echo -e "  Grafana:        ${YELLOW}http://localhost:3002${NC} (admin/staging-admin)"
    echo ""
    
    echo -e "${BLUE}Useful commands:${NC}"
    echo -e "  Stop staging:   ${YELLOW}docker compose -f docker-compose.staging.yml down${NC}"
    echo -e "  Restart:        ${YELLOW}docker compose -f docker-compose.staging.yml restart${NC}"
    echo -e "  View status:    ${YELLOW}docker compose -f docker-compose.staging.yml ps${NC}"
    echo -e "  Clean up:       ${YELLOW}docker compose -f docker-compose.staging.yml down -v${NC}"
    echo ""
}

# Main execution
main() {
    echo ""
    print_header "Polymarket Bot - Staging Environment Setup"
    echo ""
    
    # Change to project root
    cd "${PROJECT_ROOT}"
    
    # Run setup steps
    check_prerequisites
    create_directories
    setup_env_file
    update_gitignore
    
    # Ask if user wants to pull images
    read -p "Pull Docker images now? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        pull_images
    else
        print_info "Skipping Docker image pull (you can run it later)"
        echo ""
    fi
    
    verify_setup
    print_next_steps
}

# Run main function
main "$@"
