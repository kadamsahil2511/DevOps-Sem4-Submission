#!/usr/bin/env bash
set -euo pipefail

env_name="${1:-demo}"
echo "Destroy requested for TradeNet environment: ${env_name}"
echo "Run 'make plan-destroy ENV=${env_name}' and confirm reviewed resources before applying."
echo "This script does not destroy resources automatically."
