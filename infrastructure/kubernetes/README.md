# Kubernetes Deployment for Polymarket Bot

Complete Kubernetes manifests for deploying the Polymarket Trading Bot to any Kubernetes cluster.

## Architecture

```
┌────────────────────────────────────────────────────┐
│             Kubernetes Cluster                      │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │       Namespace: polymarket-bot             │  │
│  │                                             │  │
│  │  ┌─────────────┐        ┌──────────────┐   │  │
│  │  │ ConfigMap   │        │   Secret     │   │  │
│  │  └─────────────┘        └──────────────┘   │  │
│  │         │                      │           │  │
│  │         └──────────┬───────────┘           │  │
│  │                    │                       │  │
│  │         ┌──────────▼─────────┐             │  │
│  │         │    Deployment      │             │  │
│  │         │  ┌──────────────┐  │             │  │
│  │         │  │     Pod      │  │             │  │
│  │         │  │  Container   │  │             │  │
│  │         │  └──────────────┘  │             │  │
│  │         └────────┬───────────┘             │  │
│  │                  │                         │  │
│  │         ┌────────▼───────────┐             │  │
│  │         │      Service       │             │  │
│  │         └────────┬───────────┘             │  │
│  │                  │                         │  │
│  │         ┌────────▼───────────┐             │  │
│  │         │      Ingress       │             │  │
│  │         └────────────────────┘             │  │
│  │                  │                         │  │
│  │         ┌────────▼───────────┐             │  │
│  │         │        PVC         │             │  │
│  │         │   (Persistent      │             │  │
│  │         │    Storage)        │             │  │
│  │         └────────────────────┘             │  │
│  └─────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

## Files

- `namespace.yaml` - Kubernetes namespace
- `configmap.yaml` - Non-sensitive configuration
- `secret.yaml.example` - Example secret (DO NOT commit actual secrets)
- `deployment.yaml` - Main application deployment
- `service.yaml` - Service for internal and external access
- `pvc.yaml` - Persistent volume claim for data storage
- `hpa.yaml` - Horizontal Pod Autoscaler (keep replicas=1 for trading)
- `ingress.yaml` - Ingress for HTTP/HTTPS access

## Prerequisites

1. **Kubernetes Cluster** (v1.24+)
   - Managed: EKS, GKE, AKS, DigitalOcean, Linode
   - Self-hosted: kubeadm, k3s, kind, minikube

2. **kubectl** configured to access your cluster

3. **Storage Class** configured in your cluster

4. **Ingress Controller** (optional, for HTTP access)
   - nginx-ingress, traefik, etc.

5. **Cert Manager** (optional, for automatic TLS)

## Quick Start

### 1. Create Namespace

```bash
kubectl apply -f namespace.yaml
```

### 2. Create Secrets

**IMPORTANT:** Never commit actual secrets to git.

```bash
# Create from environment file
kubectl create secret generic polymarket-bot-secrets \
    --from-env-file=.env.production \
    --namespace=polymarket-bot

# Or create manually
kubectl create secret generic polymarket-bot-secrets \
    --from-literal=PRIVATE_KEY='0x...' \
    --from-literal=ADMIN_TOKEN='...' \
    --from-literal=LIVE_TRADING='false' \
    --from-literal=COMPLIANCE_ACCEPTED='false' \
    --namespace=polymarket-bot
```

### 3. Apply ConfigMap

```bash
kubectl apply -f configmap.yaml
```

### 4. Create Persistent Storage

```bash
kubectl apply -f pvc.yaml
```

### 5. Deploy Application

```bash
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

### 6. (Optional) Setup Ingress

```bash
# Edit ingress.yaml with your domain
kubectl apply -f ingress.yaml
```

## Verification

### Check Resources

```bash
# Check all resources
kubectl get all -n polymarket-bot

# Check pods
kubectl get pods -n polymarket-bot

# Check services
kubectl get svc -n polymarket-bot

# Check persistent volume
kubectl get pvc -n polymarket-bot
```

