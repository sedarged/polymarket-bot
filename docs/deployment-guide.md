# Deployment Guide

**Purpose:** Comprehensive guide for deploying the Polymarket Trading Bot to staging and production environments using automated CI/CD pipelines.

**Addresses:** GAP-015 - Deployment Workflow

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Deployment Methods](#deployment-methods)
- [Step-by-Step Deployment](#step-by-step-deployment)
- [Rollback Procedures](#rollback-procedures)
- [Security & Access Management](#security--access-management)
- [Monitoring & Verification](#monitoring--verification)
- [Troubleshooting](#troubleshooting)

## Overview

### Deployment Architecture

The Polymarket Trading Bot uses a multi-stage deployment pipeline:

```
┌─────────────┐
│   Develop   │
│  (feature   │
│  branches)  │
└──────┬──────┘
       │
       │ PR Merge
       ▼
┌─────────────┐      ┌──────────────┐
│    Main     │─────▶│   CI Build   │
│   Branch    │      │   & Tests    │
└─────────────┘      └──────┬───────┘
                            │
                            │ Auto/Manual
                            ▼
                     ┌──────────────┐
                     │   Staging    │
                     │  Environment │
                     └──────┬───────┘
                            │
                            │ Manual Approval
                            ▼
                     ┌──────────────┐
                     │  Production  │
                     │  Environment │
                     └──────────────┘
```

### Deployment Triggers

| Trigger | Environment | Approval Required |
|---------|-------------|-------------------|
| Push to `main` | Staging | No (automatic) |
| Manual dispatch → Staging | Staging | No |
| Manual dispatch → Production | Production | Yes (required reviewers) |
| Rollback command | Any | Yes (for production) |

## Prerequisites

### Required Tools

- **GitHub Account** with repository access and appropriate permissions
- **Docker** (20.10+) for local testing
- **SSH Access** (if using SSH deployment method)
- **kubectl** (if using Kubernetes deployment method)
- **AWS CLI** (if using ECR or ECS deployment method)

### Required Secrets

Configure the following secrets in GitHub Settings → Secrets and variables → Actions:

#### Core Secrets (Required)

```bash
# Deployment Credentials
SSH_PRIVATE_KEY=<your-ssh-private-key>  # For SSH-based deployments
STAGING_HOST=user@staging.example.com   # Staging server
PRODUCTION_HOST=user@prod.example.com   # Production server

# Container Registry (Choose one or more)
GITHUB_TOKEN=<auto-provided>            # GitHub Container Registry (GHCR)
DOCKERHUB_USERNAME=<username>           # Docker Hub (optional)
DOCKERHUB_TOKEN=<token>                 # Docker Hub (optional)
AWS_ROLE_ARN=<arn>                      # AWS ECR (optional)
AWS_REGION=<region>                     # AWS ECR (optional)

# Application Secrets (Per Environment)
STAGING_PRIVATE_KEY=0x...               # Trading wallet for staging
PRODUCTION_PRIVATE_KEY=0x...            # Trading wallet for production
STAGING_ADMIN_TOKEN=<secret>            # API admin token for staging
PRODUCTION_ADMIN_TOKEN=<secret>         # API admin token for production
```

#### Optional Secrets (Notifications)

```bash
# Telegram Notifications
TELEGRAM_BOT_TOKEN=<bot-token>
TELEGRAM_CHAT_ID=<chat-id>

# Slack Notifications
SLACK_WEBHOOK=<webhook-url>
```

### Required Variables

Configure the following variables in GitHub Settings → Secrets and variables → Actions → Variables:

```bash
# Environment URLs
STAGING_URL=https://staging.example.com
PRODUCTION_URL=https://prod.example.com

# Deployment Configuration
DEPLOYMENT_METHOD=ssh  # Options: ssh, kubernetes, ecs, docker-compose
```

### Environment Protection Rules

**CRITICAL:** Configure environment protection rules in GitHub Settings → Environments:

#### Staging Environment

- **Environment name:** `staging`
- **Required reviewers:** None (auto-deploy on main push)
- **Wait timer:** 0 minutes
- **Deployment branches:** `main` only

#### Production Environment

- **Environment name:** `production`
- **Required reviewers:** At least 2 reviewers (repository maintainers)
- **Wait timer:** 5 minutes (cooldown period)
- **Deployment branches:** `main` only
- **Environment secrets:** Production-specific secrets

## Environment Setup

### Staging Environment

**Purpose:** Testing and validation before production

**Configuration:**

```bash
# .env.staging (on deployment server)
# Trading Configuration
LIVE_TRADING=false                      # Always false in staging
COMPLIANCE_ACCEPTED=false               # Always false in staging
PAPER_TRADING_ENABLED=true              # Always true in staging

# API Endpoints (Use production APIs for realistic testing)
CLOB_API_URL=https://clob.polymarket.com
GAMMA_API_URL=https://gamma-api.polymarket.com
WS_MARKET_URL=wss://ws-subscriptions-clob.polymarket.com/ws/market

# Security
SECRET_SOURCE=encrypted                 # Use encrypted storage
ENCRYPTION_KEY=${STAGING_ENCRYPTION_KEY}

# Monitoring
LOG_LEVEL=debug                         # Verbose logging for debugging
METRICS_PORT=9090
PORT=3000

# Risk Limits (Lower for staging)
RISK_MAX_EXPOSURE_PER_MARKET=100
RISK_MAX_OPEN_ORDERS=10

# Database Paths
EVENT_STORE_PATH=/app/data/staging/events.db
SIGNAL_CATALOG_PATH=/app/data/staging/signals.db
```

### Production Environment

**Purpose:** Live trading with real funds

**Configuration:**

```bash
# .env.production (on deployment server)
# Trading Configuration
LIVE_TRADING=true                       # Enable live trading
COMPLIANCE_ACCEPTED=true                # Must be explicitly true

# API Endpoints
CLOB_API_URL=https://clob.polymarket.com
GAMMA_API_URL=https://gamma-api.polymarket.com
WS_MARKET_URL=wss://ws-subscriptions-clob.polymarket.com/ws/market

# Security (CRITICAL)
SECRET_SOURCE=aws                       # Use AWS Secrets Manager in production
AWS_SECRET_NAME=polymarket-bot/private-key
AWS_REGION=us-east-1

# Monitoring
LOG_LEVEL=info                          # Standard logging
METRICS_PORT=9090
PORT=3000

# Risk Limits (Production values)
RISK_MAX_EXPOSURE_PER_MARKET=1000
RISK_MAX_OPEN_ORDERS=50
RISK_MAX_DRAWDOWN=0.20

# Database Paths
EVENT_STORE_PATH=/app/data/production/events.db
SIGNAL_CATALOG_PATH=/app/data/production/signals.db

# Alerting (REQUIRED)
TELEGRAM_BOT_TOKEN=${PRODUCTION_TELEGRAM_TOKEN}
TELEGRAM_CHAT_ID=${PRODUCTION_TELEGRAM_CHAT}
ALERT_ERROR_RATE_THRESHOLD=5
```

## Deployment Methods

### Method 1: SSH Deployment (Recommended for VMs)

**Best for:** Single server, VPS, dedicated instances

**Setup:**

1. Generate SSH key for deployment:
   ```bash
   ssh-keygen -t ed25519 -C "github-actions-deploy" -f deploy_key
   ```

2. Add public key to deployment server:
   ```bash
   ssh-copy-id -i deploy_key.pub user@server.example.com
   ```

3. Add private key to GitHub Secrets as `SSH_PRIVATE_KEY`

4. Configure deployment server:
   ```bash
   # On deployment server
   mkdir -p /app/data/{staging,production}
   chown -R deploy-user:deploy-user /app
   
   # Install Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   usermod -aG docker deploy-user
   ```

5. Enable SSH deployment in workflow (uncomment SSH sections in `deploy.yml`)

### Method 2: Kubernetes Deployment

**Best for:** Container orchestration, high availability, auto-scaling

**Setup:**

1. Create Kubernetes namespace:
   ```bash
   kubectl create namespace polymarket-staging
   kubectl create namespace polymarket-production
   ```

2. Create deployment manifests:
   ```yaml
   # k8s/staging/deployment.yml
   apiVersion: apps/v1
   kind: Deployment
   metadata:
     name: polymarket-bot
     namespace: polymarket-staging
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
           image: ghcr.io/YOUR_ORG/polymarket-bot:staging
           ports:
           - containerPort: 3000
           - containerPort: 9090
           envFrom:
           - secretRef:
               name: polymarket-secrets
           volumeMounts:
           - name: data
             mountPath: /app/data
         volumes:
         - name: data
           persistentVolumeClaim:
             claimName: polymarket-data
   ```

3. Create secrets:
   ```bash
   kubectl create secret generic polymarket-secrets \
     --from-env-file=.env.staging \
     -n polymarket-staging
   ```

4. Configure `kubectl` access in GitHub Actions (add kubeconfig to secrets)

5. Enable Kubernetes deployment in workflow (uncomment Kubernetes sections)

### Method 3: AWS ECS Deployment

**Best for:** AWS infrastructure, managed container orchestration

**Setup:**

1. Create ECS cluster:
   ```bash
   aws ecs create-cluster --cluster-name polymarket-bot
   ```

2. Create task definition:
   ```json
   {
     "family": "polymarket-bot",
     "containerDefinitions": [{
       "name": "polymarket-bot",
       "image": "YOUR_ECR_REPO/polymarket-bot:latest",
       "memory": 2048,
       "cpu": 1024,
       "essential": true,
       "portMappings": [
         {"containerPort": 3000},
         {"containerPort": 9090}
       ],
       "secrets": [{
         "name": "PRIVATE_KEY",
         "valueFrom": "arn:aws:secretsmanager:region:account:secret:polymarket/private-key"
       }]
     }]
   }
   ```

3. Configure AWS credentials using OIDC (recommended) or access keys

4. Enable ECS deployment in workflow

### Method 4: Docker Compose (Simple)

**Best for:** Single-server deployments, testing

**Setup:**

1. Create `docker-compose.production.yml` on server:
   ```yaml
   services:
     backend:
       image: ghcr.io/YOUR_ORG/polymarket-bot:${IMAGE_TAG}
       restart: unless-stopped
       env_file: .env.production
       volumes:
         - ./data:/app/data
       ports:
         - "3000:3000"
         - "9090:9090"
   ```

2. Deploy script on server:
   ```bash
   #!/bin/bash
   # /app/deploy.sh
   export IMAGE_TAG=$1
   docker-compose -f docker-compose.production.yml pull
   docker-compose -f docker-compose.production.yml up -d
   ```

3. Enable Docker Compose deployment in workflow

## Step-by-Step Deployment

### Deploying to Staging

#### Option A: Automatic (on merge to main)

1. **Merge PR to main branch:**
   ```bash
   # Create and merge your PR
   git checkout -b feature/my-feature
   git commit -m "feat: add new feature"
   git push origin feature/my-feature
   # Create PR and merge via GitHub
   ```

2. **Monitor deployment:**
   - Go to **Actions** tab in GitHub
   - Find the "Deploy" workflow run
   - Monitor progress through stages:
     - ✅ Validate (tests, security scan)
     - ✅ Build (Docker image)
     - ✅ Deploy to Staging
     - ✅ Verify & Smoke Tests

3. **Verify deployment:**
   ```bash
   # Check staging health
   curl https://staging.example.com/health
   
   # Check metrics
   curl https://staging.example.com/metrics
   
   # Verify logs
   ssh staging.example.com "docker logs polymarket-bot"
   ```

#### Option B: Manual Trigger

1. **Go to Actions → Deploy workflow**

2. **Click "Run workflow"**
   - **Branch:** `main`
   - **Environment:** `staging`
   - **Skip tests:** `false` (recommended)

3. **Monitor and verify** (same as Option A)

### Deploying to Production

**CRITICAL:** Production deployments require:
- ✅ Successful staging deployment
- ✅ Manual approval from required reviewers
- ✅ All tests passing
- ✅ Security scan clean

#### Step 1: Trigger Production Deployment

1. **Go to Actions → Deploy workflow**

2. **Click "Run workflow"**
   - **Branch:** `main`
   - **Environment:** `production`
   - **Skip tests:** `false` (NEVER skip in production)
   - **Rollback:** (leave empty for new deployment)

3. **Workflow starts validation:**
   - Type checking
   - Unit tests
   - Integration tests
   - Security audit
   - Secret scanning

#### Step 2: Build & Security Scan

1. **Docker image build:**
   - Multi-arch build (amd64, arm64)
   - Tagged with SHA and version
   - Pushed to container registry

2. **Security scanning:**
   - Trivy vulnerability scan
   - Results uploaded to GitHub Security

3. **Wait for approval request notification**

#### Step 3: Approve Deployment

1. **Review deployment request:**
   - Go to **Actions → Deploy workflow → Waiting for approval**
   - Review changes since last deployment
   - Check staging verification results
   - Verify security scan results

2. **Approve deployment:**
   - Click **Review deployments**
   - Select **production** environment
   - Click **Approve and deploy**
   - Add approval comment (recommended)

3. **Deployment executes:**
   - Pull Docker image
   - Zero-downtime deployment (blue-green)
   - Health check verification
   - Smoke tests

#### Step 4: Verify Production Deployment

1. **Automated verification:**
   - Health endpoint check
   - Metrics endpoint check
   - Smoke tests (read-only)

2. **Manual verification checklist:**

   ```bash
   # Health check
   curl -f https://prod.example.com/health
   
   # Metrics available
   curl -f https://prod.example.com/metrics
   
   # WebSocket connectivity
   wscat -c wss://prod.example.com/ws
   
   # Check logs for errors
   ssh prod.example.com "docker logs --tail 100 polymarket-bot"
   
   # Verify trading gates
   ssh prod.example.com \
     'docker exec polymarket-bot sh -c "echo LIVE_TRADING=\$LIVE_TRADING"'
   
   # Check open positions
   curl -H "Authorization: Bearer ${ADMIN_TOKEN}" \
     https://prod.example.com/api/positions
   
   # Verify alerting
   curl -X POST https://prod.example.com/api/test-alert
   ```

3. **Monitor for 30 minutes:**
   - Watch logs for errors
   - Monitor metrics dashboard
   - Check Telegram alerts
   - Verify trading activity (if applicable)

## Rollback Procedures

### When to Rollback

Rollback immediately if:

- ❌ Health checks fail
- ❌ Critical errors in logs
- ❌ Trading logic malfunction
- ❌ Performance degradation
- ❌ Security vulnerability detected
- ❌ Data corruption

### Automated Rollback (Recommended)

#### Method 1: Using Deploy Workflow

1. **Go to Actions → Deploy workflow**

2. **Click "Run workflow"**
   - **Branch:** `main`
   - **Environment:** `production`
   - **Rollback:** `v1.2.3` (specify previous version tag)

3. **Approve rollback** (if in production)

4. **Workflow executes rollback:**
   - Pulls specified version
   - Deploys previous version
   - Verifies deployment

#### Method 2: Using Git Revert

1. **Revert problematic commit:**
   ```bash
   git revert <commit-hash>
   git push origin main
   ```

2. **Automatic deployment triggers:**
   - Staging deploys automatically
   - Production requires approval

### Manual Rollback

**Emergency rollback when CI/CD is unavailable:**

#### SSH Deployment Rollback

```bash
# Connect to server
ssh production.example.com

# Stop current container
docker stop polymarket-bot
docker rename polymarket-bot polymarket-bot-failed

# Find previous version
docker images ghcr.io/YOUR_ORG/polymarket-bot

# Start previous version
docker run -d --name polymarket-bot \
  -p 3000:3000 \
  --env-file /app/.env.production \
  -v /app/data:/app/data \
  --restart unless-stopped \
  ghcr.io/YOUR_ORG/polymarket-bot:v1.2.3

# Verify rollback
curl http://localhost:3000/health

# If successful, remove failed container
docker rm polymarket-bot-failed
```

#### Kubernetes Rollback

```bash
# Rollback to previous revision
kubectl rollout undo deployment/polymarket-bot -n production

# Rollback to specific revision
kubectl rollout history deployment/polymarket-bot -n production
kubectl rollout undo deployment/polymarket-bot -n production --to-revision=3

# Monitor rollback
kubectl rollout status deployment/polymarket-bot -n production
```

#### Docker Compose Rollback

```bash
# On deployment server
cd /app
export IMAGE_TAG=v1.2.3
docker-compose -f docker-compose.production.yml pull
docker-compose -f docker-compose.production.yml up -d
```

### Post-Rollback Actions

1. **Verify service recovery:**
   ```bash
   curl https://prod.example.com/health
   curl https://prod.example.com/metrics
   ```

2. **Document rollback:**
   - Create incident report
   - Document root cause
   - Create issue for fix
   - Update runbook if needed

3. **Fix and redeploy:**
   - Fix issue in feature branch
   - Test thoroughly in staging
   - Deploy to production with approval

## Security & Access Management

### Access Control

#### GitHub Repository Access

| Role | Permissions | Purpose |
|------|-------------|---------|
| **Admin** | Full access | Repository owners |
| **Maintainer** | Write + deployments | Core team members |
| **Developer** | Write (no deployments) | Contributors |
| **Read-only** | Read access only | Auditors, stakeholders |

#### Environment-Specific Access

**Staging:**
- Accessible by: All maintainers and developers
- Approval: Not required
- Purpose: Testing and validation

**Production:**
- Accessible by: Admins and designated maintainers only
- Approval: Required (minimum 2 reviewers)
- Purpose: Live trading

### Secret Management

#### Secrets Hierarchy

```
GitHub Organization Secrets (Shared)
    ↓
Repository Secrets (Bot-specific)
    ↓
Environment Secrets (Staging/Production)
    ↓
Deployment Server (.env files)
```

#### Secret Rotation Schedule

| Secret | Rotation Frequency | Automated |
|--------|-------------------|-----------|
| SSH Keys | Every 90 days | No |
| Admin Tokens | Every 30 days | No |
| Private Keys | On compromise only | No |
| Docker Registry | Every 180 days | No |
| Telegram Bot Token | On compromise only | No |

#### Secret Rotation Procedure

1. **Generate new secret:**
   ```bash
   # Example: New admin token
   openssl rand -hex 32
   ```

2. **Update in all locations:**
   - GitHub Secrets
   - Deployment server .env files
   - Any local development .env

3. **Deploy with new secret:**
   - Test in staging first
   - Deploy to production
   - Verify functionality

4. **Revoke old secret:**
   - Only after confirming new secret works
   - Document rotation in security log

### Security Checklist

Before every production deployment:

- [ ] **No hardcoded secrets** in code
- [ ] **Security scan passed** (Trivy/Snyk)
- [ ] **Dependency audit passed** (npm audit)
- [ ] **Secret scan passed** (TruffleHog)
- [ ] **All tests passing**
- [ ] **Trading gates configured** (LIVE_TRADING, COMPLIANCE_ACCEPTED)
- [ ] **Secrets rotated** (if due)
- [ ] **Access logs reviewed**
- [ ] **Monitoring configured** (Telegram, Grafana)
- [ ] **Backup verified** (can restore if needed)

## Monitoring & Verification

### Health Checks

#### Automated Health Checks

The deployment workflow automatically verifies:

1. **HTTP Health Endpoint:**
   ```bash
   curl -f https://prod.example.com/health
   # Expected: 200 OK
   ```

2. **Metrics Endpoint:**
   ```bash
   curl -f https://prod.example.com/metrics
   # Expected: Prometheus metrics
   ```

3. **WebSocket Connectivity:**
   ```bash
   wscat -c wss://prod.example.com/ws
   # Expected: Connection established
   ```

#### Manual Health Checks

After deployment, verify:

```bash
# 1. Service is running
docker ps | grep polymarket-bot

# 2. No critical errors in logs
docker logs --since 5m polymarket-bot | grep -i "error\|fatal\|critical"

# 3. Database accessible
docker exec polymarket-bot ls -la /app/data

# 4. Trading gates configured correctly
docker exec polymarket-bot sh -c 'echo "LIVE_TRADING=$LIVE_TRADING"'

# 5. API endpoints responding
curl https://prod.example.com/api/markets | jq
```

### Deployment Verification Checklist

Use the automated script:

```bash
# From repository root
./scripts/verify-deployment.sh production

# Or manually:
BASE_URL=https://prod.example.com ./scripts/verify-pre-deploy.sh
```

Manual checklist:

- [ ] Health endpoint returns 200
- [ ] Metrics endpoint returns Prometheus format
- [ ] WebSocket connects successfully
- [ ] Markets data loading correctly
- [ ] Order book data available
- [ ] Position tracking working
- [ ] Kill switch accessible
- [ ] Logs showing expected activity
- [ ] No error spikes in metrics
- [ ] Telegram alerts configured and working
- [ ] Backup scheduled and running
- [ ] Resource usage normal (CPU, memory, disk)

### Monitoring Dashboards

#### Grafana Dashboard

Access: `https://grafana.example.com`

**Key Metrics:**
- Request rate and latency
- Error rate and types
- WebSocket connections
- Order placement success rate
- Position P&L
- Risk metrics
- Circuit breaker status

#### GitHub Actions Dashboard

**Monitor deployments:**
1. Go to **Actions** tab
2. Filter by **Deploy** workflow
3. Review recent runs
4. Check success/failure rate
5. Review approval history

### Alerts Configuration

**Critical Alerts (Immediate Response):**
- Service down (health check fail)
- Error rate spike (>10% in 5 minutes)
- Circuit breaker triggered
- Kill switch activated
- Deployment failed
- Rollback required

**Warning Alerts (Review Required):**
- High memory usage (>80%)
- High CPU usage (>80%)
- Slow response times (>1s p95)
- WebSocket disconnections
- Failed order attempts
- Balance below threshold

## Troubleshooting

### Common Deployment Issues

#### Issue: Deployment Workflow Fails at Validation

**Symptoms:**
- Tests fail
- Type checking errors
- Security scan failures

**Solution:**
```bash
# Run checks locally
npm ci
npm run build
npm test
npm audit --audit-level=high

# Fix issues and push
git commit -am "fix: resolve deployment issues"
git push
```

#### Issue: Docker Image Build Fails

**Symptoms:**
- Build step fails in Actions
- "No space left on device"
- Dependency installation errors

**Solution:**
```bash
# Test build locally
docker build -t polymarket-bot:test .

# Check Dockerfile syntax
docker build --no-cache -t polymarket-bot:test .

# If using legacy dependencies
docker build --build-arg NODE_OPTIONS="--max-old-space-size=4096" .
```

#### Issue: Deployment Stuck Waiting for Approval

**Symptoms:**
- Workflow shows "Waiting for approval"
- No approval notification received

**Solution:**
1. Check environment protection rules
2. Verify required reviewers are configured
3. Check reviewer notifications settings
4. Manually approve from Actions tab

#### Issue: Health Check Fails After Deployment

**Symptoms:**
- Deployment completes but verification fails
- Health endpoint returns 500 or timeout

**Solution:**
```bash
# Connect to server
ssh production.example.com

# Check container status
docker ps -a | grep polymarket-bot

# View logs
docker logs polymarket-bot

# Check environment variables
docker exec polymarket-bot env | grep -E "LIVE_TRADING|PRIVATE_KEY|PORT"

# Test health endpoint locally
docker exec polymarket-bot curl http://localhost:3000/health

# Restart if needed
docker restart polymarket-bot
```

#### Issue: Rollback Doesn't Complete

**Symptoms:**
- Rollback workflow fails
- Previous version not available

**Solution:**
```bash
# List available versions
docker images ghcr.io/YOUR_ORG/polymarket-bot

# If version not available, pull manually
docker pull ghcr.io/YOUR_ORG/polymarket-bot:v1.2.3

# Deploy manually
docker stop polymarket-bot
docker rm polymarket-bot
docker run -d --name polymarket-bot \
  -p 3000:3000 \
  --env-file /app/.env.production \
  -v /app/data:/app/data \
  ghcr.io/YOUR_ORG/polymarket-bot:v1.2.3
```

### Getting Help

1. **Check documentation:**
   - [Runbook](./runbook.md)
   - [Troubleshooting Guide](./troubleshooting.md)
   - [Docker Guide](./docker.md)

2. **Review logs:**
   - GitHub Actions logs
   - Application logs
   - System logs

3. **Ask for help:**
   - Create GitHub issue
   - Contact maintainers
   - Check community channels

## Related Documentation

- **[Runbook](./runbook.md)** - Operational procedures
- **[Docker Guide](./docker.md)** - Container deployment
- **[Pre-deployment Verification](./pre-deployment-verification.md)** - Checklist
- **[Security Guide](./security.md)** - Security best practices
- **[Automation Guide](./automation.md)** - CI/CD overview
- **[Troubleshooting](./troubleshooting.md)** - Problem resolution

---

**Last Updated:** 2026-02-16  
**Status:** Active  
**Addresses:** GAP-015 - Deployment Workflow  
**Maintainers:** Repository admins and core team
