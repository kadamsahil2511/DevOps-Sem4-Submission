terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "TradeNet"
      Environment = "demo"
      ManagedBy   = "Terraform"
      Owner       = "Sahil-Kadam"
    }
  }
}

module "network" {
  source      = "../../modules/network"
  name_prefix = "tradenet-demo"
}
