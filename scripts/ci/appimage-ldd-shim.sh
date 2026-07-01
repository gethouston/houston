#!/usr/bin/env bash
# ldd shim used ONLY during AppImage bundling (installed at the front of PATH by
# the Linux CI job).
#
# linuxdeploy runs `ldd` on every ELF in the AppDir to discover the shared
# libraries it must bundle. Our externalBin sidecar `houston-engine` is a
# self-contained Bun-compiled binary; `ldd` cannot trace it (it ends up executing
# the binary, which does not honour LD_TRACE_LOADED_OBJECTS and exits non-zero),
# so linuxdeploy aborts with:
#     terminate called after throwing an instance of 'std::runtime_error'
#       what():  Failed to run ldd: exited with code 1
#
# The sidecar bundles its own runtime and only needs the ordinary system libc at
# runtime, so it has NO libraries for linuxdeploy to deploy. Report it as "not a
# dynamic executable" with a success exit so linuxdeploy deploys nothing for it
# and moves on, and defer to the real ldd for every other file (so genuine
# library resolution is unaffected).
set -euo pipefail

for arg in "$@"; do
  case "$arg" in
    -*) continue ;; # flags such as --version / --help
    *houston-engine*)
      printf '\tnot a dynamic executable\n'
      exit 0
      ;;
  esac
done

exec /usr/bin/ldd "$@"
