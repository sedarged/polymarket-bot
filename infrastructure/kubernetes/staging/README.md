# Kubernetes Staging Environment

This directory contains Kubernetes manifests for deploying the Polymarket Trading Bot to a staging environment.

## Overview

The staging environment provides:
- **Isolated namespace** (`polymarket-staging`)
- **Paper trading only** (no real money at risk)
- **Debug logging** for troubleshooting
- **Lower resource limits** compared to production
- **Separate configuration** and secrets

## Prerequisites

- Kubernetes cluster (1.19+)
- `kubectl` CLI tool configured
- Sufficient cluster resources
- (Optional) Ingress controller for external access
- (Optional) cert-manager for TLS certificates

## Quick Start

### 1. Create Namespace

```bash
kubectl apply -f namespace.yaml
```

### 2. Create ConfigMap

```bash
kubectl apply -f configmap.yaml
```

### 3. Create Secrets

**IMPORTANT:** Do NOT use the example secret file directly!

Create secrets using `kubectl create secret`:

```bash
# Generate a staging admin token
ADMIN_TOKEN=$(openssl rand -hex 32)

# Create the secret
kubectl create secret generic polymarket-bot-staging-secrets \
  --from-literal=ADMIN_TOKEN="${ADMIN_TOKEN}" \
  --from-literal=PRIVATE_KEY="your_staging_wallet_private_key" \
  --namespace=polymarket-staging

# Optional: Add Telegram alerts
kubectl patch secret polymarket-bot-staging-secrets \
  --namespace=polymarket-staging \
  --type merge \
  -p '{"data":{"TELEGRAM_BOT_TOKEN":"'$(echo -n "your_token" | base64)'","TELEGRAM_CHAT_ID":"'$(echo -n "your_chat_id" | base64)'"}}'
```

### 4. Create Persistent Volume Claim

```bash
kubectl apply -f pvc.yaml
```

### 5. Deploy Application

```bash
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

### 6. (Optional) Create Ingress

Edit `ingress.yaml` to set your domain, then:

```bash
kubectl apply -f ingress.yaml
```

## Verification

### Check Deployment Status

```bash
# List all resources in staging namespace
kubectl get all -n polymarket-staging

# Check pod status
kubectl get pods -n polymarket-staging

# View pod logs
kubectl logs -n polymarket-staging -l app=polymarket-bot -f

# Check deployment status
kubectl rollout status deployment/polymarket-bot-staging -n polymarket-staging
```

### Health Checks

```bash
# Port forward to access locally
kubectl port-forward -n polymarket-staging svc/polymarket-bot-staging 3001:3001

# Check health endpoint
curl http://localhost:3001/health

# Check metrics endpoint
curl http://localhost:3001/metrics
```

### Verify Configuration

```bash
# Check if live trading is disabled (must be "false")
kubectl exec -n polymarket-staging deployment/polymarket-bot-staging -- \
  sh -c 'echo "LIVE_TRADING=$LIVE_TRADING"'

# Check log level
kubectl exec -n polymarket-staging deployment/polymarket-bot-staging -- \
  sh -c 'echo "LOG_LEVEL=$LOG_LEVEL"'
```

## Updating Deployment

### Update Image

```bash
# Update to specific version
kubectl set image deployment/polymarket-bot-staging \
  polymarket-bot=ghcr.io/sedarged/polymarket-bot:v1.2.3 \
  -n polymarket-staging

# Monitor rollout
kubectl rollout status deployment/polymarket-bot-staging -n polymarket-staging
```

### Update Configuration

```bash
# Edit ConfigMap
kubectl edit configmap polymarket-bot-staging-config -n polymarket-staging

# Restart deployment to pick up changes
kubectl rollout restart deployment/polymarket-bot-staging -n polymarket-staging
```

### Update Secrets

```bash
# Update a secret value
kubectl patch secret polymarket-bot-staging-secrets \
  --namespace=polymarket-staging \
  --type merge \
  -p '{"data":{"ADMIN_TOKEN":"'$(echo -n "new_token" | base64)'"}}'

# Restart deployment
kubectl rollout restart deployment/polymarket-bot-staging -n polymarket-staging
```

## Rollback

### Rollback to Previous Version

```bash
# View rollout history
kubectl rollout history deployment/polymarket-bot-staging -n polymarket-staging

# Rollback to previous version
kubectl rollout undo deployment/polymarket-bot-staging -n polymarket-staging

# Rollback to specific revision
kubectl rollout undo deployment/polymarket-bot-staging -n polymarket-staging --to-revision=2
```

## Scaling

```bash
# Scale to N replicas (normally should be 1 for trading bot)
kubectl scale deployment/polymarket-bot-staging -n polymarket-staging --replicas=1
```

## Troubleshooting

### Pod Not Starting

```bash
# Describe pod to see events
kubectl describe pod -n polymarket-staging -l app=polymarket-bot

# Check logs
kubectl logs -n polymarket-staging -l app=polymarket-bot --tail=100

# Check if secrets exist
kubectl get secrets -n polymarket-staging
```

### Health Check Failing

```bash
# Get pod name
POD=$(kubectl get pod -n polymarket-staging -l app=polymarket-bot -o jsonpath='{.items[0].metadata.name}')

# Test health endpoint from inside pod
kubectl exec -n polymarket-staging $POD -- curl -f http://localhost:3001/health

# Check environment variables
kubectl exec -n polymarket-staging $POD -- env | sort
```

### Database Issues

```bash
# Check PVC status
kubectl get pvc -n polymarket-staging

# Check volume mount
kubectl exec -n polymarket-staging deployment/polymarket-bot-staging -- ls -la /app/data/staging
```

## Cleanup

### Delete All Resources

```bash
# Delete deployment and services
kubectl delete -f deployment.yaml
kubectl delete -f service.yaml
kubectl delete -f ingress.yaml

# Delete PVC (WARNING: This deletes all data!)
kubectl delete -f pvc.yaml

# Delete ConfigMap and Secrets
kubectl delete configmap polymarket-bot-staging-config -n polymarket-staging
kubectl delete secret polymarket-bot-staging-secrets -n polymarket-staging

# Delete namespace (deletes everything)
kubectl delete namespace polymarket-staging
```

## Monitoring

### View Metrics

```bash
# Port forward metrics endpoint
kubectl port-forward -n polymarket-staging svc/polymarket-bot-staging-metrics 9091:9091

# Access metrics
curl http://localhost:9091/metrics
```

### Prometheus Integration

If you have Prometheus installed, it will automatically scrape metrics from pods with the annotation:

```yaml
prometheus.io/scrape: "true"
prometheus.io/port: "9091"
prometheus.io/path: "/metrics"
```

## Security Notes

1. **Always verify LIVE_TRADING=false** in staging
2. **Use separate secrets** from production
3. **Restrict network access** using NetworkPolicies (optional)
4. **Use minimal permissions** for ServiceAccount
5. **Rotate secrets regularly**
6. **Monitor access logs**

## Next Steps

- Set up continuous deployment from CI/CD
- Configure monitoring and alerting
- Set up log aggregation
- Implement NetworkPolicies for network isolation
- Configure backup and disaster recovery

## Related Documentation

- [Deployment Guide](../../../docs/deployment-guide.md)
- [Staging Environment Setup](../../../docs/staging-environment.md)
- [Kubernetes README](../README.md)
