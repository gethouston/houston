#!/usr/bin/env bash
# ============================================================================
# Fetch / build the bundled CLIs pinned in `cli-deps.json` and stage them
# under `app/src-tauri/resources/bin/` so Tauri's `bundle.resources` glob
# picks them up at .app / .msi build time.
#
# Output layout — macOS universal .app:
#
#   app/src-tauri/resources/bin/
#     codex                          # universal Mach-O (arm64 + x86_64)
#     composio-aarch64/              # Apple Silicon Bun bundle
#       composio
#       services/
#       *.mjs
#     composio-x86_64/               # Intel Bun bundle
#       composio
#       services/
#       *.mjs
#     cli-deps.json                  # pinned URLs + checksums for runtime
#                                    # downloads (claude-code) — read by the
#                                    # houston-claude-installer crate.
#
# Output layout — Windows x64 .msi:
#
#   app/src-tauri/resources/bin/
#     codex.exe                      # Windows x64 single-arch binary
#     composio-x86_64/               # Bun-compiled Windows bundle
#       composio.exe
#       services/
#       *.mjs
#       acp-adapters/
#         codex/win32-x64/codex-acp.exe
#         claude-code-acp.mjs
#         cli.js
#     cli-deps.json
#
# Why this layout:
#   - codex is a Rust binary — on macOS we `lipo -create` the two slices
#     into a single fat binary; on Windows there is no lipo equivalent
#     and we simply stage the per-arch binary alongside the rest.
#   - composio is a Bun-bundled JavaScript runtime — CANNOT be lipo'd; the
#     binary contains an arch-specific Bun runtime + sibling .mjs/services
#     files. Both arches must be shipped side-by-side under a per-arch dir
#     on macOS. On Windows we ship one arch only (no Windows ARM build in
#     v1) and the resolver is per-OS so directory names don't collide
#     between the .app and .msi outputs.
#   - cli-deps.json travels with the bundle so the runtime claude-code
#     installer can read pinned URL+SHA256 without needing network access
#     to a separate manifest endpoint.
#
# Modes:
#   ./scripts/fetch-cli-deps.sh                # macOS, both arches (production)
#   ./scripts/fetch-cli-deps.sh both           # alias for macOS both arches
#   ./scripts/fetch-cli-deps.sh arm64          # macOS arm64 only (dev)
#   ./scripts/fetch-cli-deps.sh x64            # macOS x64 only (dev)
#   ./scripts/fetch-cli-deps.sh windows-x64    # Windows x64 (production)
#   ./scripts/fetch-cli-deps.sh windows-arm64  # Windows ARM64 (production)
#   ./scripts/fetch-cli-deps.sh windows-both   # both Windows arches
#   ./scripts/fetch-cli-deps.sh host           # auto-detect host OS + arch
#
# CI uses the no-arg form on macOS runners and `windows-both` on Windows
# runners (the MSI ships both arches alongside each other and the
# runtime picker chooses based on IsWow64Process2). Local dev can use
# `host` to skip cross-arch slices the developer doesn't need.
#
# Strict mode: any download or checksum failure is fatal (set -euo pipefail).
# Partial bundles are unacceptable — we'd ship a broken .app / .msi to
# half the user base.
# ============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPS_FILE="$REPO_ROOT/cli-deps.json"
OUT_DIR="$REPO_ROOT/app/src-tauri/resources/bin"

if [ ! -f "$DEPS_FILE" ]; then
  echo "ERROR: cli-deps.json not found at $DEPS_FILE" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not installed (brew install jq | choco install jq)" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Mode parsing — derive (TARGET_OS, ARCHES) from the user-facing mode arg.
# Backwards compatibility: existing macOS modes (`both`, `arm64`, `x64`,
# `host`) keep working unchanged so the existing macOS CI workflow doesn't
# need to know about Windows.
# ---------------------------------------------------------------------------

detect_host_arch() {
  case "$(uname -m)" in
    arm64|aarch64) echo "arm64" ;;
    x86_64|amd64)  echo "x64" ;;
    *) echo "ERROR: unsupported host arch $(uname -m)" >&2; exit 1 ;;
  esac
}

detect_host_os() {
  case "$(uname -s)" in
    Darwin*) echo "darwin" ;;
    Linux*)  echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT) echo "windows" ;;
    *) echo "ERROR: unsupported host OS $(uname -s)" >&2; exit 1 ;;
  esac
}

MODE="${1:-both}"
TARGET_OS=""
ARCHES=()
case "$MODE" in
  both)            TARGET_OS="darwin"; ARCHES=("arm64" "x64") ;;
  arm64)           TARGET_OS="darwin"; ARCHES=("arm64") ;;
  x64)             TARGET_OS="darwin"; ARCHES=("x64") ;;
  windows-x64)     TARGET_OS="windows"; ARCHES=("x64") ;;
  windows-arm64)   TARGET_OS="windows"; ARCHES=("arm64") ;;
  windows-both)    TARGET_OS="windows"; ARCHES=("x64" "arm64") ;;
  host)
    HOST_OS=$(detect_host_os)
    HOST_ARCH=$(detect_host_arch)
    case "$HOST_OS" in
      darwin)  TARGET_OS="darwin"; ARCHES=("$HOST_ARCH") ;;
      windows) TARGET_OS="windows"; ARCHES=("$HOST_ARCH") ;;
      *) echo "ERROR: host mode does not yet support $HOST_OS" >&2; exit 1 ;;
    esac ;;
  *) echo "ERROR: unknown mode '$MODE' (expected: both|arm64|x64|windows-x64|windows-arm64|windows-both|host)" >&2; exit 1 ;;
esac

mkdir -p "$OUT_DIR"

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

# Download with fail-fast + retry. Avoids a half-written file leaking past
# a transient network error (curl with --output writes incrementally).
download() {
  local url="$1" dest="$2"
  local attempts=3 i=1
  while [ "$i" -le "$attempts" ]; do
    if curl -fsSL --retry 3 --retry-delay 2 -o "$dest" "$url"; then
      return 0
    fi
    echo "  download attempt $i/$attempts failed; retrying…" >&2
    i=$((i + 1))
  done
  return 1
}

