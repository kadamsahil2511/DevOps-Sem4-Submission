#!/usr/bin/env bash
set -euo pipefail

env_name="${1:-demo}"
echo "Load test target environment: ${env_name}"
if ! command -v k6 >/dev/null 2>&1; then
  echo "k6 is not installed. Install k6 to run performance evidence."
  exit 1
fi
k6 run tests/performance/declaration-load.js
