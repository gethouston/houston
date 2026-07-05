# Windows testing — UTM VM dev loop

> **Updated: the Rust engine is removed — most of this loop is historical.** This
> doc was the fast cross-compile-and-deploy loop for the Rust `houston-engine`
> binary (mingw-w64 from a Mac). That engine is gone; the desktop engine is now the
> **bun-compiled host sidecar** (`scripts/build-host-sidecar.sh`, windows-x64 +
> arm64 targets — no mingw cross-compile). The engine-specific mechanics below
> (`win.sh build/deploy engine`, the `engine/houston-*` Windows bug catalog,
> `cli-deps.json` / `scripts/fetch-cli-deps.sh`, the bundled composio/claude/
> git-bash CLIs) describe the deleted Rust engine and no longer apply. What DOES
> carry over: the Windows VM **setup gotchas** (network profile, standalone OpenSSH
> on ARM, `administrators_authorized_keys`, PowerShell-over-SSH quoting), the
> `Get-Process houston-app` naming, and where `.houston/logs` lands. Keep those;
> treat the rest as a record of the old loop.

How to test Houston Windows builds from a macOS dev host without
waiting 25 minutes for the full release CI pipeline. Built and proven
on macOS 26 (Apple Silicon) + UTM running Windows 11 ARM64.

The loop, end to end (after one-time setup):

```
.context/win-dev/win.sh deploy   # cross-compile engine + push to VM (~30s incremental)
# manually launch Houston from VM Start menu (~5s)
.context/win-dev/win.sh logs     # fetch newest backend.log from VM (~2s)
```

Time per iteration: under a minute for engine-only changes. The full
MSI is rebuilt only when `app/src-tauri/**` or installer config
changes.

## The bridge

`.context/win-dev/win.sh` is the only entry point. It is intentionally
in `.context/` (gitignored) because the VM IP and Windows username are
local to the dev machine. Subcommands:

| Command | What it does |
|---------|--------------|
| `ping` | Confirms SSH reachability + identifies remote |
| `build [engine\|app\|both]` | Cross-compile from Mac via mingw-w64. `engine` is fast (~20s incremental), `app` slower (~30s), `both` is default. |
| `deploy [engine\|app\|both]` | `build` → scp → stop running Houston → `Move-Item` into install dir. Use `engine` for fastest loop when only engine code changed. |
| `launch` | `Start-Process houston-app.exe` (caveat: SSH session is Session 0, may not show on user's desktop — manually launching from Start menu is more reliable) |
| `kill` | Stops `houston-app` and `houston-engine` processes in the VM |
| `logs` | `Get-Content -Tail 200` of the newest `backend.log` |
| `logs-all` | scp the entire `logs/` directory back to `.context/win-dev/logs-<timestamp>/` |
| `shell` | Interactive ssh session |
| `setup-deps` | One-time per install: drops `WebView2Loader.dll` next to `houston-app.exe` (required because mingw builds dynamic-load it; MSVC builds embed it statically). |

Override `WIN_HOST` / `WIN_USER` via env vars if your VM has different
values.

## One-time setup

### Mac side

Already required by the existing platform-matrix.md cross-check
target — these are usually already installed:

```bash
brew install mingw-w64
rustup target add x86_64-pc-windows-gnu
```

No cargo config override needed; the script passes
`CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc`
inline.

Confirm the SSH key Mac will present:

```bash
cat ~/.ssh/id_ed25519.pub      # generate with ssh-keygen if absent
```

### Windows VM side (Windows 11 ARM64 in UTM)

Five non-obvious things had to happen on the original setup. Document
them here because each one is a gotcha that will bite again.

**1. Set the network profile to "Private"** (Settings → Network &
internet → Ethernet → "Network profile type" → Private). The default
"Public" profile silently blocks inbound TCP regardless of which
firewall rules you add.

**2. The bundled OpenSSH Server (Optional Feature) is broken on
Windows 11 ARM64.** `Add-WindowsCapability -Online -Name
OpenSSH.Server~~~~0.0.1.0` reports success and `RestartNeeded :
False`, but `sshd.exe` never actually deploys —
`C:\Windows\System32\OpenSSH\` ends up with only the client tools
(ssh, scp, sftp, ssh-keygen). Get-Service sshd returns "not found"
forever. **Workaround**: install the standalone build from
PowerShell/Win32-OpenSSH:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
$url = "https://github.com/PowerShell/Win32-OpenSSH/releases/latest/download/OpenSSH-ARM64.zip"
$zip = "$env:TEMP\OpenSSH.zip"
Invoke-WebRequest -Uri $url -OutFile $zip
Expand-Archive -Path $zip -DestinationPath "C:\Program Files" -Force
$extracted = Get-ChildItem "C:\Program Files" -Directory -Filter "OpenSSH*" | Where-Object Name -ne "OpenSSH" | Select-Object -First 1
if ($extracted) { Rename-Item $extracted.FullName "C:\Program Files\OpenSSH" -Force }
& "C:\Program Files\OpenSSH\install-sshd.ps1"
Start-Service sshd
Set-Service sshd -StartupType Automatic
New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -Profile Any
```

**3. For Administrator accounts, authorized_keys must live at
`C:\ProgramData\ssh\administrators_authorized_keys`**, NOT in the
user's `~/.ssh/`. Microsoft's OpenSSH treats admin users specially.
Public-key auth silently rejects the user-local file. ACL must grant
only `Administrators:F` and `SYSTEM:F`:

```powershell
$adminKeys = "C:\ProgramData\ssh\administrators_authorized_keys"
Add-Content $adminKeys "ssh-ed25519 <mac-pubkey> mac"
icacls $adminKeys /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"
Restart-Service sshd
```

**4. Install Houston from the latest MSI release** so the install
directory + bundled CLIs + WebView2 are all in place. The dev loop
only replaces `houston-engine.exe`; the rest of the install is the
shipping payload.

**5. PowerShell quoting from SSH is hostile.** Windows OpenSSH's
default shell for SSH sessions is cmd.exe, and `$env:VAR` is
PowerShell syntax. The `win.sh` helper sidesteps this by base64
encoding every PowerShell snippet and passing it via
`powershell -NoProfile -EncodedCommand <base64>`. Any new helper that
runs commands in the VM should use the `ps_remote` wrapper for the
same reason.

### `localhost refused to connect` after launching the cross-built app

Tauri 2.x's `tauri-build` crate emits `cargo:rustc-cfg=dev` based on
`!has_feature("custom-protocol")`. With dev cfg on, the webview tries
to load `tauri.conf.json::devUrl` (i.e. `http://localhost:1420`),
which obviously doesn't exist in the VM. `pnpm tauri build` handles
this by passing `--features tauri/custom-protocol` to cargo; raw
`cargo build --release` doesn't. The `win.sh` build helper now passes
that flag, AND runs `pnpm build` in `app/` first so the frontend
assets exist for the bundler to embed. If you ever invoke cargo
directly for `houston-app`, remember:

```
pnpm build       # in app/, produces app/dist/
cargo build --release --target x86_64-pc-windows-gnu \
  -p houston-app --features tauri/custom-protocol
```

The binary will be ~3 MB larger than the dev-mode build because the
frontend assets are now embedded.

### `WebView2Loader.dll not found` after swapping `houston-app.exe`

The shipping MSVC build statically links the WebView2 loader; the
mingw cross-build dynamically loads `WebView2Loader.dll` at runtime.
The MSI installer never drops a copy because the production binary
doesn't need one. After your first `./win.sh deploy both` (or
`deploy app`), the cross-built app shell will pop a "code execution
cannot proceed because WebView2Loader.dll was not found" dialog.

Fix once per install: `./win.sh setup-deps` fetches the
Microsoft.Web.WebView2 NuGet package, extracts
`runtimes/win-x64/native/WebView2Loader.dll`, and drops it next to
the Houston install. The DLL persists across deploys.

## Cross-compile decisions

We use `x86_64-pc-windows-gnu` (mingw-w64) from Mac, not
`x86_64-pc-windows-msvc`. Trade-offs:

- **GNU pros**: no `xwin` / MSVC SDK headers needed; standard
  mingw-w64 from Homebrew Just Works.
- **GNU cons**: the GNU-linked binary has the `console` PE subsystem,
  so launching `houston-engine.exe` pops a cmd window alongside
  Houston. The shipping MSVC build doesn't because Tauri spawns it
  with `CREATE_NO_WINDOW`. For dev this is a feature — you get live
  engine stdout/stderr in the popup without disk I/O.
- The GNU build is **not** bit-identical to the shipping MSVC build,
  but it's close enough for iterating on Rust logic. Anything that
  depends on MSVC-specific runtime behavior (rare) needs to be tested
  via CI.

On Windows 11 ARM64 hosts, the x64 binary runs under Microsoft's x64
emulation layer. This is the same path real users on Snapdragon /
Surface laptops hit, so it's a representative test surface — but see
"Known ARM emulation gotchas" below.

## Bugs the loop has surfaced (May 2026)

