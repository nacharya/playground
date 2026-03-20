# infra/azure/main.tf
# ====================
# Azure infrastructure placeholder — deploys the playground stack using
# Azure Container Apps (serverless containers, similar to Fargate).
#
# Prerequisites:
#   az login
#   az account set --subscription <your-subscription-id>
#
# To deploy:
#   cd infra/azure
#   cp terraform.tfvars.example terraform.tfvars
#   terraform init
#   terraform plan
#   terraform apply

terraform {
  required_version = ">= 1.5"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }

  # Uncomment to store state in Azure Blob Storage:
  # backend "azurerm" {
  #   resource_group_name  = "terraform-state-rg"
  #   storage_account_name = "terraformstate12345"
  #   container_name       = "tfstate"
  #   key                  = "playground/azure/terraform.tfstate"
  # }
}

provider "azurerm" {
  features {}

  subscription_id = var.subscription_id
  tenant_id       = var.tenant_id
  client_id       = var.client_id
  client_secret   = var.client_secret
}

# ── Resource Group ────────────────────────────────────────────────────────────
# Resource Group = logical container for all Azure resources in this deployment.
# Everything lives in one RG for easy lifecycle management (delete RG = delete all).

resource "azurerm_resource_group" "main" {
  name     = "playground-${var.environment}-rg"
  location = var.location

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# ── Container Registry (ACR) ──────────────────────────────────────────────────
# ACR is Azure's equivalent of ECR. Push images here, reference in Container Apps.

resource "azurerm_container_registry" "main" {
  name                = "playground${var.environment}acr"  # Must be globally unique, alphanumeric
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"   # Basic: 10GB storage. Standard/Premium add geo-replication
  admin_enabled       = true

  tags = azurerm_resource_group.main.tags
}

# ── Container Apps Environment ────────────────────────────────────────────────
# Container Apps Environment = shared runtime for multiple Container Apps.
# Like an ECS Cluster — defines the network boundary and logging destination.

resource "azurerm_log_analytics_workspace" "main" {
  name                = "playground-${var.environment}-logs"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "PerGB2018"
  retention_in_days   = var.log_retention_days
}

resource "azurerm_container_app_environment" "main" {
  name                       = "playground-${var.environment}-env"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
}

# ── Container Apps ────────────────────────────────────────────────────────────
# TODO: Add Container App resources for goffj, playui, tsnode, fsharp.
#
# Example pattern (uncomment and fill in):
#
# resource "azurerm_container_app" "goffj" {
#   name                         = "goffj"
#   container_app_environment_id = azurerm_container_app_environment.main.id
#   resource_group_name          = azurerm_resource_group.main.name
#   revision_mode                = "Single"
#
#   template {
#     container {
#       name   = "goffj"
#       image  = "${azurerm_container_registry.main.login_server}/goffj:${var.image_tag}"
#       cpu    = 0.25
#       memory = "0.5Gi"
#     }
#   }
#
#   registry {
#     server               = azurerm_container_registry.main.login_server
#     username             = azurerm_container_registry.main.admin_username
#     password_secret_name = "acr-password"
#   }
#
#   secret {
#     name  = "acr-password"
#     value = azurerm_container_registry.main.admin_password
#   }
#
#   ingress {
#     external_enabled = false
#     target_port      = 8500
#     traffic_weight {
#       percentage      = 100
#       latest_revision = true
#     }
#   }
# }

# ── Storage Account ───────────────────────────────────────────────────────────
# Azure Blob Storage = Azure's equivalent of S3.

resource "azurerm_storage_account" "main" {
  name                     = "playground${var.environment}sa"  # Max 24 chars, lowercase alphanumeric
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = var.environment == "prod" ? "GRS" : "LRS"  # GRS = geo-redundant

  blob_properties {
    versioning_enabled = var.environment == "prod"
  }

  tags = azurerm_resource_group.main.tags
}

resource "azurerm_storage_container" "data" {
  name                  = "playground-data"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}
