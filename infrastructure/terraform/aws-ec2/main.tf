# Polymarket Bot - AWS EC2 Infrastructure
# Terraform configuration for single-server deployment on AWS EC2
# Addresses GAP-040: Infrastructure as Code

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  # Optional: Configure S3 backend for remote state
  # backend "s3" {
  #   bucket         = "polymarket-bot-terraform-state"
  #   key            = "production/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "polymarket-bot-terraform-locks"
  # }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "polymarket-bot"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Data sources
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

data "aws_caller_identity" "current" {}

# VPC
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.project_name}-${var.environment}-vpc"
  }
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-${var.environment}-igw"
  }
}

# Public Subnet
resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-${var.environment}-public-subnet"
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

# Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-public-rt"
  }
}

# Route Table Association
resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# Security Group
resource "aws_security_group" "polymarket_bot" {
  name_prefix = "${var.project_name}-${var.environment}-"
  description = "Security group for Polymarket Bot EC2 instance"
  vpc_id      = aws_vpc.main.id

  # SSH access (restrict to your IP in production)
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_allowed_cidr
  }

  # HTTP for API
  ingress {
    description = "HTTP API"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = var.api_allowed_cidr
  }

  # Metrics endpoint
  ingress {
    description = "Prometheus Metrics"
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    cidr_blocks = var.metrics_allowed_cidr
  }

  # Outbound internet access
  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-sg"
  }
}

# SSH Key Pair
resource "aws_key_pair" "deployer" {
  key_name   = "${var.project_name}-${var.environment}-deployer"
  public_key = var.ssh_public_key

  tags = {
    Name = "${var.project_name}-${var.environment}-key"
  }
}

# IAM Role for EC2 (for accessing Secrets Manager)
resource "aws_iam_role" "ec2_role" {
  name = "${var.project_name}-${var.environment}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-ec2-role"
  }
}

# IAM Policy for Secrets Manager access
resource "aws_iam_role_policy" "secrets_manager" {
  name = "secrets-manager-access"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.project_name}/${var.environment}/*"
      }
    ]
  })
}

# IAM Policy for CloudWatch logs and metrics (for CloudWatch Agent)
resource "aws_iam_role_policy" "cloudwatch" {
  name = "cloudwatch-access"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "*"
      }
    ]
  })
}

# IAM Instance Profile
resource "aws_iam_instance_profile" "ec2_profile" {
  name = "${var.project_name}-${var.environment}-ec2-profile"
  role = aws_iam_role.ec2_role.name
}

# EBS Volume for persistent data
resource "aws_ebs_volume" "data" {
  availability_zone = data.aws_availability_zones.available.names[0]
  size              = var.data_volume_size
  type              = "gp3"
  encrypted         = true

  tags = {
    Name = "${var.project_name}-${var.environment}-data"
  }
}

# EC2 Instance
resource "aws_instance" "polymarket_bot" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.deployer.key_name
  vpc_security_group_ids = [aws_security_group.polymarket_bot.id]
  subnet_id              = aws_subnet.public.id
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name

  root_block_device {
    volume_size           = 30
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  user_data = templatefile("${path.module}/user-data.sh", {
    environment      = var.environment
    docker_image     = var.docker_image
    data_device      = "/dev/xvdf"
    aws_region       = var.aws_region
    secret_name      = "${var.project_name}/${var.environment}/env"
  })

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-instance"
  }

  lifecycle {
    ignore_changes = [ami]
  }
}

# Attach EBS volume
resource "aws_volume_attachment" "data" {
  device_name = "/dev/xvdf"
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.polymarket_bot.id
}

# Elastic IP (optional, for stable public IP)
resource "aws_eip" "polymarket_bot" {
  count    = var.use_elastic_ip ? 1 : 0
  instance = aws_instance.polymarket_bot.id
  domain   = "vpc"

  tags = {
    Name = "${var.project_name}-${var.environment}-eip"
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "polymarket_bot" {
  name              = "/aws/ec2/${var.project_name}-${var.environment}"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.project_name}-${var.environment}-logs"
  }
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "high_cpu" {
  alarm_name          = "${var.project_name}-${var.environment}-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors ec2 cpu utilization"
  alarm_actions       = var.sns_topic_arn != "" ? [var.sns_topic_arn] : []

  dimensions = {
    InstanceId = aws_instance.polymarket_bot.id
  }
}

resource "aws_cloudwatch_metric_alarm" "instance_health" {
  alarm_name          = "${var.project_name}-${var.environment}-instance-health"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = "60"
  statistic           = "Average"
  threshold           = "0"
  alarm_description   = "This metric monitors ec2 instance health"
  alarm_actions       = var.sns_topic_arn != "" ? [var.sns_topic_arn] : []

  dimensions = {
    InstanceId = aws_instance.polymarket_bot.id
  }
}
