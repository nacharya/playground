variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (dev/staging/prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones"
  type        = number
  default     = 2
}

variable "enable_nat_gateway" {
  description = "Create NAT gateway for private subnet internet access (~$32/month)"
  type        = bool
  default     = false
}

variable "s3_suffix" {
  description = "Unique suffix for S3 bucket name (use AWS account ID)"
  type        = string
  default     = "playground"
}

variable "ecr_base_url" {
  description = "ECR registry base URL (e.g. 123456789.dkr.ecr.us-east-1.amazonaws.com)"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

variable "db_host" {
  description = "PostgreSQL host"
  type        = string
  default     = "postgres"
}

variable "db_user" {
  description = "PostgreSQL username"
  type        = string
  default     = "playground"
}

variable "db_password" {
  description = "PostgreSQL password"
  type        = string
  sensitive   = true   # Marked sensitive: won't appear in plan output
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "playground"
}

variable "nats_host" {
  description = "NATS server host"
  type        = string
  default     = "nats"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}
