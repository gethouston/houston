#!/usr/bin/env bash
# Lint the cloud/k8s manifest templates without a cluster.
# Delegates to validate.ts (real YAML parse + placeholder render via Bun).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/.bun/bin:$PATH"
exec bun "$DIR/validate.ts"
