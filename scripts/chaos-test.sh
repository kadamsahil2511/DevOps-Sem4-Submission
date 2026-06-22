#!/usr/bin/env bash
set -euo pipefail

scenario="${1:-pod-failure}"
echo "Chaos scenario: ${scenario}"
case "$scenario" in
  pod-failure)
    kubectl -n tradenet-apps delete pod -l app.kubernetes.io/name=declaration-service
    ;;
  *)
    echo "Unknown scenario: ${scenario}"
    exit 1
    ;;
esac
