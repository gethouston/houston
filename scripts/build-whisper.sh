#!/usr/bin/env bash
# ============================================================================
# Build the ggml-org/whisper.cpp `whisper-cli` binary for a target platform and
# stage it where `app/src-tauri/build.rs` (`stage_whisper_sidecar`) picks it up
# for Tauri's `externalBin` bundling as `binaries/whisper-cli-<triple>`.
#
# whisper-cli is the local-dictation sidecar the desktop spawns to transcribe
# microphone audio for voice typing in the chat box (no cloud round-trip).
# whisper.cpp is MIT.
#
# The pinned source tarball is SHA256-verified before building. The binary is
# built fully static (`-DBUILD_SHARED_LIBS=OFF`) so it carries no whisper/ggml
# shared-library dependency, and on macOS Metal is embedded into the binary
# (`-DGGML_METAL_EMBED_LIBRARY=ON`) so there is no sibling `.metallib` to ship.
# On macOS the result is verified dylib-free with `otool -L`.
#
# Output:
#   target/whisper/whisper-cli-<rust-triple>          (macOS / Linux)
#   target/whisper/whisper-cli-<rust-triple>.exe      (Windows)
#
# Usage:
#   scripts/build-whisper.sh                    # current host triple
#   scripts/build-whisper.sh <rust-triple>      # an explicit target (CI, per-arch)
#
# Supported <rust-triple>:
#   aarch64-apple-darwin, x86_64-apple-darwin,
#   x86_64-unknown-linux-gnu, aarch64-unknown-linux-gnu,
#   x86_64-pc-windows-msvc, aarch64-pc-windows-msvc
#
# On macOS a non-host arch is cross-built via CMAKE_OSX_ARCHITECTURES (this is
# how the release workflow produces both slices for the universal lipo). On
# Linux/Windows the requested arch must match the host arch (each release runner
# builds its own arch natively) — a mismatch is rejected.
#
# Override the whisper.cpp version with WHISPER_VERSION (default below); update
# WHISPER_SHA256 to match when bumping.
# ============================================================================
set -euo pipefail

WHISPER_VERSION="${WHISPER_VERSION:-1.9.1}"
# SHA256 of https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v${WHISPER_VERSION}.tar.gz
WHISPER_SHA256="${WHISPER_SHA256:-147267177eef7b22ec3d2476dd514d1b12e160e176230b740e3d1bd600118447}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/target/whisper"
# macOS deployment target — kept in sync with tauri.conf.json minimumSystemVersion.
MACOS_DEPLOYMENT_TARGET="10.15"

# Rust-arch token ("aarch64"/"x86_64") of the current host, for the
# same-OS/same-arch guard on Linux and Windows.
#
# On Windows, Git Bash / MSYS2 is an x86_64 build that runs under the Windows-on-
# ARM x64 emulator on ARM64 runners, so `uname -m` reports "x86_64" even when the
# CPU is ARM64 — which falsely tripped the native-arch guard on the
# `windows-11-arm` runner (every other tool here — rustc, bun — detects aarch64
# correctly). Resolve the REAL CPU arch from signals that survive the emulation,
# in order of authority:
#   1. RUNNER_ARCH — set by GitHub Actions to the runner's true arch (ARM64/X64),
#      guaranteed present + correct in CI (where this guard misfired).
#   2. PROCESSOR_ARCHITEW6432 — set by Windows only inside an emulated/WOW
#      process, where it holds the native host arch (ARM64 for x64-on-ARM).
#   3. PROCESSOR_ARCHITECTURE — the process-visible arch (AMD64 on a native x64
#      host, or under emulation when #2 is absent).
# Fall through to `uname -m` for non-Windows hosts and local shells that set none.
host_arch() {
  case "${RUNNER_ARCH:-}" in
    ARM64 | arm64 | aarch64) echo "aarch64"; return ;;
    X64 | x64 | AMD64 | amd64 | x86_64) echo "x86_64"; return ;;
  esac
  case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN*)
      case "${PROCESSOR_ARCHITEW6432:-${PROCESSOR_ARCHITECTURE:-}}" in
        ARM64 | arm64 | aarch64) echo "aarch64"; return ;;
        AMD64 | amd64 | x86_64) echo "x86_64"; return ;;
      esac
      ;;
  esac
  case "$(uname -m)" in
    arm64 | aarch64) echo "aarch64" ;;
    x86_64 | amd64) echo "x86_64" ;;
    *) echo "ERROR: unsupported host arch $(uname -m)" >&2; exit 1 ;;
  esac
}

