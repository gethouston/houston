#!/usr/bin/env bash
# ldd shim used ONLY during AppImage bundling (installed at the front of PATH by
# the Linux CI job).
#
# linuxdeploy runs `ldd` on every ELF in the AppDir to discover the shared
# libraries it must bundle. Three of our externalBins can't be traced by `ldd`
# and make it exit non-zero, which aborts the whole bundle with:
#     terminate called after throwing an instance of 'std::runtime_error'
#       what():  Failed to run ldd: exited with code 1
#   * houston-engine — self-contained Bun-compiled sidecar; `ldd` ends up
#     executing it, it ignores LD_TRACE_LOADED_OBJECTS and exits non-zero.
#   * claude         — self-contained Claude Code binary, same story.
#   * frpc           — static Go binary; `ldd` prints "not a dynamic executable"
#     and exits 1.
#
# All three bundle their own runtime (or are static) and only need the ordinary
# system libc, so they have NO libraries for linuxdeploy to deploy. Report each
# as "not a dynamic executable" with a success exit so linuxdeploy deploys
# nothing for them and moves on, and defer to the real ldd for every other file
# (so genuine library resolution is unaffected). Any future self-contained
# externalBin must be added to the match below.
set -euo pipefail

for arg in "$@"; do
  case "$arg" in
    -*) continue ;; # flags such as --version / --help
    *houston-engine* | *claude* | *frpc*)
      printf '\tnot a dynamic executable\n'
      exit 0
      ;;
  esac
done

exec /usr/bin/ldd "$@"
