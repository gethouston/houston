# Final cutover — DONE (record of the completed step)

> **Status: performed.** The Rust `engine/` has been deleted and the Houston host
> is the default (and only) desktop engine. This doc is now the record of what the
> cutover did and how to roll back, not a checklist to run.

This was the one irreversible step at the end of the convergence: delete the Rust
`engine/` (the rollback + parity oracle) and make the host the default desktop
build. It was deliberately held until the live parity gate
(`convergence/parity-checklist.md`) passed on a notarized packaged `.app` with a
real provider, because deleting the oracle before that gate was the one shortcut
we would not take. That gate having passed, the cutover was executed as below.

## What the cutover did

### 1. The host is the default (and only) engine
- The desktop frontend aliases `@houston-ai/engine-client` → the v3 host adapter
  **unconditionally** (`app/vite.config.ts`). `VITE_NEW_ENGINE` is now vestigial
  (harmless if set); the URL vars (`VITE_NEW_ENGINE_URL` / `VITE_HOSTED_ENGINE_URL`)
  still select an external / hosted host vs the locally-spawned sidecar.
- The Tauri shell (`app/src-tauri`) spawns the host sidecar as its default and only
  path. The `host-sidecar` cargo feature was **removed** — there is no
  `--features host-sidecar` anymore; a plain `pnpm tauri build` builds the host app.
  (The script `scripts/build-host-sidecar.sh` and the `target/host-sidecar/` output
  dir keep their names; the externalBin is still staged at
  `binaries/houston-engine-<triple>` — the name is kept on purpose so
  `tauri.conf.json` needs no change.)

### 2. Deleted the legacy Rust + CLI surface
- `engine/` — the whole Rust workspace (~17 crates).
- `app/houston-tauri/` — the Tauri adapter crate that bound the Rust engine's
  crates in-process. Nothing to adapt now that the engine is an out-of-process host.
- The CLI-bundling pipeline: `scripts/fetch-cli-deps.sh`, `scripts/bump-cli.sh`,
  `scripts/install-claude-code.sh`, `cli-deps.json`, and the `build.rs` engine/CLI
  staging. pi runs providers in-process, so no codex / composio / gemini / claude
  CLIs ship. (The Gemini *CLI* went with `engine/`; the Google **Gemini API-key
  provider** stays as a pi provider.)
- The legacy `ui/engine-client` v1 REST/WS transport has no consumer anymore (both
  desktop and web alias the v3 adapter). Its `src/types.ts` remains as the shared
  v3 wire-type surface; the v1 client code is kept only pending the v3-client
  consolidation follow-up (`convergence/follow-ups.md`).

### 3. Migration
- The Rust intra-agent data migration (`migrate_agent_data`) was dropped with
  `engine/`. Chat-history migration is owned by the TS host
  (`src/migrate/{chat-history,reconstruct,linkage}.ts`, run on boot), verified on
  real Rust-era `~/.houston` data (`convergence/migration-gate.md`).
- The `~/Documents/Houston → ~/.houston/workspaces` filesystem migration is **kept**
  in the Tauri shell (`app/src-tauri`).
- Migration stays copy-never-move, so the data is downgrade-safe.

## Release CI

`.github/workflows/release.yml` (tag `v*`) builds the desktop app around the
bun-compiled host sidecar directly (no Rust engine, no CLI staging), on macOS
(universal DMG), Windows (x64/arm64 MSI), and Linux (x64 AppImage).
`.github/workflows/engine-release.yml` (tag `engine-v*`) bun-compiles the
standalone host binary (`houston-host-<triple>`).

## Rollback

The rollback oracle was tagged before deletion:

```sh
git checkout pre-host-cutover-rust-oracle   # rebuilds the Rust-engine desktop app
```

User data is untouched by the host path beyond additive `.houston/runtime/**`
files, so a Rust build reads the same workspaces. No data migration is reversed.
