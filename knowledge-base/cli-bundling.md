# Bundled CLIs — codex, composio, claude-code

Houston ships two upstream CLIs inside the signed/notarized desktop
bundle (`.app` on macOS, `.msi` on Windows) and runtime-downloads a
third. The goal is zero terminal exposure for non-technical users —
they install Houston, click in, and the chat agent works without ever
opening a shell.

## What ships where

### macOS

| CLI         | License       | Distribution      | Where it lives                                                        |
|-------------|---------------|-------------------|------------------------------------------------------------------------|
| codex       | Apache-2.0    | Bundled (universal) | `Houston.app/Contents/Resources/bin/codex` — single Mach-O fat binary |
| composio    | MIT           | Bundled (per-arch)  | `Resources/bin/composio-aarch64/`, `Resources/bin/composio-x86_64/`   |
| gemini      | Apache-2.0    | Bundled (per-arch)  | `Resources/bin/gemini-aarch64/gemini`, `Resources/bin/gemini-x86_64/gemini` (Node SEA, single Mach-O each) |
| claude-code | PROPRIETARY   | Runtime download    | `~/.local/bin/claude`                                                  |

### Windows (x64 only in v1)

| CLI         | License       | Distribution                       | Where it lives                                                                          |
|-------------|---------------|------------------------------------|------------------------------------------------------------------------------------------|
| codex       | Apache-2.0    | Bundled (single arch)              | `<install>\resources\bin\codex.exe` — downloaded + zstd-decoded from upstream            |
| composio    | MIT           | **Built from source (fork)**       | `<install>\resources\bin\composio-x86_64\composio.exe`                                   |
| gemini      | Apache-2.0    | **NOT BUNDLED in v1**              | No upstream Windows binary published by google-gemini/gemini-cli (verified across last 100 releases). Phase 2 will mirror the composio fork-build pattern using upstream's `scripts/build_binary.js` (already has win32 branches via Node SEA + postject). Until then, Gemini-backed agents are macOS-only. |
| claude-code | PROPRIETARY   | Runtime download                   | `%LOCALAPPDATA%\Programs\claude\claude.exe`                                              |
| git-bash    | GPL-2.0       | Bundled (compressed, decoded in-process) | `%LOCALAPPDATA%\Programs\Houston\runtime\git-bash-<arch>\usr\bin\bash.exe` (extracted on first launch) |

Four notes on Windows:

1. **codex** ships a single per-arch binary on Windows because there is
   no `lipo` equivalent — Windows binaries from openai/codex come as
   `codex-{x86_64,aarch64}-pc-windows-msvc.exe.zst`. We use the `.zst`
   variant, decompress with `zstd`, and stage at `resources/bin/codex.exe`.

