#!/bin/sh
# Shared helpers for the Xcode run-script phases.
#
# Xcode run scripts execute with a MINIMAL PATH (typically /usr/bin:/bin) that
# does NOT include Homebrew, nvm, corepack, or a user pnpm shim. Every script
# that shells out to pnpm/node MUST source this file to repair PATH first,
# otherwise the build fails with "pnpm: command not found".

# Prepend the common locations node/pnpm land in on a dev Mac.
houston_repair_path() {
  PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/Library/pnpm:$PATH"
  # corepack/nvm-managed node versions
  if [ -d "$HOME/.nvm/versions/node" ]; then
    for d in "$HOME/.nvm/versions/node"/*/bin; do
      [ -d "$d" ] && PATH="$d:$PATH"
    done
  fi
  export PATH
}

# Resolve the monorepo root from a script living in mobile/ios/scripts.
# Usage: REPO_ROOT=$(houston_repo_root "$0")
houston_repo_root() {
  script_dir=$(cd "$(dirname "$1")" && pwd)
  ( cd "$script_dir/../../.." && pwd )
}

# Fail loudly (no silent fallback) if pnpm is unreachable.
houston_require_pnpm() {
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "error: pnpm not found on PATH." >&2
    echo "       Xcode run scripts get a minimal PATH; install Node + pnpm and" >&2
    echo "       make sure they resolve from /opt/homebrew/bin or ~/Library/pnpm." >&2
    echo "       See mobile/ios/README.md (Troubleshooting)." >&2
    exit 1
  fi
}