# Verify SHA-256 checksum. Empty `expected` prints the actual so the user
# can pin it (used when bumping a CLI version with `bump-cli.sh`).
verify_or_print_checksum() {
  local file="$1" expected="$2" label="$3"
  local actual
  if command -v shasum >/dev/null 2>&1; then
    actual=$(shasum -a 256 "$file" | cut -d' ' -f1)
  else
    actual=$(sha256sum "$file" | cut -d' ' -f1)
  fi
  if [ -n "$expected" ]; then
    if [ "$actual" != "$expected" ]; then
      echo "ERROR: checksum mismatch for $label" >&2
      echo "  expected: $expected" >&2
      echo "  actual:   $actual" >&2
      return 1
    fi
    echo "  $label checksum: OK"
  else
    echo "  $label checksum (pin this in cli-deps.json): $actual"
  fi
  return 0
}

# Find the main binary inside an extracted archive. Some archives put the
# binary at the root, others under a versioned subdirectory.
find_binary() {
  local extract_dir="$1" binary_name="$2"
  find "$extract_dir" -type f \( -name "$binary_name" -o -name "$binary_name-*" \) \
    | head -1
}

# Stage cli-deps.json itself so the runtime claude-code installer can
# read pinned URLs + checksums at install time without a separate fetch.
stage_manifest() {
  cp "$DEPS_FILE" "$OUT_DIR/cli-deps.json"
  echo "  Staged: $OUT_DIR/cli-deps.json"
}

