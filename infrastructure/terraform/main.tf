# NINA-AES Platform — Terraform Main Configuration
# Placeholder — to be configured for your cloud provider

terraform {
  required_version = ">= 1.14.8"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "nina-aes-terraform-state"
    key    = "infrastructure/terraform.tfstate"
    region = "eu-west-3"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "nina-aes"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
