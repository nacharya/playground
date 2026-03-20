variable "name" {
  description = "Name prefix for the S3 bucket"
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

variable "suffix" {
  description = "Unique suffix to ensure globally unique bucket name (e.g. AWS account ID or random string)"
  type        = string
  default     = "playground"
}

variable "enable_versioning" {
  description = "Enable S3 object versioning (recommended for production)"
  type        = bool
  default     = false
}

variable "enable_lifecycle" {
  description = "Enable lifecycle rules to transition objects to Glacier and expire after 365 days"
  type        = bool
  default     = false
}
