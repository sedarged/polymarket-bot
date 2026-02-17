# Infrastructure as Code (IaC) for Polymarket Bot

**Addresses GAP-040: Infrastructure as Code**

This directory contains Infrastructure as Code (IaC) configurations for deploying the Polymarket Trading Bot in a reproducible, version-controlled manner.

## Problem Statement

Manual infrastructure setup leads to:
- Inconsistent deployments across environments
- Hard-to-debug configuration drift
- Lack of disaster recovery capability
- No audit trail for infrastructure changes
- Difficulty scaling to multiple environments

## Solution

Declare all infrastructure as code, track it in VCS, and deploy reproducibly using industry-standard IaC tools.

## Available Deployment Options

### 1. Terraform - AWS EC2 (`terraform/aws-ec2/`)

**Best for:** Production deployments on AWS with infrastructure managed via Terraform

**Features:**
- Single AWS EC2 instance for running the trading bot
- Complete AWS infrastructure (VPC, subnets, security groups)
- EBS volume for persistent bot data
- IAM roles for AWS service integration
- CloudWatch monitoring and alarms for basic instance health
- Infrastructure versioning and state management via Terraform

**Use when:**
- You want AWS-native compute with minimal infrastructure
- You want AWS-native integrations such as CloudWatch
- You require infrastructure versioning and state management
- You plan to iterate towards more advanced infrastructure over time

**[Documentation →](terraform/aws-ec2/README.md)**

### 2. Kubernetes (`kubernetes/`)

**Best for:** Container orchestration, high availability, multi-environment

**Features:**
- Complete K8s manifests (Deployment, Service, Ingress, PVC)
- ConfigMaps and Secrets management
- Health checks and rolling updates
- Resource limits and autoscaling
- RBAC and security policies
- Works on any Kubernetes cluster (EKS, GKE, AKS, self-hosted)

**Use when:**
- You have an existing Kubernetes cluster
- You need container orchestration
- You want cloud-agnostic deployments
- You need advanced deployment strategies (canary, blue-green)

**[Documentation →](kubernetes/README.md)**

### 3. Ansible (`ansible/`)

**Best for:** VPS, bare metal, or cloud VM configuration management

**Features:**
- Automated server configuration from scratch
- Docker installation and management
- Systemd service configuration
- Security hardening (firewall, automatic updates)
- Backup automation
- Multi-environment support
- Idempotent and repeatable

**Use when:**
- You have VPS or dedicated servers
- You prefer configuration management over infrastructure provisioning
- You want to manage existing servers
- You need flexibility across cloud providers

**[Documentation →](ansible/README.md)**

## Comparison Matrix

| Feature | Terraform (AWS EC2) | Kubernetes | Ansible |
|---------|---------------------|------------|---------|
| **Infrastructure Provisioning** | ✅ Full | ⚠️ Requires cluster | ⚠️ Requires servers |
| **Configuration Management** | ⚠️ Limited | ✅ Excellent | ✅ Excellent |
| **Cloud Agnostic** | ❌ AWS only | ✅ Yes | ✅ Yes |
| **Learning Curve** | Medium | High | Low |
| **State Management** | ✅ Built-in | ✅ Built-in | ❌ Stateless |
| **Cost** | ~$22-49/mo | Varies | ~$5-15/mo |
| **High Availability** | ⚠️ Single instance | ✅ Native | ❌ Manual |
| **Deployment Speed** | 5-10 min | 2-5 min | 3-8 min |
| **Rollback** | ✅ Easy | ✅ Native | ⚠️ Manual |
| **Monitoring** | ✅ CloudWatch | ✅ Prometheus | ⚠️ External |
| **Secrets Management** | ✅ AWS Secrets Manager | ✅ K8s Secrets | ⚠️ Ansible Vault |

## Quick Start Guide

### Prerequisites

Install required tools:

```bash
# Terraform (for AWS deployment)
brew install terraform  # macOS
# or: https://www.terraform.io/downloads

# kubectl (for Kubernetes)
brew install kubectl  # macOS
# or: https://kubernetes.io/docs/tasks/tools/

# Ansible (for VPS/VM configuration)
brew install ansible  # macOS
pip3 install ansible  # Linux/macOS/Windows
```

### Choose Your Deployment Method

#### Option 1: Terraform (AWS EC2)

```bash
cd infrastructure/terraform/aws-ec2

# 1. Create terraform.tfvars
cat > terraform.tfvars <<EOF
environment      = "staging"
aws_region       = "us-east-1"
ssh_public_key   = "ssh-ed25519 AAAA... your-key"
ssh_allowed_cidr = ["YOUR.IP.HERE/32"]
EOF

# 2. Store secrets in AWS Secrets Manager
aws secretsmanager create-secret \
    --name polymarket-bot/staging/env \
    --secret-string file://secrets.json

# 3. Deploy
terraform init
terraform plan
terraform apply

# 4. Get outputs
terraform output
```

**[Full guide →](terraform/aws-ec2/README.md)**