2. **composio** is BUILT FROM SOURCE on the Windows runner. Upstream
   `ComposioHQ/composio` does not yet ship Windows artifacts (issue
   #3057, closed: "use WSL for now"). Houston builds composio.exe on
   every release using a pinned commit on a forked repo
   (`gethouston/composio`, branch `houston-windows-support`) that adds:
   - Windows targets (`bun-windows-x64-modern` etc.) to
     `TARGET_MAP` in `build-binary-cross.ts`.
   - `win32-x64` + `win32-arm64` entries in
     `RUN_CODEX_ACP_BINARY_TARGETS` so the build pulls
     `@zed-industries/codex-acp-win32-{x64,arm64}` from npm.
   - A native `WindowsCredentialFFIStore` in `cli-keyring` that calls
     `advapi32.dll`'s `Cred*` family via `bun:ffi` against the user's
     Credential Manager (Generic Credentials,
     `CRED_PERSIST_LOCAL_MACHINE`).
   The fork's HEAD SHA + Bun version are pinned in
   `cli-deps.json#composio.build."windows-x64"` and verified at fetch
   time. The plan is to upstream these patches to ComposioHQ once
   we've shaken out the runtime Windows-isms in production.

3. **claude-code** ships native Windows binaries (`win32-x64`,
   `win32-arm64`) directly from Anthropic's distribution manifest. The
   runtime installer (`houston-claude-installer`) detects platform via
   `host_platform_key()`, resolves the matching URL + SHA-256 from the
   bundled `cli-deps.json`, and writes to
   `%LOCALAPPDATA%\Programs\claude\claude.exe` (matching the upstream
   PowerShell installer).

4. **git-bash** ships as PortableGit's `.7z.exe` archive (~57 MB per
   arch) under `resources\bin\git-bash-<arch>.7z.exe`. Claude Code's
   `claude.exe` refuses to run without `bash.exe` + the msys2 POSIX
   runtime, so the engine extracts the archive on first launch into
   `%LOCALAPPDATA%\Programs\Houston\runtime\git-bash-<arch>\` and
   exports `CLAUDE_CODE_GIT_BASH_PATH` for every later claude.exe
   spawn. **Extraction is done in-process** by `sevenz-rust2`,
   skipping the SFX's PE stub and decoding the embedded 7z payload
   directly. The SFX is never executed — running it would pop the
   GUI progress dialog that Igor Pavlov's `7zSD` SFX module always
   shows regardless of CreateProcess flags, and would also gate
   engine boot on a CPU-bound subprocess we cannot kill cleanly. The
   in-process decoder runs on a fire-and-forget background task so
   `axum::serve` comes up immediately; a concurrent on-demand caller
   from a route handler blocks on the same `Mutex` inside
   `git_bash::ensure_bundled_bash` instead of double-extracting.
   First-launch cost is ~5-10s (CPU-bound LZMA2 decode) and the
   marker file at `.sfx-marker` (mtime+size of the SFX archive)
   makes every subsequent launch a no-op.

claude-code's license doesn't permit redistribution, so we can't
bundle it on either OS. Instead the engine downloads + sha256-verifies
on first launch using a manifest pinned in `cli-deps.json`.

codex is a Rust binary so we `lipo -create` the two arch tarballs into
one universal binary on macOS. composio is a Bun-bundled JS app whose
runtime is arch-specific — `lipo` can't combine them, so we ship per-
arch directories on macOS and a single x64 directory on Windows.

## Pinned manifest — `cli-deps.json`

`cli-deps.json` at the repo root is the single source of truth for
versions, URLs, and SHA-256 checksums. CI fetches based on it. The
runtime claude-code installer reads it from the bundle. Bumping a
version:

```bash
./scripts/bump-cli.sh codex 0.122.0
./scripts/fetch-cli-deps.sh both    # downloads + prints new checksums
# paste the printed checksums into cli-deps.json
./scripts/fetch-cli-deps.sh both    # re-run, this time verifies
```

The manifest is staged into the .app at
`Resources/bin/cli-deps.json` so the runtime claude-code installer can
read pinned URLs + checksums without a separate network round-trip.

**Version floors:** codex must stay ≥ 0.137 — the engine passes each
session's system prompt as a file-based profile
(`$CODEX_HOME/houston-tmp-*.config.toml` + `-p`, see
`houston-terminal-manager::prompt_scratch`); older codex `-p` only reads
`[profiles.*]` tables inside the user's own `config.toml` and would fail
with "config profile not found". claude-code must stay ≥ a version with
`--system-prompt-file` (the pinned 2.1.158 has it). Both exist because
inline prompts on argv exceed Windows' 32,767-char `CreateProcessW`
limit (os error 206) for agents with large accumulated context.

## Build pipeline

The same `scripts/fetch-cli-deps.sh` handles both macOS and Windows; the
mode arg selects the OS:

- `./scripts/fetch-cli-deps.sh both` — macOS, both arches (production)
- `./scripts/fetch-cli-deps.sh arm64` / `x64` — single-arch macOS dev
- `./scripts/fetch-cli-deps.sh windows-x64` — Windows (production)
- `./scripts/fetch-cli-deps.sh host` — auto-detect host

### macOS (`both` mode)

1. Downloads each bundled CLI for both arches using URLs from the manifest.
2. Verifies sha256 against pinned checksums (mismatch is fatal).
3. `lipo -create`s the two codex slices into a single universal Mach-O.
4. Stages each composio arch under `composio-aarch64/` / `composio-x86_64/`.
5. Prunes cross-platform `acp-adapters/codex/<plat>/` directories that the
   resolved arch can never execute (~580 MB savings).
6. Stages `cli-deps.json` itself for the runtime installer.

### Windows (`windows-x64` mode)

1. Downloads `codex-x86_64-pc-windows-msvc.exe.zst` from openai/codex,
   verifies SHA-256, decompresses with `zstd`, stages as
   `resources/bin/codex.exe`. No lipo step.
2. Clones the gethouston/composio fork at the pinned commit SHA
   (verified after clone — drift fails the build), runs
   `pnpm install + pnpm exec tsdown + pnpm run build:binary:cross --
   --target bun-windows-x64-modern` to produce `composio-windows-x64.exe`
   plus companion `.mjs` modules and `acp-adapters/codex/<plat>/codex-acp.exe`
   for every supported platform.
3. Stages the binary as `resources/bin/composio-x86_64/composio.exe`,
   flattens companion modules alongside it, prunes cross-platform
   acp-adapter binaries keeping only `win32-x64` (~681M → ~235M).
4. Stages `cli-deps.json` itself.

The Windows mode also accepts a `COMPOSIO_FORK_PATH=/path/to/local/fork`
env override that skips the remote clone and uses an existing tree —
useful for iterating on fork patches before pushing to GitHub.

`tauri.conf.json#bundle.resources` then maps the staging dir verbatim
into the `.app`:

