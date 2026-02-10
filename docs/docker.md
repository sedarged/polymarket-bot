# Docker Deployment Guide

This guide covers deploying the Polymarket Trading Bot using Docker for both development and production environments.

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Production Deployment](#production-deployment)
- [Configuration](#configuration)
- [Health Checks](#health-checks)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [CI/CD Integration](#cicd-integration)

## Quick Start

### Development (Docker Compose)

```bash
# 1. Clone the repository
git clone https://github.com/sedarged/polymarket-bot.git
cd polymarket-bot

# 2. Create environment file
cp .env.example .env
# Edit .env with your configuration

# 3. Build and run all services
docker-compose up --build

# 4. Access the services
# Backend API: http://localhost:3000
# Frontend Dashboard: http://localhost:8080
# Health Check: http://localhost:3000/health
```

### Production (Single Container)

```bash
# 1. Build the production image
docker build -t polymarket-bot:latest .

# 2. Run the container
docker run -d \
  --name polymarket-bot \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  polymarket-bot:latest
```

## Prerequisites

- **Docker:** Version 20.10 or higher
- **Docker Compose:** Version 2.0 or higher (for development)
- **Node.js:** 20+ (only for local development without Docker)
- **Environment Variables:** Properly configured `.env` file

**Verify Docker installation:**

```bash
docker --version
docker-compose --version
```

## Development Setup

### Using Docker Compose

Docker Compose provides a complete development environment with all services:

```bash
# Start all services in foreground (with logs)
docker-compose up

# Start all services in background
docker-compose up -d

# View logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f backend

# Stop all services
docker-compose down

# Stop and remove volumes (clears data)
docker-compose down -v

# Rebuild after code changes
docker-compose up --build
```

### Development with Live Reload

For active development with live code changes:

1. **Edit `docker-compose.yml`** - Uncomment the volume mounts:

```yaml
volumes:
  - ./data:/app/data
  - ./apps/backend/src:/app/apps/backend/src  # Uncomment this
  - ./packages/shared/src:/app/packages/shared/src  # Uncomment this
```

2. **Use tsx for development mode:**

The container runs `npm run dev` by default, which uses `tsx` for live TypeScript execution.

3. **Rebuild TypeScript changes:**

```bash
# Inside container
docker-compose exec backend npm run build
```

### Running Specific Commands

```bash
# Fetch markets
docker-compose exec backend npm run markets

# Display order book
docker-compose exec backend npm run book

# Run tests
docker-compose exec backend npm test
# Or run by category: npm run test:unit, test:integration, test:backtest

# Access container shell
docker-compose exec backend sh
```

## Production Deployment

### Building the Production Image

The Dockerfile uses multi-stage builds for optimal image size and security:

```bash
# Build with default tag
docker build -t polymarket-bot:latest .

# Build with version tag
docker build -t polymarket-bot:v1.0.0 .

# Build for specific platform (Apple Silicon, etc.)
docker build --platform linux/amd64 -t polymarket-bot:latest .
```

**Image optimization features:**
- Multi-stage build reduces final image size
- Alpine Linux base (~50MB smaller than debian)
- Production dependencies only
- Non-root user for security
- Minimal attack surface

### Running in Production

#### Basic Production Run

```bash
docker run -d \
  --name polymarket-bot \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  polymarket-bot:latest
```

#### Production with Resource Limits

```bash
docker run -d \
  --name polymarket-bot \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  --memory="512m" \
  --memory-swap="1g" \
  --cpus="1.0" \
  --log-driver json-file \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  polymarket-bot:latest
```

#### Production with Docker Compose

For production with multiple services:

```bash
# Use production override
docker-compose -f docker-compose.yml up -d

# Or create docker-compose.prod.yml with production settings
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Container Management

```bash
# View running containers
docker ps

# View logs
docker logs polymarket-bot
docker logs -f polymarket-bot  # Follow logs
docker logs --tail 100 polymarket-bot  # Last 100 lines

# Stop container
docker stop polymarket-bot

# Start container
docker start polymarket-bot

# Restart container
docker restart polymarket-bot

# Remove container
docker rm polymarket-bot

# Remove container and volumes
docker rm -v polymarket-bot
```

## Configuration

### Environment Variables

All configuration is done via environment variables. See `.env.example` for complete list.

**Critical variables for Docker:**

```bash
# Trading Gates (BOTH required for live trading)
LIVE_TRADING=false  # Default to paper mode
COMPLIANCE_ACCEPTED=false

# Secret Management (NEVER commit actual values)
SECRET_SOURCE=env
PRIVATE_KEY=your_private_key_here

# Server Configuration
PORT=3000
LOG_LEVEL=info

# API Endpoints (defaults are fine)
GAMMA_API_URL=https://gamma-api.polymarket.com
CLOB_API_URL=https://clob.polymarket.com
WS_MARKET_URL=wss://ws-subscriptions-clob.polymarket.com/ws/market
```

### Secrets Management

**NEVER hardcode secrets in Dockerfile or docker-compose.yml**

#### Option 1: Environment File (Development)

```bash
# Create .env file
cp .env.example .env

# Edit with secrets
nano .env

# Run with env file
docker run --env-file .env polymarket-bot:latest
```

#### Option 2: Docker Secrets (Production)

```bash
# Create secret
echo "my_private_key" | docker secret create polymarket_private_key -

# Use in docker-compose.yml
services:
  backend:
    secrets:
      - polymarket_private_key
    environment:
      - PRIVATE_KEY_FILE=/run/secrets/polymarket_private_key

secrets:
  polymarket_private_key:
    external: true
```

#### Option 3: External Secret Manager (Production)

Use AWS Secrets Manager, HashiCorp Vault, or Azure Key Vault:

```bash
# Set secret source
SECRET_SOURCE=aws
AWS_SECRET_NAME=polymarket-bot/private-key
AWS_REGION=us-east-1
```

See [docs/security.md](./security.md) for complete secrets management guide.

### Volume Mounts

Persistent data storage:

```bash
# Data directory (required for learning system)
-v /path/to/data:/app/data

# Custom configuration (optional)
-v /path/to/custom.env:/app/.env:ro
```

## Health Checks

### Built-in Health Check

The Docker image includes a health check that polls the `/health` endpoint:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1
```

### Manual Health Check

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' polymarket-bot

# Check health endpoint directly
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","timestamp":"2026-02-09T10:00:00.000Z"}
```

### Health Check Endpoints

| Endpoint | Description | Expected Status |
|----------|-------------|-----------------|
| `/health` | Basic health check | 200 OK |
| `/api/status` | Trading status | 200 OK (requires auth) |
| `/api/config` | Configuration info | 200 OK (requires auth) |

## Security Considerations

### Non-Root User

The Docker image runs as a non-root user (`polymarket:1001`):

```dockerfile
RUN addgroup -g 1001 -S polymarket && \
    adduser -u 1001 -S polymarket -G polymarket
USER polymarket
```

**Benefits:**
- Reduced attack surface
- Container escape mitigation
- Compliance with security best practices

### Minimal Base Image

Uses Alpine Linux for smallest possible image:

```dockerfile
FROM node:20-alpine AS production
```

**Benefits:**
- Smaller attack surface (fewer packages)
- Faster downloads and deployments
- Reduced storage costs

### Security Scanning

Scan images for vulnerabilities:

```bash
# Using Docker Scout (built-in)
docker scout cves polymarket-bot:latest

# Using Trivy
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image polymarket-bot:latest

# Using Snyk
snyk container test polymarket-bot:latest
```

### Security Best Practices

1. **Never commit secrets** - Use environment variables or secret managers
2. **Use specific image tags** - Avoid `latest` in production
3. **Regular updates** - Keep base images and dependencies updated
4. **Scan regularly** - Run security scans in CI/CD
5. **Limit resources** - Use `--memory` and `--cpus` flags
6. **Read-only filesystem** - Use `--read-only` where possible
7. **Drop capabilities** - Use `--cap-drop=ALL` and add only needed ones

## Troubleshooting

### Container Won't Start

```bash
# Check container logs
docker logs polymarket-bot

# Common issues:
# 1. Missing environment variables
# 2. Port already in use
# 3. Invalid configuration
# 4. Permission issues with volumes

# Verify environment
docker run --rm --env-file .env polymarket-bot:latest env | grep -E "LIVE|TRADING|PRIVATE"

# Check port availability
lsof -i :3000
netstat -tuln | grep 3000
```

### Permission Denied Errors

```bash
# Fix volume permissions
sudo chown -R 1001:1001 ./data

# Or run with user flag (not recommended)
docker run --user 0 ...  # Run as root (insecure!)
```

### Health Check Failing

```bash
# Check container health
docker inspect polymarket-bot | grep -A 10 Health

# Test health endpoint manually
docker exec polymarket-bot wget -O- http://localhost:3000/health

# Check backend logs
docker logs polymarket-bot | grep -i error
```

### Out of Memory Errors

```bash
# Increase memory limit
docker run --memory="1g" --memory-swap="2g" ...

# Monitor memory usage
docker stats polymarket-bot

# Check logs for OOM killer
dmesg | grep -i oom
```

### Network Issues

```bash
# Check network connectivity
docker network ls
docker network inspect polymarket-network

# Test API connectivity from container
docker exec polymarket-bot wget -O- https://gamma-api.polymarket.com

# Check DNS resolution
docker exec polymarket-bot nslookup gamma-api.polymarket.com
```

### Build Failures

```bash
# Clean build (no cache)
docker build --no-cache -t polymarket-bot:latest .

# Check disk space
df -h

# Prune unused images and containers
docker system prune -a
```

### Debugging Inside Container

```bash
# Access container shell
docker exec -it polymarket-bot sh

# Check running processes
docker exec polymarket-bot ps aux

# Check environment variables
docker exec polymarket-bot env

# Check file permissions
docker exec polymarket-bot ls -la /app

# Run diagnostics
docker exec polymarket-bot npm run markets
```

## CI/CD Integration

### GitHub Actions

Example workflow for building and pushing Docker images:

```yaml
name: Docker Build and Push

on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:
    branches: [main]

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to Docker Hub
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          tags: |
            username/polymarket-bot:latest
            username/polymarket-bot:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      
      - name: Security Scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: username/polymarket-bot:${{ github.sha }}
          format: 'sarif'
          output: 'trivy-results.sarif'
      
      - name: Upload scan results
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: 'trivy-results.sarif'
```

### Container Registry

Push to various registries:

```bash
# Docker Hub
docker tag polymarket-bot:latest username/polymarket-bot:latest
docker push username/polymarket-bot:latest

# GitHub Container Registry
docker tag polymarket-bot:latest ghcr.io/username/polymarket-bot:latest
docker push ghcr.io/username/polymarket-bot:latest

# AWS ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
docker tag polymarket-bot:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/polymarket-bot:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/polymarket-bot:latest
```

### Kubernetes Deployment

Example Kubernetes manifest:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: polymarket-bot
spec:
  replicas: 1
  selector:
    matchLabels:
      app: polymarket-bot
  template:
    metadata:
      labels:
        app: polymarket-bot
    spec:
      containers:
      - name: polymarket-bot
        image: polymarket-bot:latest
        ports:
        - containerPort: 3000
        env:
        - name: LIVE_TRADING
          value: "false"
        - name: COMPLIANCE_ACCEPTED
          value: "false"
        envFrom:
        - secretRef:
            name: polymarket-secrets
        volumeMounts:
        - name: data
          mountPath: /app/data
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 40
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 20
          periodSeconds: 10
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: polymarket-data
```

## Related Documentation

- [Runbook](./runbook.md) - Production operations guide
- [Architecture](./architecture.md) - System architecture overview
- [Security](./security.md) - Security best practices and secrets management
- [Environment Variables](./environment.md) - Complete environment variable reference

## Support

For issues or questions:
- Open an issue: https://github.com/sedarged/polymarket-bot/issues
- Check troubleshooting: [docs/troubleshooting.md](./troubleshooting.md)
- Review logs: `docker logs polymarket-bot`