#### Option 2: Kubernetes

```bash
cd infrastructure/kubernetes

# 1. Create namespace
kubectl apply -f namespace.yaml

# 2. Create secrets
kubectl create secret generic polymarket-bot-secrets \
    --from-env-file=.env.production \
    --namespace=polymarket-bot

# 3. Deploy
kubectl apply -f configmap.yaml
kubectl apply -f pvc.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml

# 4. Verify
kubectl get all -n polymarket-bot
```

**[Full guide →](kubernetes/README.md)**

#### Option 3: Ansible

```bash
cd infrastructure/ansible

# 1. Setup inventory
cp inventory.example inventory
vi inventory  # Add your servers

# 2. Configure secrets
ansible-vault create group_vars/all/vault.yml

# 3. Run playbook
ansible-playbook -i inventory playbook.yml

# 4. Verify
ansible all -m uri -a "url=http://localhost:3000/health" -i inventory
```

**[Full guide →](ansible/README.md)**

## Architecture Patterns

### Single Server (Terraform or Ansible)

```
┌─────────────────────────┐
│     Single Server       │
│  ┌──────────────────┐   │
│  │  Docker Container│   │
│  │  Polymarket Bot  │   │
│  └──────────────────┘   │
│                         │
│  EBS/Disk: /app/data    │
└─────────────────────────┘
```

**Pros:** Simple, cost-effective, easy to manage  
**Cons:** Single point of failure  
**Best for:** Staging, small-scale production

### Kubernetes Cluster

```
┌────────────────────────────────────┐
│       Kubernetes Cluster           │
│  ┌──────────┐     ┌──────────┐    │
│  │  Pod 1   │     │  Pod 2   │    │
│  └──────────┘     └──────────┘    │
│        │                │          │
│  ┌──────────────────────────┐     │
│  │    LoadBalancer          │     │
│  └──────────────────────────┘     │
│                                    │
│  Persistent Volume                 │
└────────────────────────────────────┘
```

**Pros:** High availability, scalable, self-healing  
**Cons:** Complex, higher cost, overkill for simple setups  
**Best for:** Large-scale production, multi-region

## Environment Management

### Staging Environment

**Purpose:** Testing and validation before production

**Configuration:**
- Smaller instance sizes
- Lower resource limits
- Paper trading mode only
- Debug logging enabled
- More frequent backups

**Example:**
```hcl
# Terraform
environment      = "staging"
instance_type    = "t3.small"
data_volume_size = 20
```

### Production Environment

**Purpose:** Live trading with real funds

**Configuration:**
- Production-grade instances
- Higher resource limits
- Live trading enabled (if configured)
- Info-level logging
- Daily backups with retention

**Example:**
```hcl
# Terraform
environment      = "production"
instance_type    = "t3.medium"
data_volume_size = 50
use_elastic_ip   = true
```

## Secret Management

### DO NOT commit secrets to git!

All deployment methods support secure secret management:

**Terraform:**
- AWS Secrets Manager (recommended)
- Environment variables (development only)
- Terraform variables (never commit .tfvars with secrets)

**Kubernetes:**
- Kubernetes Secrets
- External Secrets Operator
- Sealed Secrets
- HashiCorp Vault integration

**Ansible:**
- Ansible Vault (encrypted files)
- HashiCorp Vault
- AWS Secrets Manager

**Best practices:**
1. Never commit `.env` files
2. Use secret managers in production
3. Rotate secrets regularly
4. Audit secret access
5. Use least-privilege access

## Disaster Recovery

### Backup Strategy

All configurations include automated backups:

**Terraform:**
- Automated EBS snapshots
- CloudWatch-triggered backups
- Configurable retention

**Kubernetes:**
- PersistentVolume snapshots
- Velero for cluster-wide backups
- Git for manifest versioning

**Ansible:**
- Daily cron job backups
- Configurable retention (default: 7 days)
- Tar+gzip compression

### Recovery Procedures

#### Full Infrastructure Recovery

**Terraform:**
```bash
# 1. Checkout infrastructure code
git clone <repo>
cd infrastructure/terraform/aws-ec2

# 2. Initialize Terraform
terraform init

# 3. Apply (recreates from code)
terraform apply

# 4. Restore data from snapshot
# (Terraform can use existing snapshots)
```

**Kubernetes:**
```bash
# 1. Apply all manifests
kubectl apply -f infrastructure/kubernetes/

# 2. Restore PVC from snapshot
# (Cloud-specific procedure)
```

**Ansible:**
```bash
# 1. Run playbook on new server
ansible-playbook -i inventory playbook.yml

# 2. Restore data from backup
ssh server "tar -xzf /backup/latest.tar.gz -C /app/data"

# 3. Restart service
ansible all -m systemd -a "name=polymarket-bot state=restarted"
```

## Cost Estimation

### AWS EC2 (Terraform)

**Staging:**
- EC2 t3.small: $15/month
- EBS 20GB: $2/month
- Data transfer: $5/month
- **Total: ~$22/month**