# Prune cross-platform acp-adapters keeping only `keep_platform`.
# Composio's bundle ships every supported platform's codex-acp binary
# (~90 MB each); each per-arch process only ever reads its own.
prune_acp_adapters() {
  local dest_dir="$1" keep_platform="$2"
  local acp_codex_dir="$dest_dir/acp-adapters/codex"
  if [ -d "$acp_codex_dir" ]; then
    local before_size
    before_size=$(du -sh "$dest_dir" | cut -f1)
    for plat_dir in "$acp_codex_dir"/*; do
      [ -d "$plat_dir" ] || continue
      local plat_name
      plat_name=$(basename "$plat_dir")
      if [ "$plat_name" != "$keep_platform" ]; then
        rm -rf "$plat_dir"
      fi
    done
    local after_size
    after_size=$(du -sh "$dest_dir" | cut -f1)
    echo "  Pruned acp-adapters to $keep_platform only ($before_size -> $after_size)"
  fi
}

# ---------------------------------------------------------------------------
# macOS code path — unchanged from the pre-Windows release pipeline
# ---------------------------------------------------------------------------

stage_codex_arch_darwin() {
  local arch="$1"
  local platform="darwin-$arch"
  local version url_template expected url tmp extract_dir bin_path
  version=$(jq -r '.codex.version' "$DEPS_FILE")
  url_template=$(jq -r ".codex.urls[\"$platform\"] // empty" "$DEPS_FILE")
  expected=$(jq -r ".codex.checksums[\"$platform\"] // empty" "$DEPS_FILE")

  if [ -z "$url_template" ]; then
    echo "ERROR: cli-deps.json missing codex URL for $platform" >&2
    exit 1
  fi

  url="${url_template//\{version\}/$version}"
  echo "FETCH codex v$version ($platform)"
  echo "  URL: $url"

  tmp=$(mktemp)
  download "$url" "$tmp" || { echo "ERROR: codex download failed for $platform" >&2; rm -f "$tmp"; exit 1; }
  verify_or_print_checksum "$tmp" "$expected" "codex/$platform" || { rm -f "$tmp"; exit 1; }

  extract_dir=$(mktemp -d)
  case "$url" in
    *.tar.gz|*.tgz) tar xzf "$tmp" -C "$extract_dir" ;;
    *.zip)          unzip -q "$tmp" -d "$extract_dir" ;;
    *)              cp "$tmp" "$extract_dir/codex" ;;
  esac
  rm -f "$tmp"

  bin_path=$(find_binary "$extract_dir" "codex")
  if [ -z "$bin_path" ]; then
    echo "ERROR: codex binary not found in archive for $platform" >&2
    find "$extract_dir" -type f | head -20 >&2
    rm -rf "$extract_dir"
    exit 1
  fi

  local stage_dir="$OUT_DIR/.staging/codex"
  mkdir -p "$stage_dir"
  cp "$bin_path" "$stage_dir/codex-$arch"
  chmod +x "$stage_dir/codex-$arch"
  rm -rf "$extract_dir"

  # Verify the binary has the expected slice — protects against a
  # mislabelled URL (Apple silicon binary served from x64 URL, etc.).
  local lipo_info
  lipo_info=$(lipo -info "$stage_dir/codex-$arch" 2>&1 || echo "")
  case "$arch" in
    arm64)
      echo "$lipo_info" | grep -q 'arm64' \
        || { echo "ERROR: codex-$arch is not an arm64 binary: $lipo_info" >&2; exit 1; } ;;
    x64)
      echo "$lipo_info" | grep -q 'x86_64' \
        || { echo "ERROR: codex-$arch is not an x86_64 binary: $lipo_info" >&2; exit 1; } ;;
  esac

  echo "  Staged: $stage_dir/codex-$arch"
}

lipo_codex_universal_darwin() {
  local stage_dir="$OUT_DIR/.staging/codex"
  if [ ! -f "$stage_dir/codex-arm64" ] || [ ! -f "$stage_dir/codex-x64" ]; then
    echo "ERROR: cannot lipo codex — both arches not staged" >&2
    ls -la "$stage_dir" >&2 || true
    exit 1
  fi
  echo "LIPO codex universal (arm64 + x86_64)"
  lipo -create \
    "$stage_dir/codex-arm64" \
    "$stage_dir/codex-x64" \
    -output "$OUT_DIR/codex"
  chmod +x "$OUT_DIR/codex"
  rm -rf "$stage_dir"
  local lipo_info
  lipo_info=$(lipo -info "$OUT_DIR/codex" 2>&1)
  echo "  $lipo_info"
  echo "  Installed: $OUT_DIR/codex ($(du -sh "$OUT_DIR/codex" | cut -f1))"
}

finalize_codex_single_arch_darwin() {
  local arch="$1"
  local stage_dir="$OUT_DIR/.staging/codex"
  if [ ! -f "$stage_dir/codex-$arch" ]; then
    echo "ERROR: codex-$arch not staged" >&2
    exit 1
  fi
  echo "FINALIZE codex (single arch: $arch — dev build, NOT shippable)"
  cp "$stage_dir/codex-$arch" "$OUT_DIR/codex"
  chmod +x "$OUT_DIR/codex"
  rm -rf "$stage_dir"
  echo "  Installed: $OUT_DIR/codex (single $arch)"
}

fetch_composio_arch_darwin() {
  local arch="$1"
  local platform="darwin-$arch"
  local version url_template expected url tmp extract_dir bin_path bin_dir dest_dir
  version=$(jq -r '.composio.version' "$DEPS_FILE")
  url_template=$(jq -r ".composio.urls[\"$platform\"] // empty" "$DEPS_FILE")
  expected=$(jq -r ".composio.checksums[\"$platform\"] // empty" "$DEPS_FILE")

  if [ -z "$url_template" ]; then
    echo "ERROR: cli-deps.json missing composio URL for $platform" >&2
    exit 1
  fi

  url="${url_template//\{version\}/$version}"
  echo "FETCH composio v$version ($platform)"
  echo "  URL: $url"

  tmp=$(mktemp)
  download "$url" "$tmp" || { echo "ERROR: composio download failed for $platform" >&2; rm -f "$tmp"; exit 1; }
  verify_or_print_checksum "$tmp" "$expected" "composio/$platform" || { rm -f "$tmp"; exit 1; }

  extract_dir=$(mktemp -d)
  case "$url" in
    *.tar.gz|*.tgz) tar xzf "$tmp" -C "$extract_dir" ;;
    *.zip)          unzip -q "$tmp" -d "$extract_dir" ;;
    *)              echo "ERROR: composio archive type unknown for $url" >&2; rm -f "$tmp"; rm -rf "$extract_dir"; exit 1 ;;
  esac
  rm -f "$tmp"

  bin_path=$(find_binary "$extract_dir" "composio")
  if [ -z "$bin_path" ]; then
    echo "ERROR: composio binary not found in archive for $platform" >&2
    find "$extract_dir" -type f | head -20 >&2
    rm -rf "$extract_dir"
    exit 1
  fi
  bin_dir=$(dirname "$bin_path")

  local rust_arch
  case "$arch" in
    arm64) rust_arch="aarch64" ;;
    x64)   rust_arch="x86_64" ;;
  esac
  dest_dir="$OUT_DIR/composio-$rust_arch"
  rm -rf "$dest_dir"
  cp -R "$bin_dir" "$dest_dir"

  local actual_name
  actual_name=$(basename "$bin_path")
  if [ "$actual_name" != "composio" ]; then
    mv "$dest_dir/$actual_name" "$dest_dir/composio"
  fi
  chmod +x "$dest_dir/composio"

  rm -rf "$extract_dir"

  prune_acp_adapters "$dest_dir" "darwin-$arch"

  echo "  Installed: $dest_dir/ ($(du -sh "$dest_dir" | cut -f1))"
}

# Stage gemini for macOS. Upstream google-gemini/gemini-cli publishes
# per-arch Node SEA binaries as `gemini-darwin-{arm64,x64}-unsigned.zip`
# on every release — one Mach-O each, ~120 MB. Cannot be lipo'd (the
# embedded NODE_SEA segment + sentinel fuse are arch-specific Mach-O
# segments; `lipo -create` would corrupt the postject injection). Each
# arch ships at resources/bin/gemini-{aarch64,x86_64}/gemini, mirroring
# the per-arch composio layout. The upstream archive name literally
# carries `-unsigned` because Google ships ad-hoc Mach-Os; Houston's
# release.yml pre-signs them with Developer ID + hardened runtime
# before tauri-action notarizes the .app.
stage_gemini_arch_darwin() {
  local arch="$1"
  local platform="darwin-$arch"
  local version url_template expected url tmp extract_dir bin_path dest_dir
  version=$(jq -r '.gemini.version' "$DEPS_FILE")
  url_template=$(jq -r ".gemini.urls[\"$platform\"] // empty" "$DEPS_FILE")
  expected=$(jq -r ".gemini.checksums[\"$platform\"] // empty" "$DEPS_FILE")

  if [ -z "$url_template" ]; then
    echo "ERROR: cli-deps.json missing gemini URL for $platform" >&2
    exit 1
  fi

  url="${url_template//\{version\}/$version}"
  echo "FETCH gemini v$version ($platform)"
  echo "  URL: $url"

  tmp=$(mktemp)
  download "$url" "$tmp" || { echo "ERROR: gemini download failed for $platform" >&2; rm -f "$tmp"; exit 1; }
  verify_or_print_checksum "$tmp" "$expected" "gemini/$platform" || { rm -f "$tmp"; exit 1; }

  extract_dir=$(mktemp -d)
  unzip -q "$tmp" -d "$extract_dir"
  rm -f "$tmp"

  bin_path=$(find_binary "$extract_dir" "gemini")
  if [ -z "$bin_path" ]; then
    echo "ERROR: gemini binary not found in archive for $platform" >&2
    find "$extract_dir" -type f | head -20 >&2
    rm -rf "$extract_dir"
    exit 1
  fi

  local rust_arch
  case "$arch" in
    arm64) rust_arch="aarch64" ;;
    x64)   rust_arch="x86_64" ;;
  esac
  dest_dir="$OUT_DIR/gemini-$rust_arch"
  rm -rf "$dest_dir"
  mkdir -p "$dest_dir"
  cp "$bin_path" "$dest_dir/gemini"
  chmod +x "$dest_dir/gemini"
  rm -rf "$extract_dir"

  # Verify slice — protect against a mislabeled URL (Apple silicon
  # binary served from the x64 URL, etc.).
  local lipo_info
  lipo_info=$(lipo -info "$dest_dir/gemini" 2>&1 || echo "")
  case "$arch" in
    arm64) echo "$lipo_info" | grep -q 'arm64'  || { echo "ERROR: gemini-$arch is not arm64: $lipo_info" >&2; exit 1; } ;;
    x64)   echo "$lipo_info" | grep -q 'x86_64' || { echo "ERROR: gemini-$arch is not x86_64: $lipo_info" >&2; exit 1; } ;;
  esac

  # Ad-hoc sign for DEV USE. Upstream's *-unsigned.zip ships a Node SEA
  # Mach-O with no signature, and macOS hardened-runtime + library
  # validation kills unsigned Mach-Os with SIGKILL (exit 137) the moment
  # Houston tries to exec them in `pnpm tauri dev`. Production CI
  # replaces this with a real Developer ID signature in
  # `.github/workflows/release.yml#Pre-sign bundled CLI binaries`. The
  # ad-hoc signature here is enough to satisfy the loader in unsigned
  # dev builds and gets overwritten by the CI step on release.
  codesign --force --sign - "$dest_dir/gemini" 2>/dev/null \
    || { echo "ERROR: ad-hoc codesign failed for $dest_dir/gemini" >&2; exit 1; }

  echo "  Installed: $dest_dir/ ($(du -sh "$dest_dir" | cut -f1))"
}

# ---------------------------------------------------------------------------
# Windows code path — codex via download, composio via build-from-source
# ---------------------------------------------------------------------------

# Stage codex for Windows. Upstream openai/codex publishes pre-built
# `codex-{x86_64,aarch64}-pc-windows-msvc.exe.zst` artifacts on every
# release — we just download, decompress, and stage at the single
# location resources/bin/codex.exe (no lipo equivalent on Windows).
stage_codex_windows() {
  local arch="$1"
  local platform="windows-$arch"
  local version url_template expected url tmp out_path
  version=$(jq -r '.codex.version' "$DEPS_FILE")
  url_template=$(jq -r ".codex.urls[\"$platform\"] // empty" "$DEPS_FILE")
  expected=$(jq -r ".codex.checksums[\"$platform\"] // empty" "$DEPS_FILE")

  if [ -z "$url_template" ]; then
    echo "ERROR: cli-deps.json missing codex URL for $platform" >&2
    exit 1
  fi

  url="${url_template//\{version\}/$version}"
  echo "FETCH codex v$version ($platform)"
  echo "  URL: $url"

  tmp=$(mktemp)
  download "$url" "$tmp" || { echo "ERROR: codex download failed for $platform" >&2; rm -f "$tmp"; exit 1; }
  verify_or_print_checksum "$tmp" "$expected" "codex/$platform" || { rm -f "$tmp"; exit 1; }

  if ! command -v zstd >/dev/null 2>&1; then
    echo "ERROR: zstd is required to decompress the codex Windows artifact" >&2
    echo "  brew install zstd | choco install zstandard" >&2
    rm -f "$tmp"
    exit 1
  fi

  out_path="$OUT_DIR/codex.exe"
  rm -f "$out_path"
  zstd -d "$tmp" -o "$out_path" >/dev/null 2>&1
  rm -f "$tmp"

  if [ ! -s "$out_path" ]; then
    echo "ERROR: zstd decompression produced empty output for codex/$platform" >&2
    exit 1
  fi
  echo "  Installed: $out_path ($(du -sh "$out_path" | cut -f1))"
}

# Stage the Git for Windows PortableGit self-extracting 7z so Houston
# can give Claude Code a working bash.exe without the user installing
# Git separately. Layout: resources/bin/git-bash-{x86_64|aarch64}.7z.exe
# — first-launch extraction into %LOCALAPPDATA% happens in
# houston-engine-core::git_bash at runtime.
stage_git_bash_windows() {
  local arch="$1"
  local platform="windows-$arch"
  local version url_template expected url tmp out_path
  version=$(jq -r '."git-bash".version' "$DEPS_FILE")
  url_template=$(jq -r ".\"git-bash\".urls[\"$platform\"] // empty" "$DEPS_FILE")
  expected=$(jq -r ".\"git-bash\".checksums[\"$platform\"] // empty" "$DEPS_FILE")

  if [ -z "$url_template" ]; then
    echo "ERROR: cli-deps.json missing git-bash URL for $platform" >&2
    exit 1
  fi

  # Bun-style template substitution — keeps cli-deps.json terse.
  url="${url_template//\{version\}/$version}"
  echo "FETCH git-bash v$version ($platform PortableGit SFX)"
  echo "  URL: $url"

  local rust_arch
  case "$arch" in
    arm64) rust_arch="aarch64" ;;
    x64)   rust_arch="x86_64" ;;
    *)     echo "ERROR: unknown arch '$arch' for git-bash" >&2; exit 1 ;;
  esac

  tmp=$(mktemp)
  download "$url" "$tmp" || { echo "ERROR: git-bash download failed for $platform" >&2; rm -f "$tmp"; exit 1; }
  verify_or_print_checksum "$tmp" "$expected" "git-bash/$platform" || { rm -f "$tmp"; exit 1; }

  # Bundle path matches the per-arch convention used by composio
  # (composio-{x86_64,aarch64}/) so the runtime resolver can find both
  # with the same arch-string derivation.
  out_path="$OUT_DIR/git-bash-$rust_arch.7z.exe"
  rm -f "$out_path"
  mv "$tmp" "$out_path"
  echo "  Installed: $out_path ($(du -sh "$out_path" | cut -f1))"
}

# Build composio for Windows from the Houston-maintained fork. Upstream
# ComposioHQ/composio does not yet publish a Windows artifact — see the
# `$build_comment` in cli-deps.json for the full reasoning. The build is
# reproducible: every input (repo URL, commit SHA, package path, Bun
# target, Bun version) is pinned in the manifest.
build_composio_windows() {
  local arch="$1"
  local platform="windows-$arch"
  local source_repo source_ref source_sha package_path bun_target bun_version artifact_basename
  source_repo=$(jq -r ".composio.build[\"$platform\"].source_repo // empty" "$DEPS_FILE")
  source_ref=$(jq -r ".composio.build[\"$platform\"].source_ref // empty" "$DEPS_FILE")
  source_sha=$(jq -r ".composio.build[\"$platform\"].source_sha // empty" "$DEPS_FILE")
  package_path=$(jq -r ".composio.build[\"$platform\"].package_path // empty" "$DEPS_FILE")
  bun_target=$(jq -r ".composio.build[\"$platform\"].bun_target // empty" "$DEPS_FILE")
  bun_version=$(jq -r ".composio.build[\"$platform\"].bun_version // empty" "$DEPS_FILE")
  artifact_basename=$(jq -r ".composio.build[\"$platform\"].artifact_basename // empty" "$DEPS_FILE")

  for v in "$source_repo" "$source_ref" "$package_path" "$bun_target" "$artifact_basename"; do
    if [ -z "$v" ]; then
      echo "ERROR: composio.build.$platform is missing required fields in cli-deps.json" >&2
      exit 1
    fi
  done

  local rust_arch
  case "$arch" in
    arm64) rust_arch="aarch64" ;;
    x64)   rust_arch="x86_64" ;;
  esac

  echo "BUILD composio ($platform) from $source_repo @ $source_ref"

  # Local override for development / weekend testing:
  #   COMPOSIO_FORK_PATH=/path/to/checkout ./scripts/fetch-cli-deps.sh windows-x64
  # skips the remote clone and reuses an existing tree (with whatever
  # local commits are on it). Production CI never sets this.
  local fork_dir
  if [ -n "${COMPOSIO_FORK_PATH:-}" ]; then
    if [ ! -d "$COMPOSIO_FORK_PATH" ]; then
      echo "ERROR: COMPOSIO_FORK_PATH=$COMPOSIO_FORK_PATH does not exist" >&2
      exit 1
    fi
    fork_dir="$COMPOSIO_FORK_PATH"
    echo "  Using local override: $fork_dir"
  else
    fork_dir=$(mktemp -d)
    echo "  Cloning into: $fork_dir"
    git clone --depth 1 --branch "$source_ref" "$source_repo" "$fork_dir" 2>&1 | tail -3

    if [ -n "$source_sha" ]; then
      local actual_sha
      actual_sha=$(git -C "$fork_dir" rev-parse HEAD)
      if [ "$actual_sha" != "$source_sha" ]; then
        echo "ERROR: composio fork SHA mismatch" >&2
        echo "  expected: $source_sha" >&2
        echo "  actual:   $actual_sha" >&2
        echo "  Either bump composio.build.$platform.source_sha in cli-deps.json" >&2
        echo "  or update the fork branch '$source_ref' to point at $source_sha" >&2
        exit 1
      fi
      echo "  Pinned SHA OK: $source_sha"
    fi
  fi

  # Bun version check — the binary embeds the Bun runtime, so it MUST
  # match what cli-deps.json pins. Mismatched Bun produces a
  # nominally-working binary but with subtle behavioral differences
  # that bite at runtime; we'd rather fail at build time.
  if [ -n "$bun_version" ]; then
    if ! command -v bun >/dev/null 2>&1; then
      echo "ERROR: bun is required to build composio for Windows" >&2
      echo "  curl -fsSL https://bun.sh/install | bash -s 'bun-v$bun_version'" >&2
      exit 1
    fi
    local actual_bun
    actual_bun=$(bun --version)
    if [ "$actual_bun" != "$bun_version" ]; then
      echo "ERROR: Bun version mismatch (have $actual_bun, need $bun_version)" >&2
      echo "  curl -fsSL https://bun.sh/install | bash -s 'bun-v$bun_version'" >&2
      exit 1
    fi
    echo "  Pinned Bun OK: $actual_bun"
  fi

  if ! command -v pnpm >/dev/null 2>&1 && ! command -v corepack >/dev/null 2>&1; then
    echo "ERROR: pnpm or corepack is required to build composio" >&2
    exit 1
  fi

  echo "  pnpm install (deps for fork build)..."
  ( cd "$fork_dir" && pnpm install --frozen-lockfile --prefer-offline ) 2>&1 | tail -5

  echo "  pnpm build for workspace deps of @composio/cli..."
  ( cd "$fork_dir" && pnpm -r --filter '@composio/cli^...' run build ) 2>&1 | tail -3

  echo "  tsdown bundle for @composio/cli..."
  ( cd "$fork_dir/$package_path" && pnpm exec tsdown ) 2>&1 | tail -3

  echo "  bun build:binary:cross --target $bun_target ..."
  ( cd "$fork_dir/$package_path" && pnpm run build:binary:cross -- --target "$bun_target" ) 2>&1 | tail -3

  local dist_dir="$fork_dir/$package_path/dist/binaries"
  local exe_path="$dist_dir/${artifact_basename}.exe"
  if [ ! -f "$exe_path" ]; then
    echo "ERROR: expected composio Windows binary not produced: $exe_path" >&2
    find "$dist_dir" -maxdepth 2 -type f | head -10 >&2
    exit 1
  fi

  local dest_dir="$OUT_DIR/composio-$rust_arch"
  rm -rf "$dest_dir"
  mkdir -p "$dest_dir"

  cp "$exe_path" "$dest_dir/composio.exe"
  if [ -d "$dist_dir/companions" ]; then
    # Companions sit next to the binary at runtime — Bun's compiled
    # binary looks them up via `import.meta.url` resolution. Flatten
    # the `companions/` subtree directly into `dest_dir/`.
    cp -R "$dist_dir/companions/." "$dest_dir/"
  else
    echo "ERROR: composio companions/ dir missing — Bun build did not stage acp-adapters + .mjs sidecars" >&2
    exit 1
  fi

  prune_acp_adapters "$dest_dir" "win32-$arch"

  echo "  Installed: $dest_dir/ ($(du -sh "$dest_dir" | cut -f1))"

  if [ -z "${COMPOSIO_FORK_PATH:-}" ]; then
    rm -rf "$fork_dir"
  fi
}

# ---------------------------------------------------------------------------
# SkillSpector (macOS) — NVIDIA's agent-skill security scanner.
#
# Unlike codex/composio/gemini there is no prebuilt binary and no PyPI
# release: SkillSpector is a Python 3.12/3.13 package installed from a
# pinned git SHA. We ship it as a relocatable python-build-standalone
# interpreter with the package + deps installed into the interpreter's
# own site-packages, staged per-arch at resources/bin/skillspector-{aarch64
# |x86_64}/ — the same per-arch directory model as composio/gemini.
#
# A real relocatable interpreter is chosen over a PyInstaller freeze on
# purpose: SkillSpector locates its bundled YARA rules via Path(__file__),
# which a frozen _MEIPASS layout silently breaks (the scanner then compiles
# zero rules and passes every skill). A real interpreter keeps __file__
# correct so all four rule files load — the smoke scan below asserts this.
#
# Built per-arch. arm64 builds natively; the x86_64 slice runs its downloaded
# x86_64 CPython under Rosetta on the Apple Silicon runner (uv drives the
# install through it). Every dep ships an x86_64 + arm64 macOS wheel except a
# couple (cryptography) that build from sdist under Rosetta. Staging is
# best-effort (see the dispatch): a failure on one arch is non-fatal and just
# ships without the scanner there — the app degrades cleanly.
stage_skillspector_arch_darwin() {
  local arch="$1"
  local platform="darwin-$arch"
  local source_repo source_sha python_download python_platform version
  version=$(jq -r '.skillspector.version' "$DEPS_FILE")
  source_repo=$(jq -r ".skillspector.build[\"$platform\"].source_repo // empty" "$DEPS_FILE")
  source_sha=$(jq -r ".skillspector.build[\"$platform\"].source_sha // empty" "$DEPS_FILE")
  python_download=$(jq -r ".skillspector.build[\"$platform\"].python_download // empty" "$DEPS_FILE")
  python_platform=$(jq -r ".skillspector.build[\"$platform\"].python_platform // empty" "$DEPS_FILE")

  for v in "$source_repo" "$source_sha" "$python_download" "$python_platform"; do
    if [ -z "$v" ]; then
      echo "ERROR: skillspector.build.$platform is missing required fields in cli-deps.json" >&2
      exit 1
    fi
  done

  if ! command -v uv >/dev/null 2>&1; then
    echo "ERROR: uv is required to build skillspector" >&2
    echo "  brew install uv   (or: curl -LsSf https://astral.sh/uv/install.sh | sh)" >&2
    exit 1
  fi

  local rust_arch
  case "$arch" in
    arm64) rust_arch="aarch64" ;;
    x64)   rust_arch="x86_64" ;;
  esac
  local dest_dir="$OUT_DIR/skillspector-$rust_arch"
  rm -rf "$dest_dir"

  echo "BUILD skillspector v$version ($platform) from $source_repo @ ${source_sha:0:12}"

  # 1. Download the target-arch standalone CPython into an isolated dir.
  local py_install_dir target_py interp_root
  py_install_dir=$(mktemp -d)
  uv python install --install-dir "$py_install_dir" "$python_download" 2>&1 | tail -2
  # Resolve the real interpreter (find -type f does not descend uv's alias
  # symlink dir, so this never picks the unversioned alias).
  target_py=$(find "$py_install_dir" -type f -path '*/bin/python3.*' | grep -E 'python3\.[0-9]+$' | head -1)
  if [ -z "$target_py" ] || [ ! -x "$target_py" ]; then
    echo "ERROR: standalone CPython not found after uv install ($python_download)" >&2
    find "$py_install_dir" -maxdepth 3 -type f | head -20 >&2
    rm -rf "$py_install_dir"
    exit 1
  fi
  interp_root=$(cd "$(dirname "$target_py")/.." && pwd)

  # 2. Copy the interpreter tree into the bundle dir — this is what ships.
  mkdir -p "$dest_dir"
  cp -a "$interp_root/." "$dest_dir/"
  rm -rf "$py_install_dir"

  local bpy
  bpy=$(ls "$dest_dir"/bin/python3.* 2>/dev/null | grep -E 'python3\.[0-9]+$' | head -1)
  if [ -z "$bpy" ] || [ ! -x "$bpy" ]; then
    echo "ERROR: bundle python missing under $dest_dir/bin after copy" >&2
    exit 1
  fi

  # 3. Drop uv's externally-managed marker so we can install into our copy.
  rm -f "$dest_dir"/lib/python3.*/EXTERNALLY-MANAGED

  # 4. Install SkillSpector (pinned SHA) + deps into the interpreter's
  #    site-packages. Native deps resolve as arch wheels via
  #    --python-platform; SkillSpector is pure Python and builds host-side.
  echo "  uv pip install git+...@${source_sha:0:12} (target $python_platform)"
  uv pip install --python "$bpy" --python-platform "$python_platform" \
    "git+${source_repo}@${source_sha}" 2>&1 | tail -3

  # 5. Verify the package + its YARA rules actually landed (a resolve that
  #    found zero wheels would otherwise ship a hollow tree).
  if ! find "$dest_dir" -type d -path '*/site-packages/skillspector' | grep -q .; then
    echo "ERROR: skillspector package not installed for $platform" >&2
    exit 1
  fi
  local n_yara
  n_yara=$(find "$dest_dir" -path '*skillspector/yara_rules/*.yar' | wc -l | tr -d ' ')
  if [ "$n_yara" -lt 4 ]; then
    echo "ERROR: expected >=4 bundled YARA rule files, found $n_yara for $platform" >&2
    exit 1
  fi

  prune_skillspector_tree "$dest_dir"
  adhoc_sign_macho_tree "$dest_dir"

  # 6. Smoke scan: runs the static --no-llm path end to end so a broken prune
  #    or relocation fails the build, not the user. The x86_64 slice runs
  #    under Rosetta on the arm runner; if the interpreter can't exec here
  #    (no Rosetta in dev) skip it — the install above already drove it.
  if "$bpy" -c "" >/dev/null 2>&1; then
    smoke_scan_skillspector "$bpy"
  else
    echo "  ($platform: interpreter not executable on this host — skipping smoke scan)"
  fi

  echo "  Installed: $dest_dir/ ($(du -sh "$dest_dir" | cut -f1))"
}

