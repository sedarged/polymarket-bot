# Terraform - AWS EC2 Deployment

This Terraform configuration deploys the Polymarket Trading Bot on AWS EC2 with a complete infrastructure setup including VPC, security groups, IAM roles, and monitoring.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                         VPC                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Public Subnet                        │  │
│  │  ┌──────────────────────────────────────────┐     │  │
│  │  │         EC2 Instance                     │     │  │
│  │  │  ┌────────────────────────────────┐      │     │  │
│  │  │  │   Docker Container             │      │     │  │
│  │  │  │   Polymarket Bot               │      │     │  │
│  │  │  └────────────────────────────────┘      │     │  │
│  │  │                                          │     │  │
│  │  │  EBS Volume (/app/data)                  │     │  │
│  │  └──────────────────────────────────────────┘     │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  Internet Gateway                                        │
└─────────────────────────────────────────────────────────┘
           │
           │ Internet
           ▼
```

## Features

- **VPC**: Dedicated VPC with public subnet
- **EC2 Instance**: t3.small (2 vCPU, 2GB RAM) by default
- **Security**: Security groups, encrypted EBS, IMDSv2, non-root container
- **Persistence**: Separate EBS volume for data
- **Monitoring**: CloudWatch alarms for CPU and health
- **Secrets**: IAM role for AWS Secrets Manager access
- **Automation**: User data script for complete setup
- **High Availability**: Optional Elastic IP for stable addressing

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **Terraform** >= 1.0 installed
3. **AWS CLI** configured with credentials
4. **SSH Key Pair** generated

## Setup

### 1. Generate SSH Key

```bash
# Generate SSH key pair
ssh-keygen -t ed25519 -C "polymarket-bot-deploy" -f ~/.ssh/polymarket-bot-key

# Get public key
cat ~/.ssh/polymarket-bot-key.pub
```

### 2. Store Secrets in AWS Secrets Manager

```bash
# Create secrets file
cat > secrets.json <<EOF
{
  "PRIVATE_KEY": "0x...",
  "ADMIN_TOKEN": "...",
  "LIVE_TRADING": "false",
  "COMPLIANCE_ACCEPTED": "false",
  "TELEGRAM_BOT_TOKEN": "...",
  "TELEGRAM_CHAT_ID": "..."
}
EOF

# Store in Secrets Manager (staging)
aws secretsmanager create-secret \
    --name polymarket-bot/staging/env \
    --description "Polymarket Bot staging environment variables" \
    --secret-string file://secrets.json \
    --region us-east-1

# Store in Secrets Manager (production)
aws secretsmanager create-secret \
    --name polymarket-bot/production/env \
    --description "Polymarket Bot production environment variables" \
    --secret-string file://secrets.json \
    --region us-east-1

# Clean up
rm secrets.json
```

### 3. Create Terraform Variables File

```bash
# Create terraform.tfvars
cat > terraform.tfvars <<EOF
environment      = "staging"
aws_region       = "us-east-1"
ssh_public_key   = "ssh-ed25519 AAAA... your-key-comment"
instance_type    = "t3.small"

# Security: Restrict SSH to your IP
ssh_allowed_cidr = ["YOUR.IP.ADDRESS.HERE/32"]

# Admin API access: restrict to your IP or VPN (or use SSH tunneling)
api_allowed_cidr = ["YOUR.IP.ADDRESS.HERE/32"]

# Docker image
docker_image     = "ghcr.io/sedarged/polymarket-bot:latest"

# Optional: SNS for alarms
# sns_topic_arn = "arn:aws:sns:us-east-1:123456789:polymarket-alerts"
EOF
```

## Deployment

### Initialize Terraform

```bash
terraform init
```

### Plan Deployment

```bash
# Review what will be created
terraform plan
```

### Apply Configuration

```bash
# Deploy infrastructure
terraform apply

# Review the plan and type 'yes' to confirm
```

### Get Outputs

```bash
# View all outputs
terraform output

# Get specific output
terraform output public_ip
terraform output api_url
terraform output ssh_command
```

## Accessing the Instance

### SSH Access

```bash
# Get SSH command from outputs
terraform output -raw ssh_command

# Or manually
ssh -i ~/.ssh/polymarket-bot-key ubuntu@<PUBLIC_IP>
```

### Check Service Status

```bash
# SSH into instance
ssh -i ~/.ssh/polymarket-bot-key ubuntu@<PUBLIC_IP>

# Check Docker container
sudo docker ps

# Check service status
sudo systemctl status polymarket-bot

# View logs
sudo journalctl -u polymarket-bot -f
sudo docker logs polymarket-bot
```

### Access API

```bash
# Get API URL
API_URL=$(terraform output -raw api_url)

# Health check
curl $API_URL/health

# Metrics
curl $API_URL/metrics
```

## Configuration

### Environment-Specific Configurations

**Staging:**
```hcl
environment      = "staging"
instance_type    = "t3.small"
use_elastic_ip   = false
data_volume_size = 20
```

**Production:**
```hcl
environment      = "production"
instance_type    = "t3.medium"
use_elastic_ip   = true
data_volume_size = 50
ssh_allowed_cidr = ["YOUR_OFFICE_IP/32"]
```

### Scaling Instance Size

To change instance type:

```bash
# Edit terraform.tfvars
instance_type = "t3.medium"  # 2 vCPU, 4GB RAM

# Apply changes
terraform apply
```

Instance will be recreated with new size.

## Updating the Application

### Deploy New Docker Image

```bash
# SSH into instance
ssh -i ~/.ssh/polymarket-bot-key ubuntu@<PUBLIC_IP>