# Derive the Rust target triple for the current host (matches the suffix
# tauri-cli appends to `externalBin` names). Reuses host_arch() so the Windows-on-
# ARM detection fix applies to a no-arg local invocation too.
host_triple() {
  local arch os
  arch="$(host_arch)"
  case "$(uname -s)" in
    Darwin) os="apple-darwin" ;;
    Linux) os="unknown-linux-gnu" ;;
    MINGW* | MSYS* | CYGWIN*) os="pc-windows-msvc" ;;
    *) echo "ERROR: unsupported host OS $(uname -s)" >&2; exit 1 ;;
  esac
  echo "${arch}-${os}"
}

TRIPLE="${1:-$(host_triple)}"

# Map a Rust triple to the target OS, the Rust-arch token, the macOS Apple-arch
# token (for CMAKE_OSX_ARCHITECTURES), and the staged binary's extension.
case "$TRIPLE" in
  aarch64-apple-darwin)       OS="macos";   ARCH="aarch64"; OSX_ARCH="arm64";  BIN_EXT="" ;;
  x86_64-apple-darwin)        OS="macos";   ARCH="x86_64";  OSX_ARCH="x86_64"; BIN_EXT="" ;;
  x86_64-unknown-linux-gnu)   OS="linux";   ARCH="x86_64";  OSX_ARCH="";       BIN_EXT="" ;;
  aarch64-unknown-linux-gnu)  OS="linux";   ARCH="aarch64"; OSX_ARCH="";       BIN_EXT="" ;;
  x86_64-pc-windows-msvc)     OS="windows"; ARCH="x86_64";  OSX_ARCH="";       BIN_EXT=".exe" ;;
  aarch64-pc-windows-msvc)    OS="windows"; ARCH="aarch64"; OSX_ARCH="";       BIN_EXT=".exe" ;;
  *) echo "ERROR: unsupported triple '$TRIPLE'" >&2; exit 1 ;;
esac

# Linux/Windows build natively per-arch (no cross toolchain here); reject an
# arch that doesn't match the host. macOS cross-builds any arch via
# CMAKE_OSX_ARCHITECTURES, so it is exempt from this guard.
if [ "$OS" != "macos" ] && [ "$ARCH" != "$(host_arch)" ]; then
  echo "ERROR: cannot build $TRIPLE on a $(host_arch) host — build each $OS arch on its native runner" >&2
  exit 1
fi

command -v cmake >/dev/null 2>&1 || { echo "ERROR: cmake not found (required to build whisper.cpp)" >&2; exit 1; }

TAG="v${WHISPER_VERSION}"
ASSET="whisper.cpp-${WHISPER_VERSION}.tar.gz"
INNER_DIR="whisper.cpp-${WHISPER_VERSION}"
TARBALL_URL="https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${TAG}.tar.gz"

DEST="$OUT_DIR/whisper-cli-${TRIPLE}${BIN_EXT}"

echo "whisper.cpp ${TAG} · ${TRIPLE} → whisper-cli"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "  downloading source tarball…"
curl -fsSL "$TARBALL_URL" -o "$TMP/$ASSET"

# Verify SHA256 against the pinned checksum.
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$TMP/$ASSET" | awk '{print $1}')"
else
  ACTUAL="$(shasum -a 256 "$TMP/$ASSET" | awk '{print $1}')"
fi
if [ "$WHISPER_SHA256" != "$ACTUAL" ]; then
  echo "ERROR: SHA256 mismatch for ${ASSET}" >&2
  echo "  expected: $WHISPER_SHA256" >&2
  echo "  actual:   $ACTUAL" >&2
  exit 1
fi
echo "  sha256 OK"

echo "  extracting source…"
tar -xzf "$TMP/$ASSET" -C "$TMP"
SRC="$TMP/$INNER_DIR"
BUILD="$TMP/build"