# Slim the SkillSpector tree by removing only runtime-unused content. Each
# target is import-safe: pip is the installer, grpc_tools is the protoc
# codegen plugin (grpcio itself stays), and the stripped stdlib modules
# (test corpus, IDLE, tkinter, 2to3, ensurepip) are never imported by the
# static scanner. The smoke scan afterwards is the safety net.
prune_skillspector_tree() {
  local dir="$1"
  local before after sp
  before=$(du -sh "$dir" | cut -f1)
  sp=$(echo "$dir"/lib/python3.*/site-packages)
  rm -rf "$sp"/pip "$sp"/pip-*.dist-info \
         "$sp"/grpc_tools "$sp"/grpcio_tools-*.dist-info 2>/dev/null || true
  rm -rf "$dir"/lib/python3.*/test \
         "$dir"/lib/python3.*/idlelib \
         "$dir"/lib/python3.*/tkinter \
         "$dir"/lib/python3.*/turtledemo \
         "$dir"/lib/python3.*/lib2to3 \
         "$dir"/lib/python3.*/ensurepip \
         "$dir"/lib/python3.*/config-* \
         "$dir"/include "$dir"/share 2>/dev/null || true
  find "$dir"/lib -type f -name 'libpython*.a' -delete 2>/dev/null || true
  after=$(du -sh "$dir" | cut -f1)
  echo "  Pruned skillspector tree ($before -> $after)"
}

