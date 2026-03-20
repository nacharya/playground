# infra/gcp/main.tf
# ==================
# GCP infrastructure placeholder — deploys the playground stack using
# Cloud Run (serverless containers, similar to Azure Container Apps).
#
# Prerequisites:
#   gcloud auth application-default login
#   gcloud config set project <your-project-id>
#
# To deploy:
#   cd infra/gcp
#   cp terraform.tfvars.example terraform.tfvars
#   terraform init
#   terraform plan
#   terraform apply

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Uncomment to store state in GCS:
  # backend "gcs" {
  #   bucket = "your-terraform-state-bucket"
  #   prefix = "playground/gcp"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region

  # Credentials from GOOGLE_APPLICATION_CREDENTIALS env var or ADC
}

# ── Enable Required APIs ───────────────────────────────────────────────────────
# GCP APIs must be explicitly enabled before using them.
# This is GCP-specific — no equivalent in AWS/Azure.

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",           # Cloud Run
    "artifactregistry.googleapis.com", # Container Registry (replacement for GCR)
    "storage.googleapis.com",       # Cloud Storage
    "logging.googleapis.com",       # Cloud Logging
    "monitoring.googleapis.com",    # Cloud Monitoring
    "secretmanager.googleapis.com", # Secret Manager (store passwords, API keys)
  ])

  service            = each.key
  disable_on_destroy = false  # Don't disable APIs when destroying infra
}

# ── Artifact Registry ─────────────────────────────────────────────────────────
# GCP's replacement for Container Registry (GCR is deprecated).
# Push images here, reference in Cloud Run services.

resource "google_artifact_registry_repository" "main" {
  location      = var.region
  repository_id = "playground"
  format        = "DOCKER"
  description   = "Playground polyglot container images"

  depends_on = [google_project_service.apis]
}

# ── Cloud Storage Bucket ──────────────────────────────────────────────────────
# GCS is GCP's equivalent of S3. Bucket names must be globally unique.

resource "google_storage_bucket" "main" {
  name          = "playground-${var.environment}-${var.project_id}"
  location      = var.region
  force_destroy = var.environment != "prod"  # Prevent accidental deletion in prod

  versioning {
    enabled = var.environment == "prod"
  }

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"  # Cheaper storage for infrequently accessed data
    }
  }

  # Uniform bucket-level access — disables per-object ACLs (simpler security model)
  uniform_bucket_level_access = true

  depends_on = [google_project_service.apis]
}

# ── Cloud Run Services ────────────────────────────────────────────────────────
# Cloud Run = serverless containers that scale to zero when idle.
# Great for learning: you only pay for actual request handling time.

locals {
  registry_base = "${var.region}-docker.pkg.dev/${var.project_id}/playground"
}

resource "google_cloud_run_v2_service" "goffj" {
  name     = "goffj-${var.environment}"
  location = var.region

  template {
    containers {
      image = "${local.registry_base}/goffj:${var.image_tag}"

      ports {
        container_port = 8500
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }

      # Reference secrets from Secret Manager
      # env {
      #   name = "DB_PASSWORD"
      #   value_source {
      #     secret_key_ref {
      #       secret  = google_secret_manager_secret.db_password.secret_id
      #       version = "latest"
      #     }
      #   }
      # }
    }

    # Scale to zero when no traffic (cost savings for dev)
    scaling {
      min_instance_count = var.environment == "prod" ? 1 : 0
      max_instance_count = var.environment == "prod" ? 10 : 3
    }
  }

  depends_on = [google_project_service.apis]
}

# Allow unauthenticated access (remove for production auth)
resource "google_cloud_run_v2_service_iam_member" "goffj_public" {
  count = var.allow_unauthenticated ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.goffj.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# TODO: Add Cloud Run services for playui, tsnode, fsharp following the same pattern.