# Pull new image
sudo docker pull ghcr.io/sedarged/polymarket-bot:latest

# Restart service (will pull and deploy new version)
sudo systemctl restart polymarket-bot

# Verify
sudo docker logs -f polymarket-bot
```

### Update via Terraform

```bash
# Update docker_image in terraform.tfvars
docker_image = "ghcr.io/sedarged/polymarket-bot:v1.2.3"

# Apply
terraform apply
```

This will trigger a new deployment through user-data.

## Monitoring

### CloudWatch Alarms

Alarms are created for:
- High CPU usage (>80% for 10 minutes)
- Instance health check failures

### View Logs

```bash
# CloudWatch log groups
aws logs tail /aws/ec2/polymarket-bot-staging --follow

# Or via AWS Console
# CloudWatch > Log Groups > /aws/ec2/polymarket-bot-staging
```

### Metrics

Access Prometheus metrics:
```bash
curl http://<PUBLIC_IP>:9090/metrics
```

## Backup and Recovery

### Backup Data Volume

```bash
# Create snapshot
aws ec2 create-snapshot \
    --volume-id $(terraform output -raw data_volume_id) \
    --description "Polymarket Bot data backup $(date +%Y-%m-%d)" \
    --tag-specifications 'ResourceType=snapshot,Tags=[{Key=Name,Value=polymarket-bot-backup}]'
```

### Restore from Snapshot

```bash
# Create volume from snapshot
aws ec2 create-volume \
    --snapshot-id snap-1234567890abcdef \
    --availability-zone us-east-1a \
    --volume-type gp3

# Update Terraform state or manually attach
```

## Disaster Recovery

### Complete Environment Recreation

```bash
# 1. Backup data (create EBS snapshot)
aws ec2 create-snapshot --volume-id <VOLUME_ID>

# 2. Destroy infrastructure
terraform destroy

# 3. Restore from snapshot
# Edit main.tf to use existing snapshot

# 4. Redeploy
terraform apply
```

## Troubleshooting

### Instance Not Starting

```bash
# Check user data logs
ssh -i ~/.ssh/polymarket-bot-key ubuntu@<PUBLIC_IP>
sudo cat /var/log/user-data.log

# Check cloud-init logs
sudo cat /var/log/cloud-init-output.log
```

### Service Not Running

```bash
# Check systemd service
sudo systemctl status polymarket-bot

# View service logs
sudo journalctl -u polymarket-bot -n 50

# Check Docker
sudo docker ps -a
sudo docker logs polymarket-bot
```

### Cannot Access API

```bash
# Check security group rules
aws ec2 describe-security-groups \
    --group-ids $(terraform output -raw security_group_id)

# Check if service is listening
ssh -i ~/.ssh/polymarket-bot-key ubuntu@<PUBLIC_IP>
sudo netstat -tulpn | grep 3000
curl http://localhost:3000/health
```

### Secrets Not Loading

```bash
# Verify IAM permissions
aws iam get-role-policy \
    --role-name polymarket-bot-staging-ec2-role \
    --policy-name secrets-manager-access

# Test secret access from instance
aws secretsmanager get-secret-value \
    --secret-id polymarket-bot/staging/env \
    --region us-east-1
```

## Cost Estimation

**Staging Environment (t3.small):**
- EC2 Instance: ~$15/month
- EBS Volume (20GB): ~$2/month
- Data Transfer: ~$5/month
- **Total: ~$22/month**

**Production Environment (t3.medium):**
- EC2 Instance: ~$30/month
- EBS Volume (50GB): ~$5/month
- Elastic IP: ~$4/month
- Data Transfer: ~$10/month
- **Total: ~$49/month**

## Cleanup

### Destroy Infrastructure

```bash
# WARNING: This will delete all resources including data!
# Backup first!

# Create snapshot before destroying
aws ec2 create-snapshot \
    --volume-id $(terraform output -raw data_volume_id) \
    --description "Final backup before destroy"

# Destroy
terraform destroy

# Type 'yes' to confirm
```

## Security Best Practices

1. **Restrict SSH Access**: Use specific IP ranges, not 0.0.0.0/0
2. **Use Secrets Manager**: Never hardcode secrets
3. **Enable IMDSv2**: Already configured in this setup
4. **Encrypt EBS Volumes**: Already enabled
5. **Regular Updates**: Enable unattended-upgrades (already configured)
6. **Rotate Keys**: Rotate SSH keys and secrets regularly
7. **Monitor Logs**: Set up CloudWatch alerts
8. **Backup Data**: Regular EBS snapshots

## Advanced Configuration

### Remote State Backend

Edit `main.tf` to enable S3 backend:

```hcl
terraform {
  backend "s3" {
    bucket         = "polymarket-bot-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "polymarket-bot-terraform-locks"
  }
}
```

Create the backend:

```bash
# Create S3 bucket
aws s3 mb s3://polymarket-bot-terraform-state --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
    --bucket polymarket-bot-terraform-state \
    --versioning-configuration Status=Enabled

# Create DynamoDB table for locks
aws dynamodb create-table \
    --table-name polymarket-bot-terraform-locks \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST
```

## Related Documentation

- [Deployment Guide](../../../docs/deployment-guide.md)
- [Docker Guide](../../../docs/docker.md)
- [Security Guide](../../../docs/security.md)
- [Runbook](../../../docs/runbook.md)

## Support

For issues or questions:
- Create GitHub issue
- Check troubleshooting guide above
- Review CloudWatch logs
