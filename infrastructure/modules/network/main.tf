variable "name_prefix" {
  type = string
}

resource "aws_vpc" "this" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.name_prefix}-vpc"
  }
}

output "vpc_id" {
  value = aws_vpc.this.id
}