### View Logs

```bash
# Get pod name
POD_NAME=$(kubectl get pods -n polymarket-bot -l app=polymarket-bot -o jsonpath='{.items[0].metadata.name}')

# View logs
kubectl logs -n polymarket-bot $POD_NAME -f

# View previous logs (if pod crashed)
kubectl logs -n polymarket-bot $POD_NAME --previous
```

### Access Application

#### Port Forward (for testing)

```bash
# Forward API port
kubectl port-forward -n polymarket-bot svc/polymarket-bot 3000:3000

# Access via browser or curl
curl http://localhost:3000/health
```

#### Via LoadBalancer

```bash
# Get external IP
kubectl get svc -n polymarket-bot polymarket-bot-external

# Access via external IP
curl http://<EXTERNAL-IP>/health
```

#### Via Ingress

```bash
# Get ingress address
kubectl get ingress -n polymarket-bot

# Access via domain
curl https://api.polymarket-bot.example.com/health
```

## Configuration

### Update ConfigMap

```bash
# Edit configmap
kubectl edit configmap polymarket-bot-config -n polymarket-bot

# Or update file and apply
kubectl apply -f configmap.yaml

# Restart pods to pick up changes
kubectl rollout restart deployment/polymarket-bot -n polymarket-bot
```

### Update Secrets

```bash
# Delete old secret
kubectl delete secret polymarket-bot-secrets -n polymarket-bot

# Create new secret
kubectl create secret generic polymarket-bot-secrets \
    --from-env-file=.env.production \
    --namespace=polymarket-bot

# Restart deployment
kubectl rollout restart deployment/polymarket-bot -n polymarket-bot
```

### Update Docker Image

```bash
# Set new image
kubectl set image deployment/polymarket-bot \
    polymarket-bot=ghcr.io/sedarged/polymarket-bot:v1.2.3 \
    -n polymarket-bot

# Or edit deployment
kubectl edit deployment polymarket-bot -n polymarket-bot

# Check rollout status
kubectl rollout status deployment/polymarket-bot -n polymarket-bot
```

## Scaling

### Vertical Scaling (Recommended)

Update resource requests/limits in `deployment.yaml`:

```yaml
resources:
  requests:
    memory: "1Gi"
    cpu: "500m"
  limits:
    memory: "2Gi"
    cpu: "2000m"
```

Apply changes:

```bash
kubectl apply -f deployment.yaml
```

### Horizontal Scaling (NOT Recommended for Trading)

**WARNING:** Running multiple replicas can cause duplicate orders and race conditions!

Only use if you have proper coordination mechanisms in place.

```bash
# Scale manually (not recommended)
kubectl scale deployment polymarket-bot --replicas=1 -n polymarket-bot
```

## Monitoring

### Resource Usage

```bash
# Pod metrics
kubectl top pods -n polymarket-bot

# Node metrics
kubectl top nodes
```

### Pod Events

```bash
kubectl get events -n polymarket-bot --sort-by='.lastTimestamp'
```

### Describe Resources

```bash
# Describe pod
kubectl describe pod -n polymarket-bot $POD_NAME

# Describe deployment
kubectl describe deployment polymarket-bot -n polymarket-bot

# Describe service
kubectl describe svc polymarket-bot -n polymarket-bot
```

## Backup and Recovery

### Backup Persistent Data

```bash
# Create a backup pod
kubectl run -it --rm backup \
    --image=ubuntu \
    --overrides='{"spec":{"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"polymarket-bot-data"}}],"containers":[{"name":"backup","image":"ubuntu","volumeMounts":[{"name":"data","mountPath":"/data"}],"command":["tar","czf","/backup.tar.gz","/data"]}]}}' \
    -n polymarket-bot

# Or use Velero for cluster-wide backups
```

### Restore Data

