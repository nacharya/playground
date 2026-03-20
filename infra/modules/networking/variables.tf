variable "name" {
  description = "Name prefix applied to all resources created by this module"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.name))
    error_message = "Name must be lowercase alphanumeric with hyphens only."
  }
}

variable "cidr_block" {
  description = "CIDR block for the VPC (e.g., '10.0.0.0/16')"
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.cidr_block, 0))
    error_message = "cidr_block must be a valid CIDR notation (e.g., 10.0.0.0/16)."
  }
}

variable "az_count" {
  description = "Number of availability zones to use. Must be ≥ 1."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 1 && var.az_count <= 6
    error_message = "az_count must be between 1 and 6."
  }
}

variable "environment" {
  description = "Deployment environment name (dev/staging/prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "enable_nat_gateway" {
  description = "Whether to create a NAT gateway for private subnet internet access. Costs ~$32/month."
  type        = bool
  default     = false  # Off by default to keep learning costs low
}
