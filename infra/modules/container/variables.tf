variable "name" {
  description = "Service name (e.g. 'goffj', 'playui')"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev/staging/prod)"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "image" {
  description = "Docker image URI (e.g. 123456789.dkr.ecr.us-east-1.amazonaws.com/goffj:latest)"
  type        = string
}

variable "cpu" {
  description = "Fargate CPU units (256=0.25vCPU, 512=0.5vCPU, 1024=1vCPU)"
  type        = number
  default     = 256
}

variable "memory" {
  description = "Fargate memory in MiB (must be compatible with cpu setting)"
  type        = number
  default     = 512
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
}

variable "desired_count" {
  description = "Number of task replicas to run"
  type        = number
  default     = 1
}

variable "vpc_id" {
  description = "VPC ID where the service runs"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs (use private subnets)"
  type        = list(string)
}

variable "cluster_arn" {
  description = "ARN of the ECS cluster"
  type        = string
}

variable "target_group_arn" {
  description = "ALB target group ARN (null to skip load balancer registration)"
  type        = string
  default     = null
}

variable "environment_vars" {
  description = "Map of environment variable name → value (plaintext)"
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Map of env var name → SSM Parameter Store or Secrets Manager ARN"
  type        = map(string)
  default     = {}
}

variable "health_check_command" {
  description = "Shell command for container health check (e.g. 'curl -f http://localhost:8500/health || exit 1')"
  type        = string
  default     = null
}

variable "log_retention_days" {
  description = "CloudWatch log retention period in days"
  type        = number
  default     = 7
}
