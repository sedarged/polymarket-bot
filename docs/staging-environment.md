# Staging Environment Guide

**Purpose:** Comprehensive guide for setting up and using the Polymarket Trading Bot staging environment for pre-production testing and validation.

**Addresses:** GAP-042 - Staging Environment

## Table of Contents

- [Overview](#overview)
- [Why Staging?](#why-staging)
- [Quick Start](#quick-start)
- [Deployment Methods](#deployment-methods)
- [Configuration](#configuration)
- [Testing Workflows](#testing-workflows)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Overview

The staging environment is a pre-production environment that mirrors production but uses:
- **Paper trading only** (no real money at risk)
- **Debug logging** for detailed troubleshooting
- **Lower resource limits** for cost efficiency
- **Separate configuration** and credentials
- **Isolated data storage**

### Key Differences from Production

| Feature | Staging | Production |
|---------|---------|------------|
| Trading Mode | Paper only | Live trading (gated) |
| Logging | Debug level | Info level |
| Port (API) | 3001 | 3000 |
| Port (Metrics) | 9091 | 9090 |
| Port (Grafana) | 3002 | 3001 |
| Resources | 256Mi-512Mi RAM | 512Mi-1Gi RAM |
| Risk Limits | $100/market | $1000/market |
| Reconciliation | Every 3 min | Every 5 min |
| Data Retention | 7-30 days | 90+ days |

## Why Staging?

### Benefits

1. **Safe Testing**
   - Test new features without risk
   - Validate configuration changes
   - Test deployment procedures
   - Practice incident response

2. **Early Bug Detection**
   - Catch issues before production
   - Test edge cases
   - Validate integrations
   - Performance testing

3. **Team Collaboration**
   - Shared testing environment
   - Demo new features
   - Reproduce production issues
   - Training environment

4. **Deployment Validation**
   - Test database migrations
   - Validate rollback procedures
   - Test monitoring and alerts
   - Verify health checks

## Quick Start

### Option 1: Docker Compose (Easiest)

**Prerequisites:**
- Docker (20.10+)
- Docker Compose (2.0+)

**Steps:**

```bash
# 1. Run setup script
./scripts/setup-staging.sh

# 2. Edit configuration
nano .env.staging

# 3. Start staging environment
docker compose -f docker-compose.staging.yml up -d

# 4. Verify deployment
./scripts/verify-deployment.sh staging http://localhost:3001

# 5. View logs
docker compose -f docker-compose.staging.yml logs -f
```

**Access URLs:**
- Backend API: http://localhost:3001
- Frontend: http://localhost:8081
- Metrics: http://localhost:9091/metrics
- Prometheus: http://localhost:9092
- Grafana: http://localhost:3002 (admin/staging-admin)

### Option 2: Kubernetes

**Prerequisites:**
- Kubernetes cluster (1.19+)
- `kubectl` configured

**Steps:**

```bash
# 1. Create namespace
kubectl apply -f infrastructure/kubernetes/staging/namespace.yaml

# 2. Create ConfigMap
kubectl apply -f infrastructure/kubernetes/staging/configmap.yaml

# 3. Create secrets
kubectl create secret generic polymarket-bot-staging-secrets \
  --from-literal=ADMIN_TOKEN="$(openssl rand -hex 32)" \
  --from-literal=PRIVATE_KEY="your_staging_wallet_key" \
  --namespace=polymarket-staging

# 4. Create PVC
kubectl apply -f infrastructure/kubernetes/staging/pvc.yaml

# 5. Deploy application
kubectl apply -f infrastructure/kubernetes/staging/deployment.yaml
kubectl apply -f infrastructure/kubernetes/staging/service.yaml

# 6. Verify deployment
kubectl get all -n polymarket-staging
kubectl logs -n polymarket-staging -l app=polymarket-bot -f
```

See [Kubernetes Staging README](../infrastructure/kubernetes/staging/README.md) for details.

### Option 3: Ansible (Production-like)

**Prerequisites:**
- Ansible (2.10+)
- SSH access to deployment server

**Steps:**

```bash
# 1. Configure inventory
cd infrastructure/ansible
cp inventory.example inventory
nano inventory  # Add staging host to [staging] group

# 2. Configure variables
cp group_vars/all/vault.yml.example group_vars/staging/vault.yml
nano group_vars/staging/vault.yml

# 3. Deploy
ansible-playbook -i inventory playbook.yml --tags setup,deploy --limit staging

# 4. Verify
ansible-playbook -i inventory playbook.yml --tags verify --limit staging
```

See [Ansible README](../infrastructure/ansible/README.md) for details.

## Deployment Methods

### Comparison

| Method | Complexity | Best For | Setup Time |
|--------|-----------|----------|------------|
| Docker Compose | Low | Local/single server | 5 minutes |
| Kubernetes | Medium | Scalable/HA | 15 minutes |
| Ansible | Medium | Production-like | 20 minutes |
| Manual | High | Custom setups | 30+ minutes |

### When to Use Each

- **Docker Compose:** Local development, quick testing, POC
- **Kubernetes:** Production-like staging, scalability testing
- **Ansible:** Infrastructure as code, repeatable deployments
- **Manual:** Custom environments, debugging

## Configuration

### Environment Variables

Key staging-specific settings in `.env.staging`:

```bash
# Always paper trading
LIVE_TRADING=false
COMPLIANCE_ACCEPTED=false

# Debug logging
LOG_LEVEL=debug

# Staging ports (avoid conflicts)
PORT=3001
METRICS_PORT=9091

# Lower risk limits
RISK_MAX_EXPOSURE_PER_MARKET=100
RISK_MAX_OPEN_ORDERS=10

# More frequent reconciliation
RECONCILIATION_INTERVAL_SECONDS=180

# Staging data paths
EVENT_STORE_PATH=./data/staging/events.db
SIGNAL_CATALOG_PATH=./data/staging/signals.db
```

### Security Configuration

**IMPORTANT:** Use separate credentials for staging:

1. **Staging Wallet**
   - Create a dedicated wallet for staging
   - Fund with minimal test USDC only
   - Never use production wallet

2. **Admin Token**
   - Generate unique token: `openssl rand -hex 32`
   - Never reuse production token
   - Store in secrets manager (not in code)

3. **API Keys**
   - Use separate Telegram bot for staging alerts
   - Separate monitoring credentials
   - Separate database credentials

### Network Configuration

#### Docker Compose

Staging uses isolated network:
```yaml
networks:
  polymarket-staging-network:
    driver: bridge
```

#### Kubernetes

Staging uses separate namespace:
```yaml
namespace: polymarket-staging
```

Optional: Add NetworkPolicies for isolation.

## Testing Workflows

### Pre-Release Testing

**Before deploying to production:**

1. **Deploy to Staging**
   ```bash
   # Deploy RC candidate
   docker compose -f docker-compose.staging.yml pull
   docker compose -f docker-compose.staging.yml up -d
   ```

2. **Run Smoke Tests**
   ```bash
   ./scripts/verify-deployment.sh staging http://localhost:3001
   ```

3. **Manual Testing**
   - Test new features
   - Verify bug fixes
   - Test edge cases
   - Stress testing

4. **Monitor for Issues**
   - Watch logs for errors
   - Check metrics dashboards
   - Verify alerts work
   - Test rollback procedures

5. **Approve for Production**
   - Document testing results
   - Get team approval
   - Schedule production deployment

### Feature Testing

**Testing new features in staging:**

```bash
# 1. Deploy feature branch
docker build -t polymarket-bot:feature-xyz .
docker tag polymarket-bot:feature-xyz polymarket-bot:staging
docker compose -f docker-compose.staging.yml up -d

# 2. Test feature
curl http://localhost:3001/api/new-feature

# 3. Verify logs
docker compose -f docker-compose.staging.yml logs -f backend-staging

# 4. Check metrics
curl http://localhost:9091/metrics | grep new_feature
```

### Load Testing

**Simulate production load in staging:**

```bash
# Install load testing tool
npm install -g artillery

# Run load test
artillery run tests/load/staging-load-test.yml

# Monitor during test
watch -n 1 'curl -s http://localhost:9091/metrics | grep http_requests'
```

### Chaos Testing

**Test resilience in staging:**

```bash
# Kill backend randomly
docker compose -f docker-compose.staging.yml kill backend-staging

# Verify automatic restart
docker compose -f docker-compose.staging.yml ps

# Check reconnection
docker compose -f docker-compose.staging.yml logs -f backend-staging
```

## Monitoring

### Health Checks

```bash
# Health endpoint
curl http://localhost:3001/health

# Expected response:
# {"status":"ok","timestamp":"2026-02-17T..."}
```

### Metrics

```bash
# View all metrics
curl http://localhost:9091/metrics

# Key metrics to monitor:
# - http_requests_total
# - order_submissions_total
# - websocket_connection_state
# - circuit_breaker_state
```

### Logs

```bash
# Docker Compose
docker compose -f docker-compose.staging.yml logs -f

# Filter by service
docker compose -f docker-compose.staging.yml logs -f backend-staging

# Kubernetes
kubectl logs -n polymarket-staging -l app=polymarket-bot -f

# Filter by level
kubectl logs -n polymarket-staging -l app=polymarket-bot | grep ERROR
```

### Dashboards

**Grafana:** http://localhost:3002
- Default credentials: admin/staging-admin
- Import dashboard: `grafana/polymarket-dashboard.json`
- View real-time metrics

**Prometheus:** http://localhost:9092
- Query metrics directly
- Test alert rules
- View targets

## Troubleshooting

### Common Issues

#### Issue: Port Already in Use

**Symptoms:**
```
Error: bind: address already in use
```

**Solution:**
```bash
# Check what's using the port
lsof -i :3001

# Stop conflicting service or change staging port
# Edit .env.staging: PORT=3002
```

#### Issue: Database Not Persisting

**Symptoms:**
- Data lost on restart
- Empty database after deployment

**Solution:**
```bash
# Check volume mount
docker compose -f docker-compose.staging.yml ps -a
docker volume ls

# Verify data directory
docker compose -f docker-compose.staging.yml exec backend-staging ls -la /app/data/staging
```

#### Issue: Cannot Connect to Backend

**Symptoms:**
```
curl: (7) Failed to connect to localhost port 3001
```

**Solution:**
```bash
# Check if container is running
docker compose -f docker-compose.staging.yml ps

# Check logs for errors
docker compose -f docker-compose.staging.yml logs backend-staging

# Verify health check
docker inspect polymarket-backend-staging | jq '.[0].State.Health'
```

#### Issue: Live Trading Enabled in Staging

**CRITICAL - This should never happen!**

**Detection:**
```bash
# Check environment
docker compose -f docker-compose.staging.yml exec backend-staging sh -c 'echo $LIVE_TRADING'

# Should output: false
```

**Solution:**
```bash
# Stop immediately
docker compose -f docker-compose.staging.yml down

# Fix configuration
nano .env.staging
# Ensure: LIVE_TRADING=false

# Verify docker-compose.staging.yml
grep "LIVE_TRADING" docker-compose.staging.yml
# Should show: - LIVE_TRADING=false

# Restart
docker compose -f docker-compose.staging.yml up -d
```

### Debug Mode

Enable additional debugging:

```bash
# Add to .env.staging
LOG_LEVEL=debug
DEBUG=*

# Restart
docker compose -f docker-compose.staging.yml restart backend-staging

# View detailed logs
docker compose -f docker-compose.staging.yml logs -f backend-staging
```

## Best Practices

### Configuration Management

1. **Never commit secrets**
   - Use `.env.staging` (gitignored)
   - Use secrets manager for CI/CD
   - Rotate secrets regularly

2. **Version control**
   - Commit `.env.staging.example`
   - Document required variables
   - Track configuration changes

3. **Validation**
   - Verify LIVE_TRADING=false on every deployment
   - Check logs for unexpected behavior
   - Monitor metrics continuously

### Data Management

1. **Isolation**
   - Use separate databases for staging
   - Never share credentials with production
   - Clear data regularly

2. **Backups**
   - Test backup procedures in staging
   - Verify restore works
   - Practice disaster recovery

3. **Retention**
   - Keep staging data for 7-30 days
   - Auto-cleanup old data
   - Document cleanup procedures

### Testing Practices

1. **Automated Testing**
   - Run smoke tests on every deployment
   - Integration tests in staging
   - Load tests before releases

2. **Manual Testing**
   - Follow test checklists
   - Document test results
   - Reproduce production issues

3. **Continuous Improvement**
   - Update tests based on findings
   - Improve monitoring
   - Enhance automation

### Security Practices

1. **Access Control**
   - Limit who can deploy to staging
   - Use authentication for endpoints
   - Audit access logs

2. **Network Security**
   - Use NetworkPolicies (K8s)
   - Restrict public access
   - Use VPN for sensitive testing

3. **Compliance**
   - Follow same security standards as production
   - Regular security scans
   - Incident response practice

## Maintenance

### Regular Tasks

**Daily:**
- Check logs for errors
- Monitor metrics
- Verify health checks

**Weekly:**
- Review staging deployments
- Update dependencies
- Clean up old data

**Monthly:**
- Rotate secrets
- Update documentation
- Review access logs

### Cleanup

**Remove staging environment:**

```bash
# Docker Compose
docker compose -f docker-compose.staging.yml down -v
rm -rf data/staging

# Kubernetes
kubectl delete namespace polymarket-staging

# Ansible
ansible-playbook -i inventory playbook.yml --tags cleanup --limit staging
```

## Related Documentation

- [Deployment Guide](./deployment-guide.md) - Full deployment procedures
- [Deployment Workflow](./deployment-workflow-testing.md) - CI/CD workflows
- [Docker Guide](./docker.md) - Container deployment
- [Kubernetes Staging](../infrastructure/kubernetes/staging/README.md) - K8s specifics
- [Ansible Playbook](../infrastructure/ansible/README.md) - Ansible deployment

## Support

**Issues:**
- Create issue: [GitHub Issues](https://github.com/sedarged/polymarket-bot/issues)
- Tag with: `staging`, `deployment`

**Questions:**
- Check [Troubleshooting](#troubleshooting)
- Review [Common Issues](#common-issues)
- Ask in team chat

---

**Last Updated:** 2026-02-17  
**Status:** Active  
**Addresses:** GAP-042 - Staging Environment  
**Maintainers:** Repository admins and core team
