# modules/storage/main.tf
# =======================
# Reusable storage module — S3 bucket with versioning, encryption, and lifecycle rules.
#
# Usage:
#   module "storage" {
#     source      = "../modules/storage"
#     name        = "playground"
#     environment = "dev"
#   }

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  common_tags = {
    Name        = var.name
    Environment = var.environment
    ManagedBy   = "terraform"
    Module      = "storage"
  }

  # Bucket names must be globally unique — prefix with a namespace
  bucket_name = "${var.name}-${var.environment}-${var.suffix}"
}

# ── S3 Bucket ─────────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "main" {
  bucket = local.bucket_name

  # prevent_destroy lifecycle prevents accidental deletion of data buckets
  # Uncomment for production:
  # lifecycle {
  #   prevent_destroy = true
  # }

  tags = local.common_tags
}

# ── Versioning ─────────────────────────────────────────────────────────────────
# Versioning keeps all versions of every object — enables recovery from
# accidental deletes or overwrites.

resource "aws_s3_bucket_versioning" "main" {
  bucket = aws_s3_bucket.main.id

  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Suspended"
  }
}

# ── Encryption ─────────────────────────────────────────────────────────────────
# Server-side encryption with AWS-managed keys (SSE-S3).
# For stricter control use SSE-KMS with a customer-managed key.

resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  bucket = aws_s3_bucket.main.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"   # SSE-S3; change to "aws:kms" for KMS
    }
    bucket_key_enabled = true    # Reduces KMS request costs by 99% when using KMS
  }
}

# ── Block Public Access ────────────────────────────────────────────────────────
# These four settings ensure no object can ever be made public,
# regardless of bucket or object ACLs.

resource "aws_s3_bucket_public_access_block" "main" {
  bucket = aws_s3_bucket.main.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Lifecycle Rules ────────────────────────────────────────────────────────────
# Lifecycle rules automatically transition or expire objects.
# This saves cost: Glacier is ~$0.004/GB vs S3 Standard ~$0.023/GB.

resource "aws_s3_bucket_lifecycle_configuration" "main" {
  count  = var.enable_lifecycle ? 1 : 0
  bucket = aws_s3_bucket.main.id

  rule {
    id     = "transition-to-glacier"
    status = "Enabled"

    # Move objects to Glacier after 90 days
    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    # Delete objects after 365 days
    expiration {
      days = 365
    }

    # Clean up incomplete multipart uploads after 7 days
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # Expire old versions if versioning is on
  dynamic "rule" {
    for_each = var.enable_versioning ? [1] : []

    content {
      id     = "expire-old-versions"
      status = "Enabled"

      noncurrent_version_expiration {
        noncurrent_days = 90
      }
    }
  }
}