# Ad-hoc sign every Mach-O in the interpreter tree (the python executable,
# libpython dylib, and every C-extension .so). Same rationale as the gemini
# ad-hoc sign: macOS kills unsigned Mach-Os with SIGKILL the moment the
# engine execs them in `pnpm tauri dev`. release.yml replaces these with
# Developer ID + hardened-runtime signatures before notarization.
adhoc_sign_macho_tree() {
  local dir="$1"
  local count=0 f
  while IFS= read -r -d '' f; do
    if file "$f" | grep -q 'Mach-O'; then
      codesign --force --sign - "$f" 2>/dev/null \
        || { echo "ERROR: ad-hoc codesign failed for $f" >&2; exit 1; }
      count=$((count + 1))
    fi
  done < <(find "$dir" -type f \( -name '*.so' -o -name '*.dylib' -o -path '*/bin/python3.*' \) -print0)
  echo "  Ad-hoc signed $count Mach-O file(s)"
}

# Exercise the bundled scanner end to end on a throwaway clean skill: this
# compiles the YARA rules and parses JSON, so a relocation/prune that broke
# imports or the rule path fails the build here instead of silently shipping
# a scanner that finds nothing. Exit 0 (clean) and 1 (findings) are both
# "ran"; any other code is a real failure.
smoke_scan_skillspector() {
  local pyexe="$1"
  local tmp out rc rules
  tmp=$(mktemp -d)
  printf -- '---\nname: smoke-test\ndescription: smoke test skill\n---\n## Procedure\nSummarize the notes.\n' > "$tmp/SKILL.md"

  # Invoke via the import bootstrap (not the console script) — the relocated
  # bundle uses the same path at runtime, so the smoke test exercises the
  # real invocation on every OS.
  local boot="from skillspector.cli import app; app()"
  set +e
  out=$(env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u NVIDIA_INFERENCE_KEY \
        "$pyexe" -c "$boot" scan "$tmp" --no-llm --format json 2>"$tmp/err")
  rc=$?
  set -e
  if [ "$rc" -ne 0 ] && [ "$rc" -ne 1 ]; then
    echo "ERROR: skillspector smoke scan failed (exit $rc)" >&2
    cat "$tmp/err" >&2
    rm -rf "$tmp"
    exit 1
  fi
  if ! echo "$out" | jq -e '.risk_assessment.recommendation' >/dev/null 2>&1; then
    echo "ERROR: skillspector smoke scan did not emit parseable JSON" >&2
    echo "$out" | head -5 >&2
    rm -rf "$tmp"
    exit 1
  fi

  rules=$(env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u NVIDIA_INFERENCE_KEY \
          "$pyexe" -c "$boot" scan "$tmp" --no-llm -V 2>&1 \
          | grep -oE 'compiled [0-9]+ YARA rule file' | grep -oE '[0-9]+' | head -1)
  rm -rf "$tmp"
  if [ -z "$rules" ] || [ "$rules" -lt 4 ]; then
    echo "ERROR: skillspector YARA rules did not compile (got '${rules:-0}', expected >=4)." >&2
    echo "  A relocated scanner that finds zero rules would silently pass every skill." >&2
    exit 1
  fi
  echo "  Smoke scan OK (recommendation parsed, YARA rule files compiled: $rules)"
}