Catalog of Windows-specific bugs discovered during the first
end-to-end VM session. Each entry: symptom, where it was, what was
done. Keep this list growing — it doubles as a Windows readiness
checklist.

### 1. `houston_dir()` ignored `USERPROFILE`

`engine/houston-db/src/db.rs` used `std::env::var("HOME")` which is
not set on Windows. Fallback was `"."` so Houston created a fresh
`.houston/` in whatever directory the process happened to launch
from — `C:\Program Files\Houston\` from Start menu,
`C:\Windows\System32\` from an SSH-launched process,
`C:\Users\<user>\Downloads\` from "double-click MSI in Downloads".
Three (!) parallel data dirs were observed in one session. **Fixed**
by switching to `dirs::home_dir()` at all four `HOME`-reading sites
(`houston-db/src/db.rs`, `houston-engine-core/src/{worktree,provider}.rs`,
`app/src-tauri/src/lib.rs`). `platform-matrix.md` already banned the
pattern; the codebase had drifted.

### 2. Engine stderr discarded on Windows

`app/src-tauri/src/engine_supervisor.rs::spawn` set
`stderr(Stdio::inherit())`. Tauri GUI builds on Windows have no
attached console, so the engine's tracing output was discarded to
NUL — invisible in bug reports, invisible in dev. **Fixed** by
piping stderr and forwarding it to both the supervisor's tracing
sink AND a `$HOUSTON_HOME/logs/engine.log.<date>` file. The on-disk
capture is what `Report bug` ships back when an engine subprocess
crashes.

### 3. Bundled `composio.exe` crashes on Windows-on-ARM

```
[composio:cli] exit=exit code: 0xc000001d stdout=0B stderr=0B
```

`0xc000001d` = `STATUS_ILLEGAL_INSTRUCTION`. The x64 composio binary
(gethouston/composio fork) uses CPU instructions not implemented by
Windows-on-ARM's x64 emulator. Real ARM-laptop users will hit this.

**Partial fix in this repo**: cryptic Windows NTSTATUS exits are now
translated to human-actionable error messages by
`houston-composio::cli::decorate_windows_exit` and the matching
helper in `houston-engine-core::provider`. The dialog now shows
"STATUS_ILLEGAL_INSTRUCTION (0xc000001d): the binary uses CPU
instructions not supported by this CPU. On Windows-on-ARM laptops…"
instead of `exit code: 0xc000001d`.

**Runtime arch picker for ARM is now in place** (in this repo,
`engine/houston-cli-bundle/src/lib.rs::host_arch_for_composio`):

- Calls `IsWow64Process2` to detect when an x64 Houston process is
  running under Windows-on-ARM's x64 emulator.
- If detected AND `<bundle>/bin/composio-aarch64/` exists, returns
  `"aarch64"` so the bundle resolver picks the native binary.
- Falls back to `std::env::consts::ARCH` otherwise.

**The fix is now in place end-to-end (May 2026)**:

1. **Cross-compile from Mac**: `bun build --compile --target=bun-windows-arm64`
   produces a 122 MB PE32+ AArch64 binary. Bun 1.3.10's compile
   subsystem supports the target out of the box.
2. **Patch in the fork**: Bun's windows-arm64 build ships without
   TinyCC, so the fork's `cli-keyring` package called
   `dlopen('advapi32.dll', …)` at module-eval time and crashed the
   CLI before any command ran. Wrapped the dynamic import in
   `createWindowsStore()` so an FFI unavailability downshifts to
   `WindowsFfiUnavailableStore`, which fails every operation with
   `NoStorageAccess`. The CLI's `ComposioUserContext` already had a
   plaintext-fallback path keyed off `NoStorageAccess` — API keys
   land in `~/.composio/user_data.json` instead of Windows Credential
   Manager. Patch pinned at
   `gethouston/composio@c17c8fb88` branch `houston-windows-arm64`.
3. **CI manifest**: `cli-deps.json` now has a `composio.build.windows-arm64`
   entry alongside `windows-x64`, both pinned by commit SHA + Bun
   target + Bun version.
4. **CI script**: `scripts/fetch-cli-deps.sh` now accepts
   `windows-arm64` and `windows-both` modes. Production Windows MSI
   should bundle both arches via `windows-both`.
5. **Runtime arch picker**: `engine/houston-cli-bundle/src/lib.rs::host_arch_for_composio`
   calls `IsWow64Process2` to detect x64-on-ARM emulation and prefers
   the native `composio-aarch64/` dir when present.

The fork patch needs to be pushed upstream to `gethouston/composio`
(currently lives only in the local clone under
`.context/composio-build/fork/` on the dev host that built this).
Track this as a one-off cleanup before the next Windows release.

### 4. Claude Code on Windows needs Git Bash, Houston didn't warn

Claude Code CLI stderr (now captured in `engine.log` and surfaced
to the dialog after fix #6):

> Claude Code on Windows requires git-bash
> (https://git-scm.com/downloads/win). If installed but not in PATH,
> set environment variable pointing to your bash.exe, similar to:
> `CLAUDE_CODE_GIT_BASH_PATH=C:\Program Files\Git\bin\bash.exe`

Houston ships claude.exe but didn't bundle, detect, or warn about
Git Bash. **Fixed** in `engine/houston-engine-core/src/provider.rs`:

- `find_git_bash_windows()` probes `CLAUDE_CODE_GIT_BASH_PATH`
  env override → the Houston-bundled extraction
  (`%LOCALAPPDATA%\Programs\Houston\runtime\git-bash-<arch>\usr\bin\bash.exe`)
  → `C:\Program Files\Git\bin\bash.exe` →
  `C:\Program Files (x86)\Git\bin\bash.exe` → PATH search.
- `launch_login` for Anthropic on Windows sets
  `CLAUDE_CODE_GIT_BASH_PATH` to the found path automatically.
- If nothing is found, login returns
  `"Claude Code on Windows requires Git Bash. Install Git for
  Windows from https://git-scm.com/downloads/win — Houston will
  auto-detect it on next launch."` — the dialog shows this BEFORE
  spawning claude.exe.

