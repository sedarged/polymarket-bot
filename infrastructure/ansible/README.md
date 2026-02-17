# Ansible Configuration for Polymarket Bot

Automated server configuration and deployment using Ansible for VPS, bare metal, or cloud VM deployments.

## Features

- **Automated Setup**: Complete server configuration from scratch
- **Security**: Firewall configuration, automatic updates, non-root user
- **Docker Management**: Install and configure Docker
- **Service Management**: Systemd service for automatic restarts
- **Monitoring**: Log rotation and health checks
- **Backup**: Automated daily backups with retention
- **Idempotent**: Safe to run multiple times
- **Environment-Specific**: Different configs for staging/production

## Prerequisites

1. **Ansible** installed on your local machine
   ```bash
   # macOS
   brew install ansible
   
   # Ubuntu/Debian
   sudo apt install ansible
   
   # Pip
   pip3 install ansible
   ```

2. **Install required Ansible collections**
   ```bash
   ansible-galaxy collection install -r requirements.yml
   ```

3. **SSH Access** to target servers with sudo privileges

4. **SSH Key** for authentication

5. **Target Server**: Ubuntu 20.04+ or Debian 11+

## Quick Start

### 1. Setup Inventory

```bash
# Copy inventory example
cp inventory.example inventory

# Edit with your servers
vi inventory
```

Example `inventory`:
```ini
[staging]
staging.example.com ansible_user=ubuntu

[production]
prod1.example.com ansible_user=ubuntu
prod2.example.com ansible_user=ubuntu

[all:vars]
ansible_ssh_private_key_file=~/.ssh/polymarket-bot-key
docker_image=ghcr.io/sedarged/polymarket-bot:latest
```

### 2. Setup SSH Known Hosts

For security, Ansible verifies SSH host keys. Add your servers to `~/.ssh/known_hosts`:

```bash
# Add server fingerprints
ssh-keyscan staging.example.com >> ~/.ssh/known_hosts
ssh-keyscan prod.example.com >> ~/.ssh/known_hosts

# Or connect manually once
ssh ubuntu@staging.example.com
```

### 3. Configure Secrets

Create `group_vars/all/vault.yml`:

```yaml
# Ansible Vault encrypted file for secrets
vault_private_key: "0x..."
vault_admin_token: "your-admin-token"
vault_telegram_bot_token: "your-telegram-token"
vault_telegram_chat_id: "your-telegram-chat-id"
```

Encrypt the file:

```bash
ansible-vault encrypt group_vars/all/vault.yml
```

### 4. Test Connection

```bash
# Test connectivity
ansible all -m ping -i inventory

# Expected output:
# staging.example.com | SUCCESS => {
#     "ping": "pong"
# }

# If you get host key verification errors, add hosts to known_hosts (see step 2)
```

### 5. Run Setup

```bash
# Setup servers (first time)
ansible-playbook -i inventory playbook.yml --tags setup

# You'll be prompted for vault password
```

### 6. Deploy Application

```bash
# Deploy the bot
ansible-playbook -i inventory playbook.yml --tags deploy
```

## Usage

### Complete Deployment (Setup + Deploy)

```bash
# Full deployment
ansible-playbook -i inventory playbook.yml

# For specific environment
ansible-playbook -i inventory playbook.yml --limit staging
ansible-playbook -i inventory playbook.yml --limit production
```

### Partial Runs

```bash
# Only setup (system configuration)
ansible-playbook -i inventory playbook.yml --tags setup

# Only deploy (update application)
ansible-playbook -i inventory playbook.yml --tags deploy

# Only update configuration
ansible-playbook -i inventory playbook.yml --tags config

# Only security configuration
ansible-playbook -i inventory playbook.yml --tags security

# Docker installation only
ansible-playbook -i inventory playbook.yml --tags docker
```

### Update Docker Image

```bash
# Update to latest version
ansible-playbook -i inventory playbook.yml --tags deploy

# Update to specific version
ansible-playbook -i inventory playbook.yml --tags deploy -e "docker_image=ghcr.io/sedarged/polymarket-bot:v1.2.3"
```

### Configuration Management

```bash
# Update environment variables
vi templates/env.j2

# Apply changes
ansible-playbook -i inventory playbook.yml --tags config

# Service will automatically restart
```

## Playbook Structure

```
infrastructure/ansible/
├── ansible.cfg                 # Ansible configuration
├── inventory.example           # Inventory template
├── playbook.yml               # Main playbook
├── templates/                 # Jinja2 templates
│   ├── env.j2                # Environment file template
│   ├── polymarket-bot.service.j2  # Systemd service template
│   └── backup.sh.j2          # Backup script template
├── group_vars/               # Group variables
│   └── all/
│       └── vault.yml         # Encrypted secrets
└── README.md                 # This file
```

## Variables

### Inventory Variables

Set in `inventory` file:

```ini
[all:vars]
ansible_user=ubuntu
ansible_ssh_private_key_file=~/.ssh/id_rsa
docker_image=ghcr.io/sedarged/polymarket-bot:latest
```

### Playbook Variables

Defined in `playbook.yml`:

- `project_name`: polymarket-bot
- `app_dir`: /app
- `data_dir`: /app/data
- `environment`: staging or production (auto-detected)

### Vault Variables

Encrypted in `group_vars/all/vault.yml`:

- `vault_private_key`: Wallet private key
- `vault_admin_token`: API admin token
- `vault_telegram_bot_token`: Telegram bot token
- `vault_telegram_chat_id`: Telegram chat ID

## Ansible Vault

### Creating Vault File

```bash
# Create encrypted file
ansible-vault create group_vars/all/vault.yml

# Edit encrypted file
ansible-vault edit group_vars/all/vault.yml

# View encrypted file
ansible-vault view group_vars/all/vault.yml

# Rekey (change password)
ansible-vault rekey group_vars/all/vault.yml
```

