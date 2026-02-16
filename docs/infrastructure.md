# Infrastructure as Code Guide

**Purpose:** Comprehensive guide for deploying Polymarket Bot infrastructure using Infrastructure as Code (IaC).

**Addresses:** GAP-040 - Infrastructure as Code

## Overview

Infrastructure as Code (IaC) allows you to define, deploy, and manage infrastructure using declarative configuration files that can be version-controlled, tested, and reused.

## Why IaC?

### Problems with Manual Setup

- **Inconsistency:** Manual steps lead to configuration drift
- **No Audit Trail:** Changes aren't tracked
- **Slow Recovery:** Rebuilding from memory takes time
- **Human Error:** Easy to miss steps or misconfigure
- **Not Scalable:** Can't easily replicate to multiple environments

### Benefits of IaC

- ✅ **Reproducible:** Deploy identical infrastructure every time
- ✅ **Version Controlled:** Track all changes in git
- ✅ **Auditable:** See who changed what and when
- ✅ **Fast Recovery:** Rebuild infrastructure in minutes
- ✅ **Testable:** Validate before deploying
- ✅ **Documented:** Code serves as documentation

## Available Tools

The Polymarket Bot supports three IaC approaches:

### 1. Terraform (AWS EC2)

**Best for:** Production AWS deployments

**Pros:**
- Complete infrastructure provisioning
- State management
- AWS-native integrations
- Disaster recovery

**Cons:**
- AWS-specific
- Requires Terraform knowledge
- State file management

**[Full Documentation →](../infrastructure/terraform/aws-ec2/README.md)**

### 2. Kubernetes

**Best for:** Container orchestration, multi-cloud

**Pros:**
- Cloud-agnostic
- Self-healing
- Advanced deployment strategies
- Ecosystem tools

**Cons:**
- Requires Kubernetes cluster
- Higher complexity
- More expensive

**[Full Documentation →](../infrastructure/kubernetes/README.md)**

### 3. Ansible

**Best for:** VPS, bare metal, configuration management

**Pros:**
- Easy to learn
- Agentless
- Great for existing servers
- Flexible

**Cons:**
- No state management
- Less abstraction
- Manual rollback

**[Full Documentation →](../infrastructure/ansible/README.md)**

## Quick Start

### 1. Choose Your Tool

**Use Terraform if:**
- You're on AWS
- You need full infrastructure control
- You want disaster recovery built-in

**Use Kubernetes if:**
- You have/want a K8s cluster
- You need high availability
- You want cloud portability

**Use Ansible if:**
- You have existing servers
- You want simple automation
- You're comfortable with YAML

### 2. Set Up Prerequisites

**All methods require:**
```bash
# SSH key for server access
ssh-keygen -t ed25519 -C "polymarket-bot-deploy"
```

**Method-specific tools:**
```bash
# Terraform
brew install terraform  # or from https://terraform.io

# Kubernetes
brew install kubectl

# Ansible
brew install ansible  # or: pip3 install ansible
```

### 3. Configure Secrets

**NEVER commit secrets to git!**

Use appropriate secret management:

**Terraform:**
```bash
# Store in AWS Secrets Manager
aws secretsmanager create-secret \
    --name polymarket-bot/production/env \
    --secret-string file://secrets.json
```

**Kubernetes:**
```bash
# Create from env file
kubectl create secret generic polymarket-bot-secrets \
    --from-env-file=.env.production
```

**Ansible:**
```bash
# Encrypt with Ansible Vault
ansible-vault create group_vars/all/vault.yml
```

### 4. Deploy

Follow the specific guide for your chosen method:

