# Final cutover — the LAST, gated step (do NOT run before the live gate)

Everything else in the convergence is done. This is the one irreversible step left:
**delete the Rust `engine/` and make the host the default desktop build.**

It is deliberately NOT executed by the autonomous finish pass, because `engine/` is
the **rollback oracle** and the **parity oracle** — and the live half of the parity
gate (`convergence/parity-checklist.md` Section 2, ~14 manual rows) can only be run
by a human on the packaged app with a real provider. This sequencing is the
consultant's P0 ("keep the Rust build as rollback oracle until the release gate
passes") and is correct: deleting the oracle before the live gate is the one shortcut
we will not take.

## Preconditions (ALL must be green first)

1. The live parity gate passes — `convergence/parity-checklist.md` Section 2, run on a
   **notarized packaged `.app`** (see `convergence/packaged-app-launch.md`), with a real
   provider, including the migrated-conversation recall rows and the force-quit/no-orphan row.
2. The host-sidecar release builds are produced + launched on macOS, Windows, and Linux
   (`.github/workflows/host-sidecar-release.yml`).
3. The migration gate is confirmed on the real `~/.houston` (already verified on a copy —
   `convergence/migration-gate.md`; re-confirm on the live machine).

## Step 1 — tag the rollback oracle

```sh
git tag pre-host-cutover-rust-oracle
git push origin pre-host-cutover-rust-oracle   # needs your auth
```
Everything below is recoverable by checking out this tag. Because migration is
copy-never-move, a downgraded Rust build also keeps working on the user's data.

## Step 2 — flip the default to the host

Make `VITE_NEW_ENGINE` / the host-sidecar the DEFAULT (not flag-gated):
- `app/` build config: default `VITE_NEW_ENGINE=1` (today the Rust path is default; the
  host path is behind the flag — `app/vite.config.ts`, `app/src/lib/engine.ts`).
- `app/src-tauri`: make `host-sidecar` the default cargo feature (today it is opt-in;
  `app/src-tauri/Cargo.toml`), and the supervisor spawns the host sidecar unconditionally.
- `release.yml`: build the app with the host sidecar (as `host-sidecar-release.yml` does),
  retire the Rust-engine sidecar staging.

## Step 3 — delete the legacy Rust + CLI surface

Only after Steps 1–2 and a green build:
- `engine/` (the whole Rust workspace — ~17 crates).
- The CLI-bundling pipeline: `scripts/fetch-cli-deps.sh`, the `build.rs` engine/CLI staging,
  `cli-deps.json`, the claude-installer + per-arch Composio CLI fetch.
- Gemini legacy (only in `engine/` + the legacy `ui/engine-client` v1 client — both go here).
- `.github/workflows/engine-release.yml` (the standalone Rust engine release).
- The legacy `ui/engine-client` v1 transport (the app's v3 path uses the QA'd adapter; once
  the Rust default is gone, the v1 client has no consumer — see `convergence/follow-ups.md`
  for the cleaner consolidation).
- `app/src-tauri/src/engine_supervisor.rs` Rust-engine spawn branch (keep the shared
  supervisor; drop the Rust-engine-specific path now that only the host sidecar is spawned).

## Step 4 — verify + ship

- `pnpm -r typecheck`, `pnpm check`, `pnpm check:boundaries`, Vitest suites in
  `packages/{host,host-cloud,runtime,domain}` — all green.
- `cd app/src-tauri && cargo check` (now host-sidecar-default) — compiles.
- Build + notarize the packaged app; smoke-test one real turn.
- Doc sweep: mark the `knowledge-base/engine-*.md` + `cli-bundling.md` files HISTORICAL
  (the headers already flag them legacy), update `CLAUDE.md`'s "two engines coexist" framing
  to "one host" (see `convergence/follow-ups.md`).

## Rollback

`git checkout pre-host-cutover-rust-oracle` rebuilds the Rust-engine desktop app. User
data is untouched by the host path beyond additive `.houston/runtime/**` files, so a Rust
build reads the same workspaces. No data migration is reversed.
