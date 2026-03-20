# modules/container/main.tf
# =========================
# Reusable ECS Fargate module — creates a task definition + service for
# running one container workload without managing EC2 instances.
#
# Usage:
#   module "goffj_service" {
#     source         = "../modules/container"
#     name           = "goffj"
#     environment    = "dev"
#     image          = "123456789.dkr.ecr.us-east-1.amazonaws.com/goffj:latest"
#     cpu            = 256
#     memory         = 512
#     container_port = 8500
#     vpc_id         = module.network.vpc_id
#     subnet_ids     = module.network.private_subnet_ids
#     cluster_arn    = aws_ecs_cluster.main.arn
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
    Module      = "container"
  }
}

# ── CloudWatch Log Group ──────────────────────────────────────────────────────
# ECS sends stdout/stderr here. `/ecs/` prefix is conventional.

resource "aws_cloudwatch_log_group" "main" {
  name              = "/ecs/${var.environment}/${var.name}"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

# ── ECS Task Definition ───────────────────────────────────────────────────────
# A task definition is a blueprint: which image to run, how much CPU/memory,
# what ports to expose, and where to send logs.
#
# FARGATE: AWS manages the underlying EC2 — you only define the task.
# cpu/memory are specified in "units": 256 CPU units = 0.25 vCPU.

resource "aws_ecs_task_definition" "main" {
  family                   = "${var.environment}-${var.name}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"   # Required for Fargate — each task gets its own ENI
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  # jsonencode() converts HCL to JSON — ECS expects JSON container definitions
  container_definitions = jsonencode([
    {
      name      = var.name
      image     = var.image
      essential = true  # If this container stops, the task stops

      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]

      # Environment variables injected at runtime
      environment = [for k, v in var.environment_vars : { name = k, value = v }]

      # Secrets from Parameter Store or Secrets Manager (encrypted at rest)
      secrets = [for k, v in var.secrets : { name = k, valueFrom = v }]

      # Send all logs to CloudWatch
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.main.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "ecs"
        }
      }

      # Health check inside the container
      healthCheck = var.health_check_command != null ? {
        command     = ["CMD-SHELL", var.health_check_command]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      } : null
    }
  ])

  tags = local.common_tags
}

# ── IAM Roles ─────────────────────────────────────────────────────────────────
# ECS requires TWO roles:
#   execution_role: used by ECS agent to pull images, fetch secrets, write logs
#   task_role:      used by the application code (e.g. access S3, DynamoDB)

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.environment}-${var.name}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  # AWS-managed policy grants: ECR pull + CloudWatch Logs write + SSM read
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "task" {
  name               = "${var.environment}-${var.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.common_tags
}

# ── Security Group ────────────────────────────────────────────────────────────
# Controls inbound/outbound traffic to the task's ENI.

resource "aws_security_group" "task" {
  name        = "${var.environment}-${var.name}-task-sg"
  description = "Security group for ${var.name} ECS task"
  vpc_id      = var.vpc_id

  ingress {
    description = "App port from within VPC"
    from_port   = var.container_port
    to_port     = var.container_port
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.main.cidr_block]
  }

  egress {
    description = "All outbound (for ECR, S3, external APIs)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

data "aws_vpc" "main" {
  id = var.vpc_id
}

data "aws_region" "current" {}

# ── ECS Service ───────────────────────────────────────────────────────────────
# A service keeps N copies of the task definition running.
# If a task crashes, ECS replaces it automatically.

resource "aws_ecs_service" "main" {
  name            = "${var.environment}-${var.name}"
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.main.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  # For zero-downtime deployments: bring up new tasks before removing old
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = false  # Private subnets need NAT for outbound
  }

  # Optional: register with a load balancer target group
  dynamic "load_balancer" {
    for_each = var.target_group_arn != null ? [1] : []

    content {
      target_group_arn = var.target_group_arn
      container_name   = var.name
      container_port   = var.container_port
    }
  }

  tags = local.common_tags

  # Ignore desired_count changes — allow auto-scaling to manage it
  lifecycle {
    ignore_changes = [desired_count]
  }
}
