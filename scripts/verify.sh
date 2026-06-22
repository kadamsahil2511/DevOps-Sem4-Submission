#!/usr/bin/env bash
set -euo pipefail

env_name="${1:-demo}"
echo "Verifying TradeNet environment: ${env_name}"
kubectl get namespaces || true
kubectl get pods -A || true