### Running with Vault

```bash
# Prompt for password
ansible-playbook -i inventory playbook.yml --ask-vault-pass

# Use password file
echo "your-vault-password" > .vault_pass
chmod 600 .vault_pass
ansible-playbook -i inventory playbook.yml --vault-password-file .vault_pass
```

## Verification

### Check Service Status

```bash
# Check service on all hosts
ansible all -m shell -a "systemctl status polymarket-bot" -i inventory

# Check on specific host
ansible staging -m shell -a "systemctl status polymarket-bot" -i inventory
```

### Check Application Health

```bash
# Health check
ansible all -m uri -a "url=http://localhost:3000/health" -i inventory

# Get metrics
ansible all -m uri -a "url=http://localhost:3000/metrics" -i inventory
```

### View Logs

```bash
# View service logs
ansible all -m shell -a "journalctl -u polymarket-bot -n 50" -i inventory

# View Docker logs
ansible all -m shell -a "docker logs polymarket-bot --tail 50" -i inventory
```

## Backup and Recovery

### Manual Backup

```bash
# Run backup script
ansible all -m shell -a "/usr/local/bin/polymarket-bot-backup.sh" -i inventory
```

### Restore from Backup

```bash
# 1. Stop service
ansible all -m systemd -a "name=polymarket-bot state=stopped" -i inventory

# 2. Restore data (on target server)
ssh target-server
sudo tar -xzf /backup/polymarket-bot/polymarket-bot-20240101_120000.tar.gz -C /app/data

# 3. Start service
ansible all -m systemd -a "name=polymarket-bot state=started" -i inventory
```

## Troubleshooting

### Connection Issues

```bash
# Test SSH connectivity
ssh -i ~/.ssh/polymarket-bot-key ubuntu@target-server

# Test with Ansible
ansible all -m ping -i inventory -vvv
```

### Service Not Starting

```bash
# Check service status
ansible all -m shell -a "systemctl status polymarket-bot" -i inventory

# Check logs
ansible all -m shell -a "journalctl -u polymarket-bot -n 100" -i inventory

# Check Docker
ansible all -m shell -a "docker ps -a" -i inventory
ansible all -m shell -a "docker logs polymarket-bot" -i inventory
```

### Permission Issues

```bash
# Fix ownership
ansible all -m file -a "path=/app/data owner=polymarket group=polymarket recurse=yes" -i inventory -b
```

### Firewall Issues

```bash
# Check UFW status
ansible all -m shell -a "ufw status" -i inventory

# Disable UFW (temporary for debugging)
ansible all -m ufw -a "state=disabled" -i inventory -b

# Re-enable UFW
ansible all -m ufw -a "state=enabled" -i inventory -b
```

## Advanced Usage

### Dry Run

```bash
# Check what would change
ansible-playbook -i inventory playbook.yml --check

# Check with diff
ansible-playbook -i inventory playbook.yml --check --diff
```

### Limit to Specific Hosts

```bash
# Single host
ansible-playbook -i inventory playbook.yml --limit staging.example.com

# Multiple hosts
ansible-playbook -i inventory playbook.yml --limit "host1,host2"

# Environment group
ansible-playbook -i inventory playbook.yml --limit production
```

### Custom Variables

```bash
# Override variables
ansible-playbook -i inventory playbook.yml -e "docker_image=ghcr.io/sedarged/polymarket-bot:v1.2.3"

# Multiple variables
ansible-playbook -i inventory playbook.yml -e "docker_image=... app_dir=/custom/path"
```

### Parallel Execution

```bash
# Run on 5 hosts in parallel
ansible-playbook -i inventory playbook.yml -f 5

# Run on all hosts in parallel
ansible-playbook -i inventory playbook.yml -f 10
```

## Monitoring

### Ad-hoc Commands

```bash
# Disk usage
ansible all -m shell -a "df -h /app/data" -i inventory

# Memory usage
ansible all -m shell -a "free -h" -i inventory

# CPU load
ansible all -m shell -a "uptime" -i inventory

# Docker stats
ansible all -m shell -a "docker stats --no-stream polymarket-bot" -i inventory
```

### Gather Facts

```bash
# Collect system information
ansible all -m setup -i inventory

# Filter facts
ansible all -m setup -a "filter=ansible_distribution*" -i inventory
```

## Security Best Practices

1. **Use Ansible Vault** for all secrets
2. **SSH Key Authentication** - no password auth
3. **Limit SSH Access** - use specific IPs in UFW
4. **Regular Updates** - automated security patches enabled
5. **Non-root User** - service runs as polymarket user
6. **Firewall** - UFW configured automatically
7. **Log Rotation** - automated log cleanup
8. **Backup Encryption** - consider encrypting backups

## Cleanup

### Remove Application

```bash
# Stop and disable service
ansible all -m systemd -a "name=polymarket-bot state=stopped enabled=no" -i inventory -b

# Remove container
ansible all -m shell -a "docker rm -f polymarket-bot" -i inventory

# Remove service file
ansible all -m file -a "path=/etc/systemd/system/polymarket-bot.service state=absent" -i inventory -b

# Remove application directory (WARNING: deletes data!)
ansible all -m file -a "path=/app state=absent" -i inventory -b
```

## Related Documentation

- [Terraform AWS EC2](../terraform/aws-ec2/README.md)
- [Kubernetes Deployment](../kubernetes/README.md)
- [Deployment Guide](../../docs/deployment-guide.md)
- [Docker Guide](../../docs/docker.md)

## Support

For issues:
- Check Ansible documentation: https://docs.ansible.com
- Review troubleshooting section above
- Create GitHub issue with playbook output
