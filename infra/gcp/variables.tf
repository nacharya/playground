variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region (e.g. us-central1, us-east1, europe-west1)"
  type        = string
  default     = "us-central1"
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

variable "image_tag" {
  description = "Container image tag to deploy"
  type        = string
  default     = "latest"
}

variable "allow_unauthenticated" {
  description = "Allow public (unauthenticated) access to Cloud Run services"
  type        = bool
  default     = true   # Set false in production; use IAP or Identity Token instead
}