```bash
# Stop deployment
kubectl scale deployment polymarket-bot --replicas=0 -n polymarket-bot

# Restore data (using appropriate method for your storage)

# Restart deployment
kubectl scale deployment polymarket-bot --replicas=1 -n polymarket-bot
```

## Troubleshooting

### Pod Not Starting

```bash
# Check pod status
kubectl get pods -n polymarket-bot

# Check events
kubectl describe pod $POD_NAME -n polymarket-bot

# Common issues:
# - ImagePullBackOff: Check image name and pull secrets
# - CrashLoopBackOff: Check logs for application errors
# - Pending: Check PVC binding and node resources
```

### Cannot Access Service

```bash
# Check service endpoints
kubectl get endpoints -n polymarket-bot

# Check service
kubectl describe svc polymarket-bot -n polymarket-bot

# Test from inside cluster
kubectl run -it --rm debug --image=busybox --restart=Never -n polymarket-bot -- wget -O- http://polymarket-bot:3000/health
```

### Persistent Volume Issues

```bash
# Check PVC status
kubectl get pvc -n polymarket-bot

# Check PV
kubectl get pv

# Describe PVC
kubectl describe pvc polymarket-bot-data -n polymarket-bot
```

### Secret Not Loading

```bash
# Check if secret exists
kubectl get secret polymarket-bot-secrets -n polymarket-bot

# View secret keys (not values)
kubectl describe secret polymarket-bot-secrets -n polymarket-bot

# Decode secret value (for debugging only)
kubectl get secret polymarket-bot-secrets -n polymarket-bot -o jsonpath='{.data.ADMIN_TOKEN}' | base64 -d
```

## Security Best Practices

1. **Use RBAC**: Minimal permissions for service account
2. **Network Policies**: Restrict pod communication
3. **Secret Management**: Use external secret managers (Vault, AWS Secrets Manager)
4. **Pod Security**: Run as non-root, read-only root filesystem where possible
5. **Resource Limits**: Prevent resource exhaustion
6. **Image Scanning**: Scan images for vulnerabilities
7. **TLS**: Use TLS for all external communication
8. **Audit Logging**: Enable Kubernetes audit logging

## Production Considerations

### High Availability

**NOT RECOMMENDED** for trading bots due to order duplication risk.

If needed:
- Use leader election pattern
- Implement distributed locking
- Share state via external database

### Disaster Recovery

- Regular backups of PVC
- Store Terraform/manifests in git
- Document recovery procedures
- Test recovery regularly

### Monitoring

- Deploy Prometheus for metrics
- Deploy Grafana for dashboards
- Set up alerts for critical metrics
- Use Loki for log aggregation

## Cleanup

### Delete All Resources

```bash
# Delete all resources in namespace
kubectl delete namespace polymarket-bot

# Or delete individually
kubectl delete -f ingress.yaml
kubectl delete -f service.yaml
kubectl delete -f deployment.yaml
kubectl delete -f pvc.yaml
kubectl delete -f configmap.yaml
kubectl delete secret polymarket-bot-secrets -n polymarket-bot
kubectl delete -f namespace.yaml
```

## Cloud Provider Specific Notes

### AWS (EKS)

```bash
# Storage class
storageClassName: gp3

# LoadBalancer annotations
service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
```

### Google Cloud (GKE)

```bash
# Storage class
storageClassName: standard-rwo

# LoadBalancer type
type: LoadBalancer
```

### Azure (AKS)

```bash
# Storage class
storageClassName: managed-premium

# LoadBalancer annotations
service.beta.kubernetes.io/azure-load-balancer-internal: "false"
```

## Related Documentation

- [Deployment Guide](../../docs/deployment-guide.md)
- [Docker Guide](../../docs/docker.md)
- [Terraform AWS EC2](../terraform/aws-ec2/README.md)
- [Security Guide](../../docs/security.md)

## Support

For issues:
- Check troubleshooting section above
- Review Kubernetes documentation
- Create GitHub issue with logs and manifests