# SkillSpector (Windows) — same model as macOS but the native-runner build.
# Each Windows MSI is built on a runner of its own arch (windows-latest for
# x64, windows-11-arm for arm64), so the interpreter + wheels resolve
# natively; no Rosetta / cross-resolve. python-build-standalone on Windows
# puts python.exe at the tree root with the stdlib under Lib/. No codesigning
# (the v1 MSI ships unsigned). Best-effort like macOS.
stage_skillspector_arch_windows() {
  local arch="$1"
  local platform="windows-$arch"
  local source_repo source_sha python_download python_platform version
  version=$(jq -r '.skillspector.version' "$DEPS_FILE")
  source_repo=$(jq -r ".skillspector.build[\"$platform\"].source_repo // empty" "$DEPS_FILE")
  source_sha=$(jq -r ".skillspector.build[\"$platform\"].source_sha // empty" "$DEPS_FILE")
  python_download=$(jq -r ".skillspector.build[\"$platform\"].python_download // empty" "$DEPS_FILE")
  python_platform=$(jq -r ".skillspector.build[\"$platform\"].python_platform // empty" "$DEPS_FILE")

  for v in "$source_repo" "$source_sha" "$python_download" "$python_platform"; do
    if [ -z "$v" ]; then
      echo "ERROR: skillspector.build.$platform is missing required fields in cli-deps.json" >&2
      exit 1
    fi
  done
  if ! command -v uv >/dev/null 2>&1; then
    echo "ERROR: uv is required to build skillspector" >&2
    exit 1
  fi

  local rust_arch
  case "$arch" in
    arm64) rust_arch="aarch64" ;;
    x64)   rust_arch="x86_64" ;;
  esac
  local dest_dir="$OUT_DIR/skillspector-$rust_arch"
  rm -rf "$dest_dir"

  echo "BUILD skillspector v$version ($platform) from $source_repo @ ${source_sha:0:12}"

  local py_install_dir target_py interp_root
  py_install_dir=$(mktemp -d)
  uv python install --install-dir "$py_install_dir" "$python_download" 2>&1 | tail -2
  target_py=$(find "$py_install_dir" -maxdepth 2 -name 'python.exe' | head -1)
  if [ -z "$target_py" ]; then
    echo "ERROR: standalone CPython not found after uv install ($python_download)" >&2
    find "$py_install_dir" -maxdepth 3 -type f | head -20 >&2
    rm -rf "$py_install_dir"
    exit 1
  fi
  interp_root=$(dirname "$target_py")

  mkdir -p "$dest_dir"
  cp -a "$interp_root/." "$dest_dir/"
  rm -rf "$py_install_dir"

  local bpy="$dest_dir/python.exe"
  if [ ! -f "$bpy" ]; then
    echo "ERROR: bundle python.exe missing under $dest_dir after copy" >&2
    exit 1
  fi

  # Drop uv's externally-managed marker wherever it landed (Lib/ on Windows)
  # so we can install into our private copy.
  find "$dest_dir" -name 'EXTERNALLY-MANAGED' -delete 2>/dev/null || true

  echo "  uv pip install git+...@${source_sha:0:12} (target $python_platform)"
  uv pip install --python "$bpy" --python-platform "$python_platform" \
    "git+${source_repo}@${source_sha}" 2>&1 | tail -3

  if ! find "$dest_dir" -type d -path '*/site-packages/skillspector' | grep -q .; then
    echo "ERROR: skillspector package not installed for $platform" >&2
    exit 1
  fi
  local n_yara
  n_yara=$(find "$dest_dir" -path '*skillspector/yara_rules/*.yar' | wc -l | tr -d ' ')
  if [ "$n_yara" -lt 4 ]; then
    echo "ERROR: expected >=4 bundled YARA rule files, found $n_yara for $platform" >&2
    exit 1
  fi

  prune_skillspector_tree_windows "$dest_dir"

  if "$bpy" -c "" >/dev/null 2>&1; then
    smoke_scan_skillspector "$bpy"
  else
    echo "  ($platform: interpreter not executable here — skipping smoke scan)"
  fi

  echo "  Installed: $dest_dir/ ($(du -sh "$dest_dir" | cut -f1))"
}

