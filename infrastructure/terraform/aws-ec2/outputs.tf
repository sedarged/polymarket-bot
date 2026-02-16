# Outputs for AWS EC2 deployment

output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.polymarket_bot.id
}

output "public_ip" {
  description = "Public IP address of the instance"
  value       = var.use_elastic_ip ? aws_eip.polymarket_bot[0].public_ip : aws_instance.polymarket_bot.public_ip
}

output "public_dns" {
  description = "Public DNS name of the instance"
  value       = aws_instance.polymarket_bot.public_dns
}

output "api_url" {
  description = "API endpoint URL"
  value       = "http://${var.use_elastic_ip ? aws_eip.polymarket_bot[0].public_ip : aws_instance.polymarket_bot.public_ip}:3000"
}

output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = "ssh -i ~/.ssh/id_rsa ubuntu@${var.use_elastic_ip ? aws_eip.polymarket_bot[0].public_ip : aws_instance.polymarket_bot.public_ip}"
}

output "security_group_id" {
  description = "Security group ID"
  value       = aws_security_group.polymarket_bot.id
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "iam_role_arn" {
  description = "IAM role ARN for the EC2 instance"
  value       = aws_iam_role.ec2_role.arn
}

output "data_volume_id" {
  description = "EBS data volume ID"
  value       = aws_ebs_volume.data.id
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group name"
  value       = aws_cloudwatch_log_group.polymarket_bot.name
}
