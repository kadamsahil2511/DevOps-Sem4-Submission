#!/usr/bin/env bash
set -euo pipefail

env_name="${1:-demo}"
echo "Deploying TradeNet environment: ${env_name}"
echo "Run 'make plan ENV=${env_name}' first and review the Terraform output before applying."
echo "This placeholder intentionally avoids implicit cloud changes."
