#!/usr/bin/env bash
set -euo pipefail

WHISPER_VERSION="${WHISPER_VERSION:-1.9.1}"
WHISPER_SHA256="${WHISPER_SHA256:-147267177eef7b22ec3d2476dd514d1b12e160e176230b740e3d1bd600118447}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/target/whisper"
MACOS_DEPLOYMENT_TARGET="10.15"

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

case "$TRIPLE" in
  aarch64-apple-darwin)       OS="macos";   ARCH="aarch64"; OSX_ARCH="arm64";  BIN_EXT="" ;;
  x86_64-apple-darwin)        OS="macos";   ARCH="x86_64";  OSX_ARCH="x86_64"; BIN_EXT="" ;;
  x86_64-unknown-linux-gnu)   OS="linux";   ARCH="x86_64";  OSX_ARCH="";       BIN_EXT="" ;;
  aarch64-unknown-linux-gnu)  OS="linux";   ARCH="aarch64"; OSX_ARCH="";       BIN_EXT="" ;;
  x86_64-pc-windows-msvc)     OS="windows"; ARCH="x86_64";  OSX_ARCH="";       BIN_EXT=".exe" ;;
  aarch64-pc-windows-msvc)    OS="windows"; ARCH="aarch64"; OSX_ARCH="";       BIN_EXT=".exe" ;;
  *) echo "ERROR: unsupported triple '$TRIPLE'" >&2; exit 1 ;;
esac

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
    CMAKE_FLAGS+=(
      -DGGML_NATIVE=OFF
      -DGGML_METAL=ON
      -DGGML_METAL_EMBED_LIBRARY=ON
      -DGGML_BLAS=OFF
      "-DCMAKE_OSX_ARCHITECTURES=${OSX_ARCH}"
      "-DCMAKE_OSX_DEPLOYMENT_TARGET=${MACOS_DEPLOYMENT_TARGET}"
    )
    ;;
  windows | linux)
    CMAKE_FLAGS+=(-DGGML_NATIVE=OFF)
    if [ "$ARCH" = "x86_64" ]; then
      CMAKE_FLAGS+=(
        -DGGML_SSE42=ON
        -DGGML_AVX=ON
        -DGGML_AVX2=ON
        -DGGML_BMI2=ON
        -DGGML_FMA=ON
        -DGGML_F16C=ON
        -DGGML_AVX512=OFF
      )
    fi
    if [ "$OS" = "windows" ]; then
      CMAKE_FLAGS+=(
        -DCMAKE_POLICY_DEFAULT_CMP0091=NEW
        -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded
      )
    fi
    if [ "$OS" = "windows" ] && [ "$ARCH" = "aarch64" ]; then
      CMAKE_FLAGS+=(-T ClangCL -A ARM64)
    fi
    ;;
esac

echo "  configuring…"
cmake -S "$SRC" -B "$BUILD" "${CMAKE_FLAGS[@]}"

echo "  building whisper-cli…"
cmake --build "$BUILD" --config Release --target whisper-cli -j

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

if [ "$OS" = "windows" ]; then
  if grep -qai -e 'MSVCP140' -e 'VCRUNTIME140' -e 'CONCRT140' "$BUILT"; then
    echo "ERROR: whisper-cli imports the dynamic VC++ runtime (MSVCP140/VCRUNTIME140) — expected a statically linked CRT" >&2
    exit 1
  fi
  echo "  CRT check OK (no VC++ redistributable dependency)"
fi

mkdir -p "$OUT_DIR"
cp "$BUILT" "$DEST"
chmod 0755 "$DEST"

echo "  staged → ${DEST}"
echo "Done. build.rs will copy this into app/src-tauri/binaries/whisper-cli-${TRIPLE}${BIN_EXT}."
