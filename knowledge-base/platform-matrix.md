# Platform Matrix — Rust (engine/) layer

> **⚠️ LEGACY — Rust engine, retired at P6.** Documents the Rust `engine/` (the current *default* desktop build), being replaced by the single TypeScript engine — the **pi runtime** (`packages/runtime`) behind the **host** (`packages/host`), protocol **v3** (`packages/protocol`). Accurate for the legacy build while it ships. New architecture: **`convergence/README.md`**. TS host platform support is tracked in `convergence/README.md`; the UTM loop in `windows-testing.md` applies to the Bun host sidecar too.

Status of Windows support at the engine's Rust surface as of this
commit. CI wiring (matrix build, artifact naming, updater targets)
is owned by Wave 2 / E₂ and not tracked here.

## Build verification

| Target | Status | How verified |
|--------|--------|--------------|
| `aarch64-apple-darwin` | ✅ native | `cargo test --workspace --exclude houston-app --exclude houston-tauri` |
| `x86_64-apple-darwin` | ✅ (inherits Darwin code paths) | — |
| `x86_64-unknown-linux-gnu` | ✅ (inherits Unix code paths) | — |
| `x86_64-pc-windows-gnu` | ✅ `cargo check` clean | `cargo check --target x86_64-pc-windows-gnu -p houston-engine-server` with `mingw-w64` toolchain |
| `x86_64-pc-windows-msvc` | ⚠️ untested on macOS host — `ring`'s build script needs MSVC CRT headers (fetch via `xwin` or build on Windows) | — |

The two Windows targets share the same Rust source. MSVC vs GNU differs
only in CRT/linker — every `cfg(windows)` branch in Houston applies to
both.

## Cross-platform primitives — in use

- **Home dir**: `dirs::home_dir()` (HOME on Unix; on Windows `dirs 5`
  resolves via the known-folder API and ignores `USERPROFILE`).
  `std::env::var("HOME")` is banned in engine code.
  `houston-composio::install::home_dir` checks `USERPROFILE` first on
  Windows so callers and tests can redirect `~/.composio` resolution
  (it equals the known-folder profile in normal use, so production
  behavior is unchanged).
- **PATH manipulation**: `std::env::split_paths` / `std::env::join_paths`
  — never hand-roll the separator.
