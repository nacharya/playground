# infra/aws/main.tf
# =================
# Root AWS configuration — wires the networking, storage, and container modules
# together into a deployable playground environment.
#
# To deploy:
#   cd infra/aws
#   cp terraform.tfvars.example terraform.tfvars   # fill in values
#   terraform init
#   terraform plan
#   terraform apply

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment to store state in S3 (recommended for teams):
  # backend "s3" {
  #   bucket         = "your-terraform-state-bucket"
  #   key            = "playground/aws/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-state-lock"
  # }
}

provider "aws" {
  region = var.aws_region

  # Optional: assume a role for cross-account deployments
  # assume_role {
  #   role_arn = "arn:aws:iam::123456789:role/TerraformDeployRole"
  # }

  default_tags {
    tags = {
      Project     = "playground"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ── Networking ────────────────────────────────────────────────────────────────

module "network" {
  source = "../modules/networking"

  name               = "playground"
  cidr_block         = var.vpc_cidr
  az_count           = var.az_count
  environment        = var.environment
  enable_nat_gateway = var.enable_nat_gateway
}

# ── Storage ───────────────────────────────────────────────────────────────────

module "storage" {
  source = "../modules/storage"

  name              = "playground"
  environment       = var.environment
  suffix            = var.s3_suffix
  enable_versioning = var.environment == "prod"   # Auto-enable versioning in prod
  enable_lifecycle  = var.environment == "prod"
}

# ── ECS Cluster ───────────────────────────────────────────────────────────────
# One cluster hosts multiple services. Fargate manages capacity automatically.

resource "aws_ecs_cluster" "main" {
  name = "playground-${var.environment}"

  # Enable Container Insights for CloudWatch metrics per service
  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "playground-${var.environment}-cluster"
  }
}

# ── Services ──────────────────────────────────────────────────────────────────
# Each language service gets its own ECS service.
# Images are pulled from ECR — push them first with:
#   aws ecr get-login-password | docker login --username AWS --password-stdin <ecr_url>
#   docker tag goffj:latest <ecr_url>/goffj:latest
#   docker push <ecr_url>/goffj:latest

module "goffj" {
  source = "../modules/container"

  name           = "goffj"
  environment    = var.environment
  image          = "${var.ecr_base_url}/goffj:${var.image_tag}"
  cpu            = 256
  memory         = 512
  container_port = 8500
  desired_count  = var.environment == "prod" ? 2 : 1

  vpc_id      = module.network.vpc_id
  subnet_ids  = module.network.private_subnet_ids
  cluster_arn = aws_ecs_cluster.main.arn

  environment_vars = {
    ENVIRONMENT  = var.environment
    POSTGRES_DSN = "postgres://${var.db_user}:${var.db_password}@${var.db_host}:5432/${var.db_name}"
    NATS_URL     = "nats://${var.nats_host}:4222"
  }

  health_check_command = "curl -f http://localhost:8500/health || exit 1"
  log_retention_days   = var.log_retention_days
}

module "playui" {
  source = "../modules/container"

  name           = "playui"
  environment    = var.environment
  image          = "${var.ecr_base_url}/playui:${var.image_tag}"
  cpu            = 512    # Python ML workloads need more CPU
  memory         = 1024
  container_port = 8504
  desired_count  = 1

  vpc_id      = module.network.vpc_id
  subnet_ids  = module.network.private_subnet_ids
  cluster_arn = aws_ecs_cluster.main.arn

  environment_vars = {
    ENVIRONMENT = var.environment
    GOFFJ_URL   = "http://goffj.${var.environment}.local:8500"
  }

  health_check_command = "curl -f http://localhost:8504/_stcore/health || exit 1"
  log_retention_days   = var.log_retention_days
}

module "tsnode" {
  source = "../modules/container"

  name           = "tsnode"
  environment    = var.environment
  image          = "${var.ecr_base_url}/tsnode:${var.image_tag}"
  cpu            = 256
  memory         = 512
  container_port = 8506
  desired_count  = var.environment == "prod" ? 2 : 1

  vpc_id      = module.network.vpc_id
  subnet_ids  = module.network.private_subnet_ids
  cluster_arn = aws_ecs_cluster.main.arn

  environment_vars = {
    ENVIRONMENT = var.environment
    NODE_ENV    = var.environment == "prod" ? "production" : "development"
  }

  health_check_command = "wget -qO- http://localhost:8506/health || exit 1"
  log_retention_days   = var.log_retention_days
}

module "fsharp" {
  source = "../modules/container"

  name           = "fsharp"
  environment    = var.environment
  image          = "${var.ecr_base_url}/fsharp:${var.image_tag}"
  cpu            = 512
  memory         = 512
  container_port = 8508
  desired_count  = 1

  vpc_id      = module.network.vpc_id
  subnet_ids  = module.network.private_subnet_ids
  cluster_arn = aws_ecs_cluster.main.arn

  environment_vars = {
    ENVIRONMENT = var.environment
    ASPNETCORE_ENVIRONMENT = var.environment == "prod" ? "Production" : "Development"
  }

  health_check_command = "curl -f http://localhost:8508/health || exit 1"
  log_retention_days   = var.log_retention_days
}
