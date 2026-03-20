# modules/networking/main.tf
# ============================
# Reusable networking module — creates a VPC with public and private subnets.
#
# Usage:
#   module "network" {
#     source      = "../modules/networking"
#     name        = "playground"
#     cidr_block  = "10.0.0.0/16"
#     az_count    = 2
#     environment = "dev"
#   }
#
# Output: vpc_id, public_subnet_ids, private_subnet_ids
#
# Architecture created:
#   VPC (10.0.0.0/16)
#   ├── Public subnets (10.0.0.0/24, 10.0.1.0/24) — have internet gateway route
#   │   └── Internet Gateway
#   └── Private subnets (10.0.100.0/24, 10.0.101.0/24) — no direct internet
#       └── (Optional) NAT Gateway → Internet (for outbound from private)

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ── Locals ────────────────────────────────────────────────────────────────────
# locals {} computes derived values from variables.
# Use locals to avoid repeating complex expressions and to keep things DRY.

locals {
  # Common tags applied to ALL resources in this module
  common_tags = {
    Name        = var.name
    Environment = var.environment
    ManagedBy   = "terraform"
    Module      = "networking"
  }

  # Subnet CIDR blocks derived from the VPC CIDR
  # cidrsubnet(base, bits, index) subdivides a CIDR block
  # cidrsubnet("10.0.0.0/16", 8, 0) → "10.0.0.0/24"
  # cidrsubnet("10.0.0.0/16", 8, 1) → "10.0.1.0/24"
  public_cidrs  = [for i in range(var.az_count) : cidrsubnet(var.cidr_block, 8, i)]
  private_cidrs = [for i in range(var.az_count) : cidrsubnet(var.cidr_block, 8, i + 100)]
}

# ── VPC ───────────────────────────────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = var.cidr_block
  enable_dns_support   = true   # Required for service discovery (ECS, RDS hostnames)
  enable_dns_hostnames = true   # Assigns DNS names to instances

  tags = merge(local.common_tags, {
    Name = "${var.name}-vpc"
  })
}

# ── Availability Zones ────────────────────────────────────────────────────────
# Query available AZs in the current region — avoids hardcoding "us-east-1a"

data "aws_availability_zones" "available" {
  state = "available"
}

# ── Public Subnets ─────────────────────────────────────────────────────────────
# count creates N copies of a resource. Use count.index to differentiate them.
# count is good for identical resources; for_each is better for maps/sets.

resource "aws_subnet" "public" {
  count = var.az_count

  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_cidrs[count.index]
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true  # Instances in public subnets get public IPs

  tags = merge(local.common_tags, {
    Name = "${var.name}-public-${count.index + 1}"
    Tier = "public"
  })
}

# ── Private Subnets ────────────────────────────────────────────────────────────

resource "aws_subnet" "private" {
  count = var.az_count

  vpc_id            = aws_vpc.main.id
  cidr_block        = local.private_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = merge(local.common_tags, {
    Name = "${var.name}-private-${count.index + 1}"
    Tier = "private"
  })
}

# ── Internet Gateway ───────────────────────────────────────────────────────────
# IGW allows traffic between the VPC and the internet.
# Public subnets route 0.0.0.0/0 → IGW.

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, { Name = "${var.name}-igw" })
}

# ── Route Tables ───────────────────────────────────────────────────────────────

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(local.common_tags, { Name = "${var.name}-public-rt" })
}

# Associate each public subnet with the public route table
resource "aws_route_table_association" "public" {
  count = var.az_count

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ── Optional NAT Gateway (for private subnet internet access) ─────────────────
# NAT gateway lets private subnet instances reach the internet (outbound only).
# Required for: ECS pulling images from ECR, Lambda fetching packages, etc.
# Cost: ~$32/month per AZ — use count to conditionally create it.

resource "aws_eip" "nat" {
  count  = var.enable_nat_gateway ? 1 : 0
  domain = "vpc"

  tags = merge(local.common_tags, { Name = "${var.name}-nat-eip" })
}

resource "aws_nat_gateway" "main" {
  count = var.enable_nat_gateway ? 1 : 0

  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id  # NAT gateway lives in a public subnet

  tags = merge(local.common_tags, { Name = "${var.name}-nat" })

  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "private" {
  count  = var.enable_nat_gateway ? 1 : 0
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[0].id
  }

  tags = merge(local.common_tags, { Name = "${var.name}-private-rt" })
}

resource "aws_route_table_association" "private" {
  count = var.enable_nat_gateway ? var.az_count : 0

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[0].id
}
