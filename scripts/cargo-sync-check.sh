#!/usr/bin/env bash
# scripts/cargo-sync-check.sh
# Verifies that all Rust sub-crates and workspace dependencies match the target version in package.json.

set -euo pipefail

# 1. Resolve root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# 2. Get target version from package.json
if ! TARGET_VERSION=$(node -e "console.log(require('./package.json').version)" 2>/dev/null); then
  TARGET_VERSION=$(grep -m 1 '"version":' package.json | tr -d ' ' | cut -d '"' -f 4)
fi

echo "Sync Check: Target version is $TARGET_VERSION"

# 3. Find and validate Cargo.toml files
CARGO_FILES=$(find . -name "Cargo.toml" -not -path "*/target/*" -not -path "*/node_modules/*")
DRIFT_DETECTED=0

for cargo_file in $CARGO_FILES; do
  # Skip root Cargo.toml package checks since root is a workspace-only Cargo.toml
  if [[ "$cargo_file" == "./Cargo.toml" ]]; then
    # Validate workspace dependencies versions in root Cargo.toml (only our houston-* internal dependencies)
    echo "Checking root workspace dependency versions in $cargo_file..."
    
    # Parse workspace dependencies
    drift_deps=$(grep -E '^houston-[a-zA-Z-]*\s*=\s*\{' "$cargo_file" | grep -E 'version = "[^"]+"' | grep -v "$TARGET_VERSION" || true)
    if [[ -n "$drift_deps" ]]; then
      echo "  [ERROR] Root Cargo.toml workspace internal dependencies do not match $TARGET_VERSION:"
      echo "$drift_deps"
      DRIFT_DETECTED=1
    else
      echo "  [OK] Root workspace internal dependencies versions are clean."
    fi
    continue
  fi

  echo "Checking $cargo_file..."
  
  # Check package version
  crate_version=$(grep -m 1 '^version = ' "$cargo_file" | tr -d ' ' | cut -d '"' -f 2 || true)
  if [[ -n "$crate_version" ]]; then
    if [[ "$crate_version" != "$TARGET_VERSION" ]]; then
      echo "  [ERROR] Crate version ($crate_version) does not match target version ($TARGET_VERSION)"
      DRIFT_DETECTED=1
    else
      echo "  [OK] Package version matches ($crate_version)."
    fi
  fi

  # Check local dependency versions starting with houston- or with path reference
  drift_local_deps=$(grep -E 'houston-[a-zA-Z-]*\s*=\s*\{' "$cargo_file" | grep -E 'version = "[^"]+"' | grep -v "$TARGET_VERSION" || true)
  if [[ -n "$drift_local_deps" ]]; then
    echo "  [ERROR] Local dependency version drifts found in $cargo_file:"
    echo "$drift_local_deps"
    DRIFT_DETECTED=1
  fi
done

if [[ $DRIFT_DETECTED -eq 1 ]]; then
  echo "=== [FAILED] Version sync drift detected between package.json and Cargo workspaces! ==="
  exit 1
else
  echo "=== [SUCCESS] All package versions and Cargo dependencies are synchronized! ==="
  exit 0
fi
