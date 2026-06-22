#!/usr/bin/env bash
set -euo pipefail

env_name="${1:-demo}"
echo "Verifying cleanup for TradeNet environment: ${env_name}"
bash scripts/aws-inventory.sh