```jsonc
"resources": { "resources/bin": "bin" }
```

CI: `.github/workflows/release.yml` calls `fetch-cli-deps.sh both` before
the tauri build, then verifies layout + signing invariants for every
Mach-O inside `Resources/bin/` (Developer ID, hardened runtime, both
arch slices).

### Pre-signing bundled binaries (required)

`tauri-action`'s `codesign --force --deep` signs the .app's main binary,
frameworks, helpers, and Mach-Os at the **top level** of `Resources/`,
but it does **not** recurse into nested directories under `Resources/`.

Concretely: `Resources/bin/codex` (top level) gets signed by tauri's
deep codesign; `Resources/bin/composio-aarch64/composio` (one level
deeper) does **not**, and Apple notary then rejects the bundle with:

- "The signature of the binary is invalid"
- "The signature does not include a secure timestamp"
- "The executable does not have the hardened runtime enabled"

Fix: pre-sign every bundled Mach-O in `app/src-tauri/resources/bin/`
**before** tauri-action runs. The release workflow imports a temporary
keychain with the Developer ID cert and runs:

```bash
codesign --force --options runtime --timestamp \
  --sign "$APPLE_SIGNING_IDENTITY" "$f"
```

on `codex`, `composio-aarch64/composio`, `composio-x86_64/composio`.
Tauri's later deep sign leaves these alone (it doesn't visit nested
Resources subdirs), so the pre-applied signature carries through to
notarization.

Any new bundled binary added to `Resources/bin/` must be added to the
"Pre-sign bundled CLI binaries" step in `release.yml`. The post-build
"Verify bundled CLI invariants" step will fail the release if a
Mach-O ends up unsigned, ad-hoc-signed, or missing hardened runtime.

## Runtime resolution

`engine/houston-cli-bundle/` is the resolver crate. Public functions:

- `bundled_bin_dir() -> Option<PathBuf>` — top of the bundle dir, or
  `None` outside a recognizable .app/MSI layout.
- `bundled_codex_path()` — universal codex binary if bundled.
- `bundled_composio_binary()` — composio binary for the host arch.
- `bundled_path_entries()` — dirs to prepend to PATH so subprocesses
  resolve the bundled copies.
- `load_bundled_manifest()` → `CliDepsManifest` with typed `CliEntry`
  accessors.

Detection is structural — we walk parent dirs of `current_exe()`
checking for `Houston.app/Contents/MacOS/<exe>` (macOS) or a sibling
`resources/bin/` (Windows). No env vars; works even when launched from
Spotlight, Dock, or Finder.

`engine/houston-terminal-manager/src/claude_path.rs` prepends the
bundled paths to the resolved login-shell PATH so subprocess
spawns of `claude`/`codex`/`composio` find the bundled copies before
anything on the user's PATH.

Runtime-installed Claude has one extra trap: `claude_path::init()`
caches PATH at engine boot, but the first-launch installer may create
`~/.local/bin` after that cache is built. Provider auth/login must use
the absolute path returned by `provider::resolve_claude()` for managed
Claude installs. Do not gate login on a bare `claude` PATH lookup, or
the UI can report "installed" while login says "not installed".

## Lifecycle — auto-install + auto-upgrade

`engine/houston-engine-server/src/main.rs` spawns two background tasks at
boot:

1. `houston_composio::lifecycle::ensure_and_upgrade` — emits
   `ComposioCliReady` immediately when bundled is present (production).
   For dev / unbundled builds, runs the upstream `curl | bash` installer
   into `~/.composio` and runs `composio upgrade` on Houston version
   bumps.

2. `houston_claude_installer::ensure_and_upgrade` — reads
   `cli-deps.json` for the pinned `claude-code` version and:
   - If installed at the pinned version → emit `ClaudeCliReady`.
   - Else → stream-download with sha256 verification, atomic rename
     into `~/.local/bin/claude`, persist version marker, emit
     `ClaudeCliInstalling { progress_pct }` then `ClaudeCliReady`.
   - On failure → `ClaudeCliFailed { message }`.

Both run on independent tasks so a slow claude download never blocks
composio readiness.

## API surface — `/v1/claude/*`

Mirrors `/v1/composio/*`:

- `GET /v1/claude/cli-installed` → `{ installed: bool }`.
- `GET /v1/claude/status` → `{ installed, installPath, pinnedVersion,
  installedVersion, lastInstallError }`. `lastInstallError` is the
  classified user-readable reason the most recent install failed (or
  `null` when install has never failed / has since succeeded). The
  onboarding "Sign in with Anthropic" card reads it so a bad-internet
  failure renders as "Couldn't reach Anthropic — Retry" instead of the
  generic "install the CLI yourself" hint (issue #231).
- `POST /v1/claude/install` → kicks off a fresh install in the
  background. Progress + completion stream over the WS firehose as
  `ClaudeCliInstalling` / `ClaudeCliReady` / `ClaudeCliFailed` events.
  Both the lifecycle entry and this route flow through
  `houston_claude_installer::finalize_install` so DB markers
  (`PREF_INSTALLED_VERSION`, `PREF_LAST_INSTALL_ERROR`) stay in sync —
  a successful retry clears any stale error from a previous attempt.

`ProviderStatus` (returned by `GET /v1/providers/<name>/status`) gains
three status fields beyond provider + CLI name:

- `installSource: "bundled" | "managed" | "path" | "missing"` —
  Houston's view of where the binary came from. Renders as a chip in
  the provider settings UI.
- `cliPath: string | null` — absolute path Houston will spawn.
  Surfaces in diagnostics.
- `authState: "authenticated" | "unauthenticated" | "unknown"` —
  tri-state provider auth. `unknown` means the CLI status probe failed
  or returned an unrecognized shape; reconnect UI must not treat it as
  logout.

## DMG size

Bundled CLIs add ~940 MB to `Resources/`:

- codex universal:  340 MB
- composio-aarch64: ~180 MB
- composio-x86_64:  ~190 MB
- gemini-aarch64:   ~115 MB
- gemini-x86_64:    ~118 MB

DMG compression brings the user-facing download to ~450-560 MB. This is
a deliberate trade — the target user is non-technical and would not
successfully run a separate installer for each provider CLI.

## Adding a new bundled CLI

1. Add an entry to `cli-deps.json` with `bundled: true`, the upstream
   URLs per platform, and (initially) empty checksums.
2. Update `scripts/fetch-cli-deps.sh` if the archive layout differs from
   the existing patterns (single binary vs. multi-file Bun-style bundle).
3. Run `./scripts/fetch-cli-deps.sh both` and pin the printed checksums.
4. Add a resolver in `houston-cli-bundle::lib.rs`
   (`bundled_<name>_path()`).
5. If the CLI needs to be on PATH for agents to invoke it, add the
   directory to `bundled_path_entries()`.
6. Update the CI bundle-invariant check in `release.yml`.

## Adding a new runtime-downloaded CLI

1. Add an entry to `cli-deps.json` with `bundled: false`,
   `install_target` (file path), per-platform URLs, and pinned
   sha256 checksums.
2. Mirror the `houston-claude-installer` crate structure (or extend it
   if the auth + version-marker pattern is identical).
3. Wire into `main.rs::spawn_cli_lifecycles`.
4. Add `<Name>CliInstalling/Ready/Failed` events to `HoustonEvent` and
   route them in `engine_protocol::event_topic`.
5. Add `/v1/<name>/*` REST routes mirroring `routes/claude.rs`.

## Maintaining the gethouston/composio fork

The Windows composio binary is built from a fork of upstream
ComposioHQ/composio with three patches that upstream hasn't taken yet
(see issue #3057). The fork lives at
`https://github.com/gethouston/composio.git` on branch
`houston-windows-support`. Houston pins the HEAD SHA in
`cli-deps.json#composio.build."windows-x64".source_sha` and the fetch
script verifies it after every clone.

Workflow when bumping composio versions:

1. On the gethouston/composio fork, rebase `houston-windows-support`
   onto the new upstream tag (`@composio/cli@<NEW>`) and re-apply the
   three patches if rebase doesn't auto-merge them:
   - `feat(cli): add Windows targets to cross-compile + ACP adapter map`
   - `feat(cli-keyring): native Windows Credential Manager backend (bun:ffi)`
   - (any subsequent patch adding new Windows behavior)
2. Push the rebased branch.
3. In Houston, update `cli-deps.json`:
   ```bash
   ./scripts/bump-cli.sh composio <NEW_VERSION>
   ```
   then edit `composio.build."windows-x64".source_sha` to the new
   fork HEAD SHA.
4. Run `./scripts/fetch-cli-deps.sh windows-x64` locally to verify the
   build still works.
5. Open the upstream PR (`ComposioHQ/composio`) with the same patches —
   the longer the gap between the fork and upstream the more painful
   rebases get.

The fork is the deliberate single-point-of-truth for Houston-side
Windows support: it's small, the patches are mechanical, and it
doesn't introduce a vendoring layer (composio source isn't checked
into Houston). Upstream taking the patches deletes this section.

## Windows signing — deferred

The Windows MSI ships UNSIGNED in v1. Users see Microsoft Defender
SmartScreen warning ("Windows protected your PC — Don't run / More
info → Run anyway") on first install. Plan:

1. SignPath Foundation (free OSS code signing) is approved for Houston
   per `project_windows_signing` memory.
2. Wire `signpath-foundation/signpath-action@v1` into the
   `build-windows` job between `tauri-action` and the upload step.
3. Submit the MSI + bundled `.exe` files for signing, wait for
   completion, replace the unsigned artifacts before
   `gh release upload`.
4. Verify with `signtool verify /pa /v signed.msi`.

Until that lands, the unsigned MSI is acceptable for personal
testing — it installs fine, just with one extra confirmation click.

Note that "Windows MSI signing" above refers to **OS code-signing**
(SmartScreen / Mark-of-the-Web); it's distinct from the
**Tauri-updater minisign signature** that gates auto-update. The
updater signature IS produced and uploaded for Windows builds (see
`build-windows`'s "Extend latest.json with Windows updater entry"
step) and the in-app updater verifies against the public key
embedded at build time — same signing key as the macOS .app.tar.gz
flow. So Windows users on older Houston versions get the same
auto-update prompt as macOS users, just with a SmartScreen warning
when the new MSI runs until SignPath integration ships.

## Files involved

- `cli-deps.json` — pinned versions, URLs, checksums, Windows
  build manifest (`composio.build."windows-x64"`).
- `scripts/fetch-cli-deps.sh` — fetch + lipo + prune + stage; the
  Windows path also clones+builds the composio fork.
- `scripts/bump-cli.sh` — version bumper (clears stale checksums).
- `scripts/install-claude-code.sh` — legacy bash installer; kept for
  manual recovery / debugging. The Rust runtime installer is the
  blessed path.
- `app/src-tauri/tauri.conf.json#bundle.{resources,windows}` — Tauri
  side: bundle resources, MSI target, WiX config, WebView2 install
  mode.
- `app/src-tauri/build.rs` — ensures the staging dir exists for `pnpm tauri dev`.
- `engine/houston-cli-bundle/` — resolver crate (Windows-aware).
- `engine/houston-claude-installer/` — runtime download crate
  (Windows install dir at `%LOCALAPPDATA%\Programs\claude\`).
- `engine/houston-composio/src/install.rs` — bundle-aware composio
  resolver (Windows surfaces a clear "bundled-only" error in dev mode).
- `engine/houston-engine-core/src/provider.rs` — `InstallSource` enum + status.
- `engine/houston-terminal-manager/src/claude_path.rs` — PATH
  augmentation, Windows-specific install dirs +
  `.exe`/`.cmd`/`.bat` extension probing.
- `engine/houston-engine-server/src/routes/claude.rs` — `/v1/claude/*`.
- `.github/workflows/release.yml` — `build-macos` + `build-windows`
  jobs, fetch + verify steps.