**Production:**
- EC2 t3.medium: $30/month
- EBS 50GB: $5/month
- Elastic IP: $4/month
- Data transfer: $10/month
- **Total: ~$49/month**

### Kubernetes

Varies by provider:
- **EKS:** ~$73/month (cluster) + nodes
- **GKE:** ~$74/month (cluster) + nodes
- **AKS:** Free cluster + nodes only
- **Self-hosted:** Server costs only

### VPS (Ansible)

- **DigitalOcean:** $6-12/month
- **Linode:** $5-10/month
- **Vultr:** $6-12/month
- **Hetzner:** €4-8/month

## Monitoring and Observability

All deployments include:

### Health Checks
- HTTP health endpoints
- Liveness probes
- Readiness probes

### Metrics
- Prometheus metrics endpoint
- Resource utilization (CPU, memory, disk)
- Application-specific metrics

### Logs
- Structured logging
- Log aggregation
- Log rotation and retention

### Alerts
- CloudWatch alarms (Terraform)
- Prometheus AlertManager (Kubernetes)
- Telegram notifications (all)

## CI/CD Integration

### GitHub Actions

The project includes a deployment workflow (`.github/workflows/deploy.yml`) that can be enhanced to use IaC:

**Terraform:**
```yaml
- name: Terraform Apply
  run: |
    cd infrastructure/terraform/aws-ec2
    terraform init
    terraform apply -auto-approve
```

**Kubernetes:**
```yaml
- name: Deploy to Kubernetes
  run: |
    kubectl apply -f infrastructure/kubernetes/
```

**Ansible:**
```yaml
- name: Deploy with Ansible
  run: |
    cd infrastructure/ansible
    ansible-playbook -i inventory playbook.yml
```

## Testing Infrastructure

### Local Testing

**Terraform:**
```bash
# Dry run
terraform plan

# Validate syntax
terraform validate

# Format check
terraform fmt -check
```

**Kubernetes:**
```bash
# Dry run
kubectl apply -f . --dry-run=client

# Validate
kubectl apply -f . --validate=true --dry-run=server
```

**Ansible:**
```bash
# Check mode (dry run)
ansible-playbook -i inventory playbook.yml --check

# Syntax check
ansible-playbook playbook.yml --syntax-check
```

## Security Best Practices

1. **Principle of Least Privilege**
   - Minimal IAM permissions
   - RBAC in Kubernetes
   - Non-root containers

2. **Network Security**
   - Security groups/firewall rules
   - Network policies
   - TLS for external traffic

3. **Secret Management**
   - Never commit secrets
   - Use secret managers
   - Rotate regularly

4. **Monitoring and Auditing**
   - Enable audit logging
   - Monitor for anomalies
   - Alert on critical events

5. **Regular Updates**
   - Automated security patches
   - Container image scanning
   - Dependency updates

## Troubleshooting

### Common Issues

**Terraform:**
- State lock conflicts: `terraform force-unlock`
- State drift: `terraform refresh`
- Destroy failures: Check dependencies

**Kubernetes:**
- ImagePullBackOff: Check image name and registry auth
- CrashLoopBackOff: Check logs and resource limits
- Pending PVC: Check storage class availability

**Ansible:**
- SSH connection failures: Check keys and connectivity
- Privilege escalation: Verify sudo access
- Idempotency issues: Check task conditions

## Migration Guide

### From Manual to IaC

1. **Document current state**
   - Inventory all resources
   - Document configurations
   - Export current data

2. **Choose IaC tool** based on requirements

3. **Create IaC definitions**
   - Match current configuration
   - Add improvements

4. **Test in staging**
   - Deploy from scratch
   - Verify functionality
   - Compare with production

5. **Migrate production**
   - Plan downtime window
   - Backup everything
   - Execute migration
   - Verify and monitor

### From One IaC Tool to Another

Migrating between IaC tools (e.g., Ansible → Terraform):

1. **Export data** from current deployment
2. **Create equivalent** definitions in new tool
3. **Test thoroughly** in staging
4. **Migrate** with backup plan ready

## Related Documentation

- [Deployment Guide](../docs/deployment-guide.md) - Manual deployment procedures
- [Docker Guide](../docs/docker.md) - Docker-specific documentation
- [Security Guide](../docs/security.md) - Security best practices
- [Runbook](../docs/runbook.md) - Operational procedures

## Support and Contributing

### Getting Help

- **Documentation:** Check tool-specific READMEs
- **Issues:** Create GitHub issue with IaC logs
- **Community:** Terraform, Kubernetes, Ansible communities

### Contributing

Improvements welcome:
- Additional cloud providers (GCP, Azure)
- Alternative tools (Pulumi, CDK)
- Enhanced monitoring
- Cost optimization

## License

ISC - Same as main project

---

**Last Updated:** 2026-02-16  
**Status:** Active  
**Addresses:** GAP-040 - Infrastructure as Code