# Windows stdlib lives under Lib/ (not lib/python3.x/); same import-safe
# prune targets as the macOS tree.
prune_skillspector_tree_windows() {
  local dir="$1"
  local before after sp
  before=$(du -sh "$dir" | cut -f1)
  sp="$dir/Lib/site-packages"
  rm -rf "$sp"/pip "$sp"/pip-*.dist-info \
         "$sp"/grpc_tools "$sp"/grpcio_tools-*.dist-info 2>/dev/null || true
  rm -rf "$dir"/Lib/test \
         "$dir"/Lib/idlelib \
         "$dir"/Lib/tkinter \
         "$dir"/Lib/turtledemo \
         "$dir"/Lib/lib2to3 \
         "$dir"/Lib/ensurepip 2>/dev/null || true
  after=$(du -sh "$dir" | cut -f1)
  echo "  Pruned skillspector tree ($before -> $after)"
}

# ---------------------------------------------------------------------------
# Pre-flight: clean any stale artifacts so a re-run produces a known layout.
# Removing the full bin dir is safe — every artifact in there is
# reproducible from cli-deps.json.
# ---------------------------------------------------------------------------
rm -rf "$OUT_DIR/.staging" \
       "$OUT_DIR/codex" "$OUT_DIR/codex.exe" \
       "$OUT_DIR/composio-"* \
       "$OUT_DIR/gemini-"* \
       "$OUT_DIR/skillspector-"* \
       "$OUT_DIR/cli-deps.json"

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