- [Terraform Deployment →](../infrastructure/terraform/aws-ec2/README.md#deployment)
- [Kubernetes Deployment →](../infrastructure/kubernetes/README.md#quick-start)
- [Ansible Deployment →](../infrastructure/ansible/README.md#quick-start)

## Architecture Decision

### Decision Tree

```
Do you need full AWS infrastructure control?
├── YES → Use Terraform
└── NO
    └── Do you have a Kubernetes cluster?
        ├── YES → Use Kubernetes
        └── NO
            └── Do you have VPS/dedicated servers?
                ├── YES → Use Ansible
                └── NO → Get servers first or use Terraform to provision them
```

### Comparison

| Criteria | Terraform | Kubernetes | Ansible |
|----------|-----------|------------|---------|
| Infrastructure Provisioning | ✅ | ❌ | ❌ |
| Configuration Management | ⚠️ | ✅ | ✅ |
| Cost | $22-49/mo | $73+/mo | $5-15/mo |
| Complexity | Medium | High | Low |
| Cloud Lock-in | AWS only | None | None |
| Time to Deploy | 5-10 min | 2-5 min | 3-8 min |

## Best Practices

### 1. Separate Environments

Always maintain separate environments:

```
infrastructure/
├── terraform/
│   ├── staging/
│   └── production/
```

Or use workspaces/variables:

```hcl
# Terraform
environment = "production"

# Kubernetes
namespace: polymarket-bot-production

# Ansible
[production]
prod.example.com
```

### 2. Version Control Everything

```bash
# Commit infrastructure code
git add infrastructure/
git commit -m "feat: add Terraform AWS infrastructure"
git push
```

**DO commit:**
- ✅ `.tf` files
- ✅ `.yaml` manifests
- ✅ `.yml` playbooks
- ✅ `.example` files
- ✅ Documentation

**DON'T commit:**
- ❌ `.tfvars` with secrets
- ❌ `.env` files
- ❌ `terraform.tfstate`
- ❌ Private keys
- ❌ Actual `inventory` (use `.example`)

### 3. Use Remote State (Terraform)

```hcl
terraform {
  backend "s3" {
    bucket = "polymarket-bot-terraform-state"
    key    = "production/terraform.tfstate"
    region = "us-east-1"
  }
}
```

### 4. Test Before Production

Always test in staging first:

```bash
# 1. Deploy to staging
terraform apply -var="environment=staging"

# 2. Verify
curl https://staging.example.com/health

# 3. If successful, deploy to production
terraform apply -var="environment=production"
```

### 5. Document Changes

Use conventional commits:

```bash
git commit -m "feat(infra): add CloudWatch alarms"
git commit -m "fix(infra): correct security group rules"
git commit -m "docs(infra): update Terraform README"
```

## Disaster Recovery

### Backup Strategy

**Terraform:**
- State files backed up to S3
- EBS snapshots automated
- CloudWatch retention configured

**Kubernetes:**
- PVC snapshots
- Velero cluster backups
- Manifests in git

**Ansible:**
- Daily cron backups
- 7-day retention
- Offsite backup recommended

### Recovery Procedure

**Complete Infrastructure Loss:**

1. **Get latest code:**
   ```bash
   git clone <repo>
   cd infrastructure/
   ```

2. **Restore infrastructure:**
   ```bash
   # Terraform
   terraform init && terraform apply
   
   # Kubernetes
   kubectl apply -f kubernetes/
   
   # Ansible
   ansible-playbook -i inventory playbook.yml
   ```

3. **Restore data:**
   ```bash
   # From backup
   aws ec2 create-volume --snapshot-id snap-xxx
   # or restore from tar.gz backup
   ```

4. **Verify:**
   ```bash
   curl http://<instance>/health
   ```

## Monitoring and Maintenance

### Health Checks

All IaC configurations include health checks:

```bash
# Check health
curl http://<instance>:3000/health

# Check metrics
curl http://<instance>:9090/metrics
```

### Updates

**Update Docker image:**

```bash
# Terraform
terraform apply -var="docker_image=ghcr.io/.../bot:v1.2.3"

# Kubernetes
kubectl set image deployment/polymarket-bot bot=<image>:v1.2.3

# Ansible
ansible-playbook -i inventory playbook.yml -e "docker_image=..."
```

### Scaling

**Vertical scaling (recommended):**

```hcl
# Terraform - change instance type
instance_type = "t3.medium"  # was t3.small
terraform apply
```

**Horizontal scaling (NOT recommended for trading bot):**
- Risk of duplicate orders
- Use leader election if needed
- Kubernetes supports this natively but configure carefully

## Security

### Secret Management

**Development:**
```bash
# Use .env files (never commit!)
cp .env.example .env
# Edit .env
```

**Staging:**
```bash
# Use environment-specific secrets
# Kubernetes: separate namespace
# Terraform: separate tfvars
# Ansible: separate vault files
```

**Production:**
```bash
# Use external secret managers
# - AWS Secrets Manager
# - HashiCorp Vault
# - Azure Key Vault
# - Google Secret Manager
```

### Access Control

**Terraform:**
- Use IAM roles, not access keys
- Enable MFA for sensitive operations
- Rotate credentials regularly

**Kubernetes:**
- RBAC for access control
- Network policies for traffic
- Pod security policies

**Ansible:**
- SSH key authentication only
- Ansible Vault for secrets
- Sudo access auditing

### Network Security

All configurations include:
- Firewall rules (UFW, security groups)
- Minimal open ports
- TLS for external traffic
- Private subnets where possible

## Troubleshooting

### Common Issues

**Terraform:**

```bash
# State lock
terraform force-unlock <lock-id>

# State drift
terraform refresh
terraform plan

# Import existing resources
terraform import aws_instance.bot i-1234567890
```

**Kubernetes:**

```bash
# Pod not starting
kubectl describe pod <pod-name> -n polymarket-bot
kubectl logs <pod-name> -n polymarket-bot

# PVC not binding
kubectl get pvc -n polymarket-bot
kubectl describe pvc <pvc-name> -n polymarket-bot

# Service not accessible
kubectl get endpoints -n polymarket-bot
```

**Ansible:**

```bash
# Connection failures
ansible all -m ping -i inventory -vvv

# Task failures
ansible-playbook playbook.yml --check
ansible-playbook playbook.yml --step

# Vault issues
ansible-vault decrypt group_vars/all/vault.yml
```

## Cost Optimization

### AWS (Terraform)

```hcl
# Use smaller instances for staging
instance_type = "t3.micro"  # ~$7/mo

# Use Spot instances (with caution)
instance_market_options {
  market_type = "spot"
}

# Reduce storage
data_volume_size = 10  # GB
```

### Kubernetes

```bash
# Use cheaper node types
# Use cluster autoscaling
# Use resource quotas
```

### VPS (Ansible)

```bash
# Choose cost-effective providers
# - DigitalOcean: $6/mo
# - Hetzner: €4/mo
# - Vultr: $6/mo
```

## Migration Paths

### From Manual to IaC

1. Document current infrastructure
2. Choose IaC tool
3. Create equivalent configuration
4. Test in staging
5. Migrate production with backup plan

### Between IaC Tools

1. Export data from current
2. Create new configuration
3. Test thoroughly
4. Plan migration window
5. Execute with rollback ready

## Related Documentation

- [Infrastructure README](../infrastructure/README.md) - Main IaC documentation
- [Terraform Guide](../infrastructure/terraform/aws-ec2/README.md) - AWS EC2 deployment
- [Kubernetes Guide](../infrastructure/kubernetes/README.md) - K8s deployment
- [Ansible Guide](../infrastructure/ansible/README.md) - VPS configuration
- [Deployment Guide](./deployment-guide.md) - Manual deployment procedures
- [Docker Guide](./docker.md) - Container documentation

## Support

For help:
- Check tool-specific READMEs
- Review troubleshooting sections
- Create GitHub issue with logs
- Join community channels (Terraform, K8s, Ansible)

---

**Last Updated:** 2026-02-16  
**Status:** Active  
**Addresses:** GAP-040 - Infrastructure as Code
