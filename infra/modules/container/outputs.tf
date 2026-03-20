output "service_name" {
  description = "Name of the ECS service"
  value       = aws_ecs_service.main.name
}

output "service_id" {
  description = "ID of the ECS service"
  value       = aws_ecs_service.main.id
}

output "task_definition_arn" {
  description = "ARN of the current task definition revision"
  value       = aws_ecs_task_definition.main.arn
}

output "task_role_arn" {
  description = "ARN of the task IAM role — attach additional policies here"
  value       = aws_iam_role.task.arn
}

output "security_group_id" {
  description = "ID of the task security group — use to allow cross-service traffic"
  value       = aws_security_group.task.id
}

output "log_group_name" {
  description = "CloudWatch log group name for this service"
  value       = aws_cloudwatch_log_group.main.name
}
