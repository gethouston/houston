#!/usr/bin/env bash
set -euo pipefail

ARTIFACT_SIGNING_CLI_VERSION="0.11.0"

cargo install artifact-signing-cli --version "$ARTIFACT_SIGNING_CLI_VERSION" --locked
artifact-signing-cli --help > /dev/null
echo "artifact-signing-cli $ARTIFACT_SIGNING_CLI_VERSION installed at $(command -v artifact-signing-cli)"
