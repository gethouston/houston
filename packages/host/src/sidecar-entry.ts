// The single compiled-sidecar entry. `bun build --compile` bundles THIS file
// into one binary that the packaged .app spawns. It runs as the HOST by default,
// or as a pi RUNTIME when HOUSTON_SIDECAR_ROLE=runtime — and the host spawns
// ITSELF (same binary) in runtime mode, so the packaged app needs no `bun` and
// no repo source to launch a runtime.
//
// Build-only: this file does a cross-package dynamic import (../../runtime), so
// it is excluded from the host's tsgo typecheck (see tsconfig.json
// `exclude`). bun's bundler — not tsgo — resolves the import at compile time.

// Record our own path so the host's runtimeCommand() can spawn this same binary
// (and so it knows it is the compiled sidecar, not `tsx <source>`).
process.env.HOUSTON_SIDECAR_BINARY = process.execPath;

if (process.env.HOUSTON_SIDECAR_ROLE === "runtime") {
  await import("../../runtime/src/main.ts");
} else {
  await import("./local/main.ts");
}