Since v0.4.11 the bundle is enough — the user never has to install
Git for Windows separately. The PortableGit `.7z.exe` ships inside
the MSI and the engine extracts it in-process via `sevenz-rust2`
(see `engine/houston-engine-core/src/git_bash.rs`). The earlier
SFX-subprocess approach in v0.4.10 caused a Windows crash loop —
the SFX's GUI progress dialog couldn't be hidden, the subprocess
blocked engine startup, and Tauri's 5s health-check timeout killed
the engine mid-extract on every launch. v0.4.11 decodes the
embedded 7z payload directly (skipping the PE stub), runs the
provisioning as a fire-and-forget background task so engine HTTP
comes up immediately, and uses a temp-dir + atomic-rename so a
partial extraction can never poison the install.

### 5. Custom `composio.exe` install path is x64-only

The bundle drops `composio.exe` at
`C:\Program Files\Houston\bin\composio-x86_64\composio.exe`. The
directory name hard-codes the arch. When the aarch64 build lands,
the bundler in `cli-bundling.md` needs an `composio-aarch64/`
companion dir + runtime arch picker.

### 6. Provider login failures were silent

`engine/houston-engine-core/src/provider.rs::launch_login` fired
the CLI in `tokio::spawn` and returned `Ok(())` immediately. If the
CLI crashed in milliseconds (missing dep, illegal instruction), the
failure only went to logs — the frontend dialog showed "waiting"
forever. Violated the no-silent-failures rule. **Fixed** by adding a
3-second probe window: if the CLI exits in that span, the function
returns a real error containing the CLI's stderr; if it's still
running after 3s (real OAuth flow in progress), the supervisor
detaches and proceeds as before.

### 8. `activity.json` write fails with "system cannot find the file specified"

Observed once in frontend.log:

```
[mission-title] keeping fallback title for ... |
internal: failed to write .houston/activity/activity.json:
io error: The system cannot find the file specified. (os error 2)
```

