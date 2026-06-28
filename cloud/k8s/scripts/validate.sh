#!/usr/bin/env bash
# Lint the cloud/k8s manifest templates without a cluster.
# Delegates to validate.ts (real YAML parse + placeholder render via Node/tsx).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../../.." && pwd)"
cd "$ROOT"
exec pnpm exec tsx "$DIR/validate.ts"
