#!/bin/bash
# EC2 User Data Script for Polymarket Bot
# Automated instance setup and Docker deployment

set -euo pipefail

# Logging
exec > >(tee /var/log/user-data.log)
exec 2>&1

echo "==================================="
echo "Polymarket Bot - Instance Setup"
echo "Environment: ${environment}"
echo "==================================="

# Update system
echo "Updating system packages..."
apt-get update
apt-get upgrade -y

# Install dependencies
echo "Installing dependencies..."
apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    jq \
    awscli \
    unattended-upgrades \
    debconf-utils

# Configure automatic security updates
echo "Configuring automatic security updates..."
echo "unattended-upgrades unattended-upgrades/enable_auto_updates boolean true" | debconf-set-selections
DEBIAN_FRONTEND=noninteractive dpkg-reconfigure -f noninteractive unattended-upgrades

# Install Docker from official repository with version pinning
echo "Installing Docker from official repository..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update

# Install Docker with latest stable version (no version pinning for easier updates via apt)
apt-get install -y \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

# Create polymarket user
echo "Creating polymarket user..."
useradd -m -s /bin/bash polymarket
usermod -aG docker polymarket

# Format and mount data volume
echo "Setting up data volume..."
DATA_DEVICE="${data_device}"

# Wait for the device to be available
while [ ! -e "$DATA_DEVICE" ]; do
    echo "Waiting for $DATA_DEVICE to be available..."
    sleep 5
done

# Check if volume has a filesystem
if ! blkid "$DATA_DEVICE"; then
    echo "Formatting data volume..."
    mkfs.ext4 "$DATA_DEVICE"
fi

# Create mount point and mount
mkdir -p /app/data
echo "$DATA_DEVICE /app/data ext4 defaults,nofail 0 2" >> /etc/fstab
mount -a

# Set ownership
chown -R polymarket:polymarket /app/data

# Create application directory
echo "Setting up application directory..."
mkdir -p /app
chown -R polymarket:polymarket /app

# Fetch secrets from AWS Secrets Manager
echo "Fetching secrets from AWS Secrets Manager..."
if ! aws secretsmanager get-secret-value \
    --secret-id "${secret_name}" \
    --region "${aws_region}" \
    --query SecretString \
    --output text > /app/.env.${environment} 2>&1; then
    echo "ERROR: Failed to fetch secrets from AWS Secrets Manager"
    echo "Ensure secret ${secret_name} exists in ${aws_region} and IAM role has permissions"
    echo "Create the secret with: aws secretsmanager create-secret --name ${secret_name} --secret-string file://secrets.json"
    exit 1
fi

chown polymarket:polymarket /app/.env.${environment}
chmod 600 /app/.env.${environment}

# Pull Docker image
echo "Pulling Docker image: ${docker_image}..."
docker pull ${docker_image}

# Create systemd service for the bot
echo "Creating systemd service..."
cat > /etc/systemd/system/polymarket-bot.service <<'EOF'
[Unit]
Description=Polymarket Trading Bot
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=polymarket
WorkingDirectory=/app
ExecStartPre=-/usr/bin/docker stop polymarket-bot
ExecStartPre=-/usr/bin/docker rm polymarket-bot
ExecStart=/usr/bin/docker run \
    --name polymarket-bot \
    --rm \
    -p 3000:3000 \
    -p 9090:9090 \
    --env-file /app/.env.${environment} \
    -v /app/data:/app/data \
    ${docker_image}
ExecStop=/usr/bin/docker stop polymarket-bot
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Substitute environment-specific values into the systemd service file
escaped_environment=$(printf '%s\n' "${environment}" | sed 's/[&|\\]/\\&/g')
escaped_docker_image=$(printf '%s\n' "${docker_image}" | sed 's/[&|\\]/\\&/g')
sed -i "s|\${environment}|${escaped_environment}|g" /etc/systemd/system/polymarket-bot.service
sed -i "s|\${docker_image}|${escaped_docker_image}|g" /etc/systemd/system/polymarket-bot.service

# Enable and start the service
echo "Starting Polymarket Bot service..."
systemctl daemon-reload
systemctl enable polymarket-bot
systemctl start polymarket-bot

# Install CloudWatch agent for logs
echo "Installing CloudWatch agent..."
wget -q https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
dpkg -i -E ./amazon-cloudwatch-agent.deb
rm amazon-cloudwatch-agent.deb

# Configure CloudWatch agent
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<EOF
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/user-data.log",
            "log_group_name": "/aws/ec2/polymarket-bot-${environment}",
            "log_stream_name": "{instance_id}/user-data"
          },
          {
            "file_path": "/var/log/syslog",
            "log_group_name": "/aws/ec2/polymarket-bot-${environment}",
            "log_stream_name": "{instance_id}/syslog"
          }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "PolymarketBot/${environment}",
    "metrics_collected": {
      "cpu": {
        "measurement": [
          {"name": "cpu_usage_idle", "rename": "CPU_IDLE", "unit": "Percent"},
          "cpu_usage_iowait"
        ],
        "totalcpu": false
      },
      "disk": {
        "measurement": [
          {"name": "used_percent", "rename": "DISK_USED", "unit": "Percent"}
        ],
        "resources": [
          "/", "/app/data"
        ]
      },
      "mem": {
        "measurement": [
          {"name": "mem_used_percent", "rename": "MEM_USED", "unit": "Percent"}
        ]
      }
    }
  }
}
EOF

# Start CloudWatch agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -s \
    -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

# Setup log rotation
cat > /etc/logrotate.d/polymarket-bot <<EOF
/var/log/user-data.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
EOF

# Firewall configuration
# Note: We rely on AWS Security Groups for network access control.
# UFW is not enabled here to avoid conflicting or less restrictive rules.
echo "Firewall: Using AWS Security Groups (UFW not configured)"

echo "==================================="
echo "Setup complete!"
echo "Polymarket Bot is now running"
echo "==================================="

# Wait for service to be healthy
echo "Waiting for service to be healthy..."
for i in {1..30}; do
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo "Service is healthy!"
        break
    fi
    echo "Attempt $i/30: Service not ready yet..."
    sleep 10
done

echo "Instance initialization complete"