case "$TARGET_OS" in
  darwin)
    for arch in "${ARCHES[@]}"; do
      stage_codex_arch_darwin "$arch"
      fetch_composio_arch_darwin "$arch"
      stage_gemini_arch_darwin "$arch"
      # SkillSpector is an optional security enhancement, staged best-effort:
      # a build failure (e.g. an x86_64 dep that won't compile under Rosetta,
      # or no Rosetta in dev) is non-fatal and just ships without the scanner
      # for that arch — the app degrades cleanly. The subshell isolates the
      # function's `exit`, and the partial tree is removed so nothing hollow
      # ships. arm64 is fully wheel-covered; x86_64 runs under Rosetta.
      case "$arch" in arm64) ss_ra="aarch64" ;; x64) ss_ra="x86_64" ;; esac
      ( stage_skillspector_arch_darwin "$arch" ) || {
        echo "::warning::skillspector scanner NOT bundled for darwin-$arch (build failed; install still works without the pre-scan)" >&2
        rm -rf "$OUT_DIR/skillspector-$ss_ra"
      }
    done

    if [ "${#ARCHES[@]}" -eq 2 ]; then
      lipo_codex_universal_darwin
    else
      finalize_codex_single_arch_darwin "${ARCHES[0]}"
    fi
    ;;
  windows)
    for arch in "${ARCHES[@]}"; do
      stage_codex_windows "$arch"
      build_composio_windows "$arch"
      stage_git_bash_windows "$arch"
      # Best-effort, same rationale as macOS. x64 is fully wheel-covered;
      # arm64 may compile a few deps from sdist on the native ARM runner.
      case "$arch" in arm64) ss_ra="aarch64" ;; x64) ss_ra="x86_64" ;; esac
      ( stage_skillspector_arch_windows "$arch" ) || {
        echo "::warning::skillspector scanner NOT bundled for windows-$arch (build failed; install still works without the pre-scan)" >&2
        rm -rf "$OUT_DIR/skillspector-$ss_ra"
      }
    done
    ;;
  *)
    echo "ERROR: dispatch reached unknown target OS '$TARGET_OS'" >&2
    exit 1 ;;
esac

# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------

echo "STAGE cli-deps.json (runtime claude-code install manifest)"
stage_manifest

# ---------------------------------------------------------------------------
# Summary + final sanity assertions
# ---------------------------------------------------------------------------
echo ""
echo "Done. Bundled CLIs:"
du -sh "$OUT_DIR"/* 2>/dev/null | sort -k2 || echo "  (none)"

missing=()
case "$TARGET_OS" in
  darwin)
    [ -x "$OUT_DIR/codex" ] || missing+=("codex")
    if [ "${#ARCHES[@]}" -eq 2 ]; then
      [ -x "$OUT_DIR/composio-aarch64/composio" ] || missing+=("composio-aarch64/composio")
      [ -x "$OUT_DIR/composio-x86_64/composio" ]  || missing+=("composio-x86_64/composio")
      [ -x "$OUT_DIR/gemini-aarch64/gemini" ]     || missing+=("gemini-aarch64/gemini")
      [ -x "$OUT_DIR/gemini-x86_64/gemini" ]      || missing+=("gemini-x86_64/gemini")
    fi
    ;;
  windows)
    [ -f "$OUT_DIR/codex.exe" ] || missing+=("codex.exe")
    # Verify only the arches that were actually requested. Previously
    # this hardcoded composio-x86_64/... paths which made
    # `windows-arm64` (and any future single-arch mode) fail at the
    # tail check even when the requested arch built cleanly.
    for arch in "${ARCHES[@]}"; do
      # ARCHES holds the mode-arg arch names: `x64` / `arm64` (NOT
      # `x86_64` / `aarch64` — see the case block at the top of this
      # file). The staged composio dir uses Rust-style arch names
      # (matching build_composio_windows' `dest_dir`), and the
      # codex-acp adapter dir is `win32-<mode-arch>` to match
      # prune_acp_adapters' `win32-$arch` keep_platform string.
      case "$arch" in
        x64)   bun_dir="composio-x86_64";  acp_target="win32-x64"   ;;
        arm64) bun_dir="composio-aarch64"; acp_target="win32-arm64" ;;
        *) echo "ERROR: unknown windows arch '$arch' in verification block" >&2; exit 1 ;;
      esac
      [ -f "$OUT_DIR/$bun_dir/composio.exe" ] || missing+=("$bun_dir/composio.exe")
      [ -f "$OUT_DIR/$bun_dir/run-helpers-runtime.mjs" ] || missing+=("$bun_dir/run-helpers-runtime.mjs")
      [ -f "$OUT_DIR/$bun_dir/acp-adapters/codex/$acp_target/codex-acp.exe" ] || missing+=("$bun_dir/acp-adapters/codex/$acp_target/codex-acp.exe")
    done
    ;;
esac
[ -f "$OUT_DIR/cli-deps.json" ] || missing+=("cli-deps.json")

if [ "${#missing[@]}" -gt 0 ]; then
  echo "ERROR: missing artifacts after fetch: ${missing[*]}" >&2
  exit 1
fi

# SkillSpector is best-effort (a build failure ships without the scanner for
# that arch). Report coverage so a missing arch is visible in the logs rather
# than a silent gap; it never fails the build.
echo "SkillSpector coverage:"
for d in "$OUT_DIR"/skillspector-*; do
  [ -d "$d" ] || { echo "  (none staged)"; break; }
  echo "  $(basename "$d") ($(du -sh "$d" | cut -f1))"
done