- **Symlinks**: `std::os::unix::fs::symlink` on Unix,
  `std::os::windows::fs::symlink_file` / `symlink_dir` on Windows.
  Both branches wired in `agents_crud.rs`, `agents/prompt.rs`,
  `skills.rs`. Windows symlink creation needs Developer Mode or
  admin; stock installs fail with os error 1314 ("A required
  privilege is not held by the client"). Call sites that expose
  content to a sibling CLI fall back to `fs::copy` so non-admin
  Windows users still get it: AGENTS.md/GEMINI.md in
  `agents/prompt.rs` and `houston-agent-files::migrate_agent_data`,
  and the `.claude/skills/<name>` discovery mirror in `skills.rs`
  (copies the whole skill dir when `symlink_dir` is denied, and
  re-copies on `save` so edits don't go stale). The gemini runtime-home staging
  (`houston-terminal-manager::gemini_home::ensure_symlink`) also
  tolerates a missing source on the copy fallback so first-time
  gemini users without `~/.gemini/.env` or OAuth files do not hit
  "Failed to prepare gemini runtime home".
- **PATH lookup**: `houston-terminal-manager::provider::which_on_path`
  walks each PATH directory. On Windows it checks `.exe` / `.cmd` /
  `.bat` variants BEFORE the bare filename in each directory so
  npm-global CLIs (which ship both `<name>` — Unix script — and
  `<name>.cmd` — Windows shim — in the same dir) resolve to the
  executable shim instead of the unexecutable script. Without that,
  `Command::new(...)` later fails with os error 193 ("%1 is not a valid
  Win32 application"). Two guards keep the resolver from ever returning a
  guaranteed-193 path (regression from issue #213): `.ps1` is NOT probed
  (`CreateProcess` can't launch a PowerShell script directly, and Rust's
  `Command` only wraps `.bat`/`.cmd` through cmd.exe), and the bare,
  extensionless fallback is accepted only when the file is a real PE
  image (`MZ` magic) — a bare file is almost always a Unix shim script.
  Inner pure helper `which_in_dirs(command, iter)` is exposed for tests
  so the per-platform priority can be verified without mutating
  process-global PATH.
- **PTY**: `portable-pty` (used in `houston-terminal-manager::manager`)
  — ConPTY-backed on Windows 10+, no code change needed.
- **File watcher**: `notify` — native backends on each OS.

## Platform-specific branches

| Area | File | Unix | Windows |
|------|------|------|---------|
| Session cancel | `engine-core/src/sessions/cancel.rs` → `houston-agents-conversations/src/process_kill/` | SIGTERM process group + `pgrep -P` descendant snapshot → poll → SIGKILL escalation, death verified | `taskkill /PID <pid> /T /F`, verified via `tasklist`, retried once |
| Worktree shell (`run_shell`) | `engine-core/src/worktree.rs::run_shell` | `sh -c <command>` | `cmd /C <command>` (no `sh` on Windows) |
| `engine.json` perms | `engine-server/src/main.rs::write_manifest` | `chmod 0o600` | inherits NTFS ACL from parent (sufficient; user dir is per-user) |
| Composio installer | `houston-composio/src/install.rs::install` | `bash -c "curl \| bash"` | returns a clear error — auto-install not wired (see **gaps** below) |
| Composio executable check | `houston-composio/src/install.rs::is_installed` | file + `+x` bit | file existence only (NTFS has no POSIX +x; Composio installer drops `composio.exe`) |
| Composio CLI path | same | `~/.composio/composio` | `~/.composio/composio.exe` |
| Login-shell PATH probe | `houston-terminal-manager/src/claude_path.rs` | `/bin/zsh -l -c 'echo $PATH'`, fallback `/bin/bash -l`, `-i` | skipped — inherited process PATH is already the user PATH |
| Common-install-dir probe | same | `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, `~/.cargo/bin`, `~/.composio`, nvm node dirs | `~\.cargo\bin`, `~\.composio`, `~\AppData\Roaming\npm`, `~\AppData\Local\Programs\claude` |
| Command-exists check | same `is_command_available` | bare filename | bare + `.exe`/`.cmd`/`.bat`/`.ps1` variants |
| Gemini CLI spawn | `houston-terminal-manager/src/gemini_runner.rs` + `houston-engine-core/src/sessions/provider_oneshot.rs::run_gemini` | bundled SEA per arch (`Resources/bin/gemini-<arch>/gemini`) | bundled binary not shipped in v1; falls back to user-installed gemini-cli on PATH (e.g. `npm i -g @google/gemini-cli`). Two Windows-specific quirks make this work: (a) `which_on_path` prefers `.exe`/`.cmd`/`.bat` variants over the bare filename so the npm-global `.cmd` shim wins over the unexecutable Unix script that ships in the same dir (avoids os error 193, "%1 is not a valid Win32 application"; `.ps1` is not probed and a bare extensionless match must be a real PE — see the PATH-lookup note above); (b) `gemini_compatible_path` strips the `\\?\` extended-length prefix from canonicalized agent paths before they hit `--include-directories` because gemini-cli's Node-based `fs.realpathSync` parses each component and crashes with `EISDIR: illegal operation on a directory, lstat 'C:'`. If neither bundled nor PATH-installed, both call sites short-circuit with a platform-aware "not available yet" toast. UI also unlocks the chat-model dropdown when the locked provider has `cli_installed=false` (`chat-model-selector.tsx`). |

## Known gaps — Windows needs a follow-up

1. **Composio CLI install**: Windows path surfaces an error pointing the
   user at <https://composio.dev/install>. Composio publishes a
   PowerShell installer; wiring it in needs a real Windows box to test
   SHA checksum, install directory, and PATH-append semantics.
2. **Claude / Codex CLI discovery**: `COMMON_CLAUDE_DIRS` on Windows is
   a best guess (npm global dir, cargo bin, a plausible
   `AppData\Local\Programs\claude`). Needs validation against actual
   Claude Code / Codex Windows distributions once they publish.
3. **nvm on Windows** (`nvm-windows` by coreybutler) lives at
   `%APPDATA%\nvm\v<ver>\` with a different shape than nvm.sh — not
   yet probed; Node tools installed via nvm-windows won't be picked up
   unless they're on PATH already.
4. **Process-group kill**: on Unix we SIGTERM the process group (+ a
   `pgrep -P` descendant snapshot), verify death, and escalate to
   SIGKILL; Windows uses `taskkill /T /F` which walks the child tree,
   verified via `tasklist` and retried once
   (`houston-agents-conversations/src/process_kill/`). Windows is
   forceful (`/F`) from the start because Console applications don't
   respond to clean-shutdown signals unless they're in our console
   group. If this becomes a problem (e.g. sessions that need graceful
   Claude shutdown to flush token caches), switch to
   `GenerateConsoleCtrlEvent` via a detached child console.
5. **MSVC target build**: not verified on the macOS host. CI on Windows
   runners (E₂'s scope) is the authoritative check. Cross-compile from
   macOS would need `xwin` (MSVC SDK headers) — not installed locally.

## Deliberately untouched in this pass

- `app/` and `ui/` Windows support — owned by Wave 2 / E₂.
- `.github/workflows/*` matrix — owned by Wave 2 / E₂.
- `houston-composio::cli`, `::auth`, `::mcp` — these call `whoami`,
  `open`, `security` (macOS `security(1)`), which will not work on
  Windows either. They compile (process spawns fail at runtime with a
  clear I/O error), but the features that depend on them are not
  expected to work on Windows without additional work. Left out of
  scope to keep this diff tight.

## Wave 2 status (composio Windows + MSI build pipeline)

Wave 2 landed alongside the gethouston/composio fork and the new
`build-windows` GitHub Actions job. Status of the previously-listed
gaps:

1. **Composio CLI install** — RESOLVED. Production Windows builds
   bundle composio.exe via the gethouston/composio fork (built from
   source on the windows-latest runner). The dev-mode error message
   stays as-is because there's no benefit to running composio
   standalone outside a packaged Houston install. See
   `knowledge-base/cli-bundling.md` for the build pipeline.
2. **Claude / Codex CLI discovery** — VALIDATED for x64. Codex ships
   native `codex-x86_64-pc-windows-msvc.exe` from openai/codex; we
   download + zstd-decode + bundle. Claude Code's distribution
   manifest exposes `win32-x64` + `win32-arm64` URLs which the
   runtime installer resolves automatically. The `COMMON_CLAUDE_DIRS`
   list still covers the npm + AppData scenarios.
3. **nvm-windows** — STILL UNVALIDATED. Houston's bundled CLIs win
   over PATH lookups in production, so this only matters for dev
   builds running unbundled.
4. **Process-group kill** — UNCHANGED.
5. **MSVC target build** — VERIFIED via the new `build-windows` CI
   job (`cargo build --release --target x86_64-pc-windows-msvc -p
   houston-engine-server`). Mac-host cross-compile remains
   unsupported (no `xwin` SDK) and is not on the roadmap.

One new gap introduced in Wave 2:

6. **Windows MSI signing** — Wave 2 ships UNSIGNED. SignPath
   Foundation integration is blocked on operational provisioning
   (project + secret rotation in CI). See cli-bundling.md "Windows
   signing — deferred" for the wire-up plan. The Tauri-updater
   minisign signature (covering in-app auto-update verification) IS
   produced and uploaded — that's separate from OS code-signing.

Auto-updater Windows entries are now wired: `build-windows`
downloads the macOS-only `latest.json` uploaded by `build-macos`,
adds a `windows-x86_64` entry pointing at the MSI + its minisign
.sig, and re-uploads with `--clobber`. The Tauri updater plugin
already runs on Windows; users on previous builds will see the
update prompt automatically the next time they launch.
