# Infrastructure — Terraform

Multi-cloud infrastructure-as-code for the playground. Supports AWS, Azure, and GCP.

## Structure

```
infra/
├── modules/                   # Reusable modules (cloud-agnostic patterns)
│   ├── networking/            # VPC, subnets, IGW, NAT (AWS)
│   ├── storage/               # S3 bucket with encryption + lifecycle (AWS)
│   └── container/             # ECS Fargate service + IAM roles (AWS)
├── aws/                       # AWS root configuration
│   ├── main.tf                # Wires modules together, defines ECS cluster
│   ├── variables.tf           # Input variables
│   └── terraform.tfvars.example
├── azure/                     # Azure root configuration
│   ├── main.tf                # Container Apps + ACR + Blob Storage
│   ├── variables.tf
│   └── terraform.tfvars.example
└── gcp/                       # GCP root configuration
    ├── main.tf                # Cloud Run + Artifact Registry + GCS
    ├── variables.tf
    └── terraform.tfvars.example
```

## Quick Start (AWS)

```bash
cd infra/aws
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

terraform init
terraform plan      # Preview what will be created
terraform apply     # Create resources
terraform destroy   # Tear everything down when done
```

## Concepts Demonstrated

### Modules
Modules are reusable Terraform packages. The `networking` module creates a full VPC stack
and can be called multiple times for different environments:

```hcl
module "network" {
  source      = "../modules/networking"
  name        = "playground"
  environment = "dev"
  cidr_block  = "10.0.0.0/16"
  az_count    = 2
}

# Access outputs with module.<name>.<output>
resource "..." {
  vpc_id = module.network.vpc_id
}
```

### State
Terraform stores state in `terraform.tfstate` — a JSON file mapping config to real resources.
- Local state: fine for learning, risky for teams
- Remote state (S3/GCS/Azure Blob): required for CI/CD and collaboration
- State locking (DynamoDB): prevents concurrent `terraform apply` conflicts

### Workspaces
Use workspaces to manage multiple environments from the same config:

```bash
terraform workspace new staging
terraform workspace select staging
terraform apply -var="environment=staging"
```

### Import Existing Resources
If resources already exist (created manually), import them:

```bash
terraform import aws_s3_bucket.main my-bucket-name
```

## Cost Estimates

| Resource | AWS | Azure | GCP |
|---|---|---|---|
| VPC/VNet | Free | Free | Free |
| NAT Gateway | ~$32/month | ~$35/month | ~$20/month |
| ECS Fargate 0.25vCPU/512MB | ~$9/month | - | - |
| Container Apps (dev) | - | ~$5/month | - |
| Cloud Run (dev, scale-to-zero) | - | - | ~$0-2/month |
| S3/Blob/GCS (1GB) | ~$0.02/month | ~$0.02/month | ~$0.02/month |

**Tip**: Set `enable_nat_gateway = false` and use public subnets for learning to avoid the NAT cost.
