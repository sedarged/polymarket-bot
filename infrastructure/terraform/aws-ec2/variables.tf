# Variables for AWS EC2 deployment

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be 'staging' or 'production'."
  }
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "polymarket-bot"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR block for public subnet"
  type        = string
  default     = "10.0.1.0/24"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.small" # 2 vCPU, 2GB RAM
}

variable "ssh_public_key" {
  description = "Public SSH key for EC2 access"
  type        = string
}

variable "ssh_allowed_cidr" {
  description = "CIDR blocks allowed to SSH into the instance. Default restricts to VPC-only for security."
  type        = list(string)
  default     = ["10.0.0.0/16"] # VPC/internal-only by default; override explicitly if SSH from internet is required
  
  validation {
    condition     = alltrue([for cidr in var.ssh_allowed_cidr : cidr != "CHANGE_ME"])
    error_message = "ssh_allowed_cidr contains 'CHANGE_ME' placeholder. Please replace with actual CIDR blocks (e.g., [\"YOUR.IP.ADDRESS/32\"])."
  }
}

variable "api_allowed_cidr" {
  description = "CIDR blocks allowed to access the API. Default restricts to VPC-only for security."
  type        = list(string)
  default     = ["10.0.0.0/16"] # VPC/internal-only by default; override explicitly for public API access
  
  validation {
    condition     = alltrue([for cidr in var.api_allowed_cidr : cidr != "CHANGE_ME"])
    error_message = "api_allowed_cidr contains 'CHANGE_ME' placeholder. Please replace with actual CIDR blocks (e.g., [\"YOUR.IP.ADDRESS/32\"])."
  }
}

variable "metrics_allowed_cidr" {
  description = "CIDR blocks allowed to access metrics endpoint"
  type        = list(string)
  default     = ["10.0.0.0/16"] # Only from within VPC by default
}

variable "docker_image" {
  description = "Docker image to deploy"
  type        = string
  default     = "ghcr.io/sedarged/polymarket-bot:latest"
}

variable "data_volume_size" {
  description = "Size of EBS volume for persistent data (GB)"
  type        = number
  default     = 20
}

variable "use_elastic_ip" {
  description = "Whether to use Elastic IP for stable public IP"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention period in days"
  type        = number
  default     = 30
}

variable "sns_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarms (optional)"
  type        = string
  default     = ""
}