Likely cause: the agent_root path comes from the watcher carrying a
`\\?\C:\...` extended-path prefix. `houston-agent-files::write_file_atomic`
calls `create_dir_all` + `fs::rename`; both have spotty handling of
`\\?\` paths in stable Rust on Windows. Repro needed before patching.

**Follow-up**: normalize away `\\?\` prefix before passing agent_root
into `write_file_atomic`, OR pass the prefix through consistently.
Investigate when reproducible on next pass.

### 9. Engine STATUS_CONTROL_C_EXIT still occurs once at startup

Even with `CREATE_NEW_PROCESS_GROUP` set on the engine spawn (see
`engine_supervisor.rs:107`), the engine subprocess still exits once
during startup with `STATUS_CONTROL_C_EXIT` (0xC000013A). The
supervisor restarts it cleanly within ~2 seconds and subsequent runs
are stable. Cosmetic but worth root-causing: probably a startup-time
console signal that the process-group flag doesn't fully shield
against on Windows-on-ARM emulation.

### 7. Tunnel allocation rate-limited

```
WARN tunnel allocation failed - running local-only
HTTP 429 Too Many Requests from https://tunnel.gethouston.ai/allocate
```

Cascading failure from the engine-restart loop: each crash + restart
called `/allocate` once, the relay's burst detector saw it as one
client hammering and banned for the boot. **Mitigated** in
`engine/houston-tunnel/src/identity.rs::ensure`:

- On 429, wait for `Retry-After` header (capped at 30s) and retry
  once. With the successful retry the identity is cached, so
  subsequent restarts don't re-hit the endpoint.
- Combined with fix #1 (HOME → stable cache dir), the cache now
  actually persists across restarts on Windows.

If the user still hits 429 after both retries, they see the
existing `running local-only` warning and the engine continues
without a tunnel (pairing disabled until next boot).

### `houston_dir()` and any code path that reads `HOME`

Banned by `platform-matrix.md`, but historically slipped in. Always
use `dirs::home_dir()`. On Windows `std::env::var("HOME")` is `Err`
and most legacy code falls back to `"."` → data writes land wherever
the process's CWD happened to be (e.g. `C:\Windows\System32\`,
`C:\Program Files\Houston\`, the user's Downloads folder — observed
all three from a single Houston launch session). Audit before
adding new env-driven paths.

### `Get-Process houston-app` (not `houston`)

The installed app is `houston-app.exe`. PowerShell's `Get-Process`
drops the `.exe`, so the kill matcher is `houston-app` and
`houston-engine`, not `Houston`.

### `Start-Process` from an SSH session

Windows OpenSSH runs sessions in non-interactive Session 0. GUI apps
launched there don't appear on the logged-in user's Session 1
desktop. `win.sh launch` exists but in practice manually
double-clicking Houston from the Start menu inside the VM is the
reliable path.

### `cargo test -p houston-claude-installer` → `os error 740`

Running the installer crate's tests natively on Windows died before
any test ran:

```
Running unittests src\lib.rs (...houston_claude_installer-<hash>.exe)
The requested operation requires elevation. (os error 740)
```

The build succeeded; only the *launch* of the test harness was
blocked. Cause: Windows UAC **Installer Detection**. It flags any
*unmanifested* executable whose file name contains
`install` / `setup` / `update` / `patch` as an installer and refuses
to start it without elevation. The crate is `houston-claude-installer`,
so cargo names the harness `houston_claude_installer-<hash>.exe` — the
`install` substring trips the heuristic. Nothing actually needs admin.

**Fixed** by `engine/houston-claude-installer/build.rs`: it embeds an
`asInvoker` UAC manifest on Windows-MSVC via
`/MANIFEST:EMBED` + `/MANIFESTINPUT:`. An explicit
`requestedExecutionLevel` is what disables Installer Detection. The
flags use `cargo:rustc-link-arg` (not `-bins`) so they reach the test
harness, and are gated on `CARGO_CFG_TARGET_ENV == "msvc"` so the
cross-`check` GNU flow (which never links/launches) is untouched. The
shipping `houston-engine.exe` doesn't need this — its name doesn't trip
the heuristic.

If a *new* crate ever gets a name containing one of those keywords and
its tests/bins must launch on Windows, copy that build.rs.

## Finding logs

If `houston_dir()` is correct: `%USERPROFILE%\.houston\logs\`. After
fixing the HOME bug this is the only location.

If running against a build that still has the HOME bug (older
versions): logs land at `<CWD>\.houston\logs\`. To find them all:

```powershell
Get-ChildItem -Path C:\ -Recurse -Filter "backend.log*" -ErrorAction SilentlyContinue -Depth 5
```

Common CWD-derived locations historically observed:

- `C:\Program Files\Houston\.houston\` (Start-menu launch)
- `C:\Windows\System32\.houston\` (SSH-launched)
- `C:\Users\<user>\Downloads\.houston\` (MSI-clicked-from-Downloads)

## Engine stderr

The Tauri parent inherits engine stderr (`Stdio::inherit()` in
`engine_supervisor.rs::spawn`). On Windows the GUI subsystem app has
no console attached, so inherited stderr writes to `NUL` and the
engine's tracing output is lost. To capture it for crash diagnosis,
pipe stderr to a file in `$HOUSTON_HOME/logs/engine.log`. This is
fixed; see `engine_supervisor.rs::spawn` for the redirect.

## Updating this doc

When the loop changes — new helper subcommand, new gotcha
discovered, new Windows version supported — update this doc the
same day. The whole point is so the next session doesn't have to
re-discover by trial.