# Common CMake flags: static libs (self-contained binary, no whisper/ggml
# dylib), no OpenMP (avoids a libomp/libgomp shared dep), CLI only.
CMAKE_FLAGS=(
  -DCMAKE_BUILD_TYPE=Release
  -DBUILD_SHARED_LIBS=OFF
  -DGGML_OPENMP=OFF
  -DWHISPER_BUILD_TESTS=OFF
  -DWHISPER_BUILD_EXAMPLES=ON
  -DWHISPER_BUILD_SERVER=OFF
)
case "$OS" in
  macos)
    # Metal embedded into the binary → no sibling .metallib to ship.
    # BLAS is disabled: whisper.cpp defaults GGML_BLAS=ON on Apple (Accelerate),
    # but Accelerate's new cblas ILP64 entry points are weak-linked and marked
    # available only on macOS 13.3+, which would crash on our 10.15 floor. Metal
    # is the accelerator on Apple anyway; the CPU fallback uses ggml's own kernels.
    CMAKE_FLAGS+=(
      -DGGML_METAL=ON
      -DGGML_METAL_EMBED_LIBRARY=ON
      -DGGML_BLAS=OFF
      "-DCMAKE_OSX_ARCHITECTURES=${OSX_ARCH}"
      "-DCMAKE_OSX_DEPLOYMENT_TARGET=${MACOS_DEPLOYMENT_TARGET}"
    )
    ;;
  windows | linux)
    # CPU-only, portable across CPUs (no -march=native), self-contained.
    CMAKE_FLAGS+=(-DGGML_NATIVE=OFF)
    # ggml hard-refuses plain MSVC for ARM64 ("MSVC is not supported for ARM,
    # use clang" — ggml-cpu/CMakeLists.txt): its ARM kernels need clang's
    # NEON/ACLE intrinsics. Visual Studio's bundled ClangCL toolset compiles
    # arm64 natively on the windows-11-arm runners while keeping the MSVC
    # ABI + linker, which satisfies ggml's compiler check.
    if [ "$OS" = "windows" ] && [ "$ARCH" = "aarch64" ]; then
      CMAKE_FLAGS+=(-T ClangCL -A ARM64)
    fi
    ;;
esac

echo "  configuring…"
cmake -S "$SRC" -B "$BUILD" "${CMAKE_FLAGS[@]}"

echo "  building whisper-cli…"
cmake --build "$BUILD" --config Release --target whisper-cli -j

# Locate the built binary: single-config generators emit build/bin/whisper-cli;
# multi-config (Visual Studio) emit build/bin/Release/whisper-cli.exe.
BUILT=""
for cand in \
  "$BUILD/bin/whisper-cli${BIN_EXT}" \
  "$BUILD/bin/Release/whisper-cli${BIN_EXT}"; do
  if [ -f "$cand" ]; then BUILT="$cand"; break; fi
done
if [ -z "$BUILT" ]; then
  echo "ERROR: whisper-cli binary not found after build under $BUILD/bin" >&2
  exit 1
fi

# On macOS, verify the binary is self-contained: no dependency outside the
# always-present system paths (/usr/lib, /System/Library). A whisper/ggml or
# @rpath dylib dependency means the static/embed flags regressed.
if [ "$OS" = "macos" ] && command -v otool >/dev/null 2>&1; then
  BAD="$(otool -L "$BUILT" | tail -n +2 | awk '{print $1}' \
    | grep -vE '^(/usr/lib/|/System/Library/)' || true)"
  if [ -n "$BAD" ]; then
    echo "ERROR: whisper-cli has non-system dynamic dependencies (expected fully self-contained):" >&2
    echo "$BAD" | awk '{print "  " $0}' >&2
    exit 1
  fi
  echo "  dylib check OK (system-only dependencies)"
fi

mkdir -p "$OUT_DIR"
cp "$BUILT" "$DEST"
chmod 0755 "$DEST"

echo "  staged → ${DEST}"
echo "Done. build.rs will copy this into app/src-tauri/binaries/whisper-cli-${TRIPLE}${BIN_EXT}."
