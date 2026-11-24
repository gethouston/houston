# Desktop shell: design decisions

Covers `app/src-tauri/`: the Tauri 2 shell that spawns the host sidecar, its boot order, deep links, native commands, sign-in helpers, dictation and platform guards. Short file paths are relative to `app/src-tauri/src/`.

## Platform-only modules still compile everywhere

`git_bash`, `redirection_guard`, `window_preflight` and `webview_guard` keep their pure decision logic compiled and tested on every host. Only the Win32 probes, relaunches and dialogs are Windows-only, so the modules carry `#[cfg_attr(not(windows), allow(dead_code))]` instead of a `#[cfg(windows)]` gate. Lives in `app/src-tauri/src/lib.rs` module declarations.

## Boot order in `run()`

The order of the first steps of `run()` in `app/src-tauri/src/lib.rs` is load-bearing:

1. `commands::os::stamp_launch_t0()` is the first line of Houston code. Client perf spans measure app open from this point.
2. The macOS DMG guard (`dmg_guard::handle_if_needed`) runs before Sentry and logging, so an instance launched from inside the installer DMG never touches `~/.houston/`.
3. `redirection_guard::relaunch_if_inherited()` runs before any plugin registers. An instance auto-launched by the MSI updater inherits the Windows Installer Service's Redirection Guard, which breaks every junction path (the file picker included). Relaunching through the shell before plugins register means no single-instance mutex is held by the doomed process.
4. Sentry initializes before logging, so the `sentry_tracing` layer registered in `logging::init` has a live client from the first record, and the panic handler is installed before plugin setup.
5. `window_preflight::ensure_window_creation_works()` probes window creation on Windows. tao's event loop asserts with a bare panic when the session cannot create a window; probing first turns that into a Sentry event naming the Win32 error plus a dialog the user can act on.

## Debug builds use a separate data root

`houston_dir()` returns `~/.dev-houston/` in debug builds, so `pnpm tauri dev` never shares data with an installed release. The host sidecar is handed `HOUSTON_HOME` explicitly (`spawn_host_sidecar`), not just the derived agents and chat-history paths: the host defaults both from `HOUSTON_HOME` and falls back to `~/.houston`, so omitting it would point a debug shell at production data.

## Sentry release, environment and dev gate

The release string is `houston-app@<CARGO_PKG_VERSION>` (with `-dev` in debug builds). It is computed once and forwarded to the host sidecar so the app and the engine land on the same release in the shared `houston-app` project. It must match the `--release` passed to the sentry-cli sourcemap and debug-file uploads in `.github/workflows/release.yml` (which derives it from the git tag), or stack traces do not resolve.

`environment` separates production crashes from development noise; Sentry tile filters default to production.

Debug builds suppress Sentry unless `SENTRY_SEND_IN_DEV` is set, so a developer with the production DSN exported does not pollute the production project. It is read with `option_env!` at compile time, like `SENTRY_DSN`.

`engine_sentry_env` injects nothing when Sentry is inactive, so the engine stays dormant, and the opt-in flag is forwarded only when the app itself opted in. Opting in injects both the DSN and the flag so the debug sidecar's own dev gate agrees.

`engine_identity_env` is gated on the same `sentry_active` decision: the signed-in identity reaches the engine only when crash reporting does.

Lives in `run()`, `sentry_send_in_dev_enabled`, `sentry_should_activate`, `engine_sentry_env` and `engine_identity_env` in `app/src-tauri/src/lib.rs`.

## Single-instance plugin registers before deep-link

On Windows and Linux the single-instance plugin must register before the deep-link plugin so its second-instance argv forwarding is the one deep-link attaches to. Otherwise every `houston://` URL launches a fresh process (the OS protocol handler does this by design; on Windows, Start-menu launches resolve to `C:\Program Files\Houston\...` and protocol-handler launches to the 8.3 short form `C:\PROGRA~1\Houston\...`, which show up as two engine spawns). The callback raises the primary window. macOS needs none of this: NSWorkspace delivers `houston://` URLs to the running app.

## `houston://` deep links and runtime scheme registration

Deep links handled in setup:

`houston://auth-callback?<query>`: the Apple sign-in return. Apple rejects `127.0.0.1` redirects, so Apple's callback comes back through the gateway's HTTPS bridge, which deep-links the query here. It is forwarded onto the same `auth://deep-link` event the loopback listener uses. Google and Microsoft stay on the loopback because they accept it and reject custom schemes. The webview checks the callback's `state` against the pending attempt, so a sign-in completes only for the attempt that started it.

`houston://settings/plan` and `houston://settings/channels`: the billing return and the desktop Slack connect return, forwarded for the settings landing.

`houston://open` and anything else: focus only.

Only macOS registers the scheme at install time (the bundler writes it into Info.plist). Neither Windows MSI/WiX installer registers a custom scheme, and a Linux AppImage is never installed, so Windows and Linux register the handler at runtime on every launch: Windows through `register_all()` (HKCU\Software\Classes\houston, per user, idempotent), Linux through the plugin's `.desktop` file plus `deep_link_register` running `xdg-mime` on a background thread. It must run in setup before any sign-in. A failure is a warning, not a crash, because Google, Microsoft and email sign-in do not depend on the scheme.

## Setup-time housekeeping

Partial release downloads that no poll will finish (for the running version, or older than a week) are removed in setup before the first update check can open a new one, on a blocking thread because it is disk work.

On Windows, MSI upgrades break taskbar-pin and desktop shortcut icons; `windows_icon_repair::spawn_repair` repairs them once per installed version on a background thread.

`migrate_legacy_docs_dir` moves the pre-`$HOUSTON_HOME` workspace root (`~/Documents/Houston/`) to `$HOUSTON_HOME/workspaces/` when the new location is empty. It never overwrites an existing entry at the new root and is idempotent.

## Managed state that exists in every mode

`OauthLoopbackState`, `ChannelsLoopbackState`, `ClaudeLoginState` and `MigrationSourceState` are managed unconditionally so their commands work in both remote-host and bundled-sidecar modes. The migration source is needed precisely in remote-host (cloud) mode, where the migration wizard runs. The Slack connect loopback registry is separate from sign-in's so neither can supersede or cancel the other. In remote-host mode `EngineHandshakeState` is still managed (empty) so `get_engine_handshake` stays callable.

## Remote host mode detection

When `VITE_NEW_ENGINE_URL` or `VITE_HOSTED_ENGINE_URL` is set, the frontend talks to an external host or gateway and the shell neither spawns nor health-checks the local sidecar. Both the runtime env and `option_env!` are checked: the runtime env covers `pnpm tauri dev` (Vite and the shell share an environment), and `option_env!` covers packaged cloud builds, where release CI bakes the gateway URL into the frontend and the installed app's runtime env is empty. Without the compile-time check a cloud build would spawn an idle sidecar. Lives in `run()` setup.

## Native commands and why they are native

From the `generate_handler!` list in `app/src-tauri/src/lib.rs`:

`save_download`: the webview ignores anchor-download clicks, so the shell writes downloaded bytes itself.

`report_bug`: native delivery avoids webview CORS and keeps the bug-report tracker credentials out of the JavaScript bundle.

`show_session_notification`: on Linux and Windows the click must bring the window forward and emit `app-activated`; macOS uses the JS notification plugin.

`start_codex_oauth_loopback`: binds the fixed port 1455 that OpenAI registered for Codex OAuth and forwards the raw callback query as `codex-oauth://callback`.

`start_oauth_loopback` / `cancel_oauth_loopback`: desktop sign-in stays on the user's machine (no website relay, no custom-scheme dialog); cancel frees the port immediately.

`start_channels_loopback`: the gateway redirects a desktop-started Slack connect here instead of to `houston://`, so the browser shows no "Open Houston?" prompt.

`read_claude_credential`: a hosted engine pod cannot read this machine's Keychain, so the cached credential is extracted and pushed. `discard_claude_handoff_credential` destroys the handoff copy after the push, because from then on the gateway is the only rotator of that credential family.

`get_engine_handshake`: a pull-based, race-free fallback for `EngineGate` in case the injected handshake is missed.

## Run-loop events

`RunEvent::Ready` on Windows: the runtime logs a failed WebView2 creation and still registers `main`, so a broken runtime idles with no window. The shell relaunches once, then reports and shows a dialog.

`RunEvent::Exit` calls `engine_supervisor::mark_shutting_down()` so the engine's exit on quit (including the Windows force-kill path) is not reported as a crash. It also calls `local_bridge::shutdown()` because static state is not dropped at exit, so pending native dials, renewals and model streams must be cancelled explicitly.

## Host sidecar spawn

The staged host lives at the externalBin path `binaries/houston-engine-<triple>`, so the existing resolver finds it.

`HOUSTON_APP_SYSTEM_PROMPT` carries the product voice; the host injects it into every runtime it spawns. The desktop variant gives integrations guidance for the in-process tools and the in-chat connect card.

Integrations env: a runtime `HOUSTON_INTEGRATIONS_URL` selects Houston's gateway (the host gives it precedence over a key). A runtime key without that URL opts into direct mode and suppresses the baked packaged-build default. With neither, the baked gateway stays the default. Lives in `integrations_host_env`.

The supervisor banner timeout is 30 s because a notarized sidecar's first-run Gatekeeper scan can take 15 to 20 s.

The init script injects both `window.__HOUSTON_ENGINE__` (the handshake) and `window.__HOUSTON_CP__ = true` before any client call. The flag switches `app/src/lib/engine.ts` onto the control-plane adapter; without it the frontend would speak a wire the host does not answer.

The frontend's `houston-engine-restarted` listener (`app/src/lib/engine-tauri-events.ts`) re-applies the handshake and notifies restart subscribers, which surface the reconnect toast.

## Engine supervisor: process wiring

All in `app/src-tauri/src/engine_supervisor.rs`, `EngineSubprocess::spawn` and the supervisor loop.

stdout and stderr are piped. Windows GUI builds have no console, so inherited stderr would disappear into NUL along with panic messages. stderr is forwarded both to a daily-rolled `engine.log` next to `backend.log` (what a bug report ships when the engine crashes) and to the shell's tracing sink as `[engine:stderr]`. stdout is drained continuously so the engine never blocks on a full pipe or sees EPIPE, and stray prints reach tracing.

stdin is piped and never written. When the shell exits or crashes the write end drops, the child's stdin read returns EOF, and the host's parent watchdog exits, so no orphan engine keeps holding ports. stdin is taken out of the `Child` before anything calls `Child::wait()`, because `wait()` closes stdin and would trip the watchdog.

`HOUSTON_SUPERVISED=1` is set next to the pipe it describes. The Bun host's watchdog arms only on this marker; without it (self-host Docker, source-run Node, dev, tests) the watchdog stays inert, so a missing supervisor pipe never crash-loops the host at boot.

Every inherited `SENTRY_*` variable is stripped before the app's own Sentry env is injected. The engine's Sentry config is decided entirely by the app, so a shell-exported DSN can never make the engine report when the app chose to suppress it.

`appimage_env::sanitize_std_command` undoes the AppImage runtime's `LD_LIBRARY_PATH`, GTK and GIO exports, so the engine and what it forks (the `claude` binary, agent shell commands) do not inherit the bundle's library world.

`shell_env::apply_claude_shell_env` runs before the caller-provided env pairs, because the bundled Claude Code CLI refuses to start on Windows without a resolvable shell, and an explicit override must still win.

Unix: the child gets its own process group, and stop kills the whole group so tokio workers and grandchildren die too.

Windows: `CREATE_NEW_PROCESS_GROUP` detaches the child from the parent's console group; without it Ctrl+C and close events reaching the parent kill the engine with `STATUS_CONTROL_C_EXIT` (seen on MSI builds). `CREATE_NO_WINDOW` stops Windows from allocating a console window for the child; Tauri's `Sidecar` helper sets it, but the supervisor uses raw `std::process::Command` for the stdin watchdog and has to set it itself.

Windows: the engine is assigned to a kill-on-close Job Object right after spawn. `TerminateProcess` on force-quit never delivers EOF to the child's stdin, so the watchdog alone would leave an orphan. Assignment right after spawn covers the whole subtree because the engine starts no child processes in that window. The job handle is `Send`/`Sync` because the restart thread owns the subprocess, and `CloseHandle` on drop is what triggers the kill; there is no UI thread to report its failure to.

## Engine supervisor: restart loop and crash reporting

The monitor clones the child handle under a brief lock and releases the slot before blocking on exit. `setup()` locks the same slot to read the handshake; holding it across the wait deadlocked launch (live process, no window). A regression test models this with plain mutexes.

When `ENGINE_SHUTTING_DOWN` is set the exit is deliberate: no crash report and no respawn. The flag also suppresses reports for non-zero exits, because a Windows force-kill gives the engine a non-zero status on teardown.

A non-zero or signal exit while not shutting down is reported to Sentry with one fingerprint (`engine-subprocess-exit`), so a crash loop is one issue, not one per restart. Supervisor logs alone are only breadcrumbs.

Only the `HOUSTON_HOST_LISTENING port=<p> token=<t>` banner is accepted. The retired Rust engine's `HOUSTON_ENGINE_LISTENING` banner is rejected because only a stale wrong binary could emit it.

## Engine binary resolution

`resolve_engine_binary` checks, in order: the `HOUSTON_ENGINE_BIN` override, a sibling of the current executable (where Tauri puts the bundled sidecar on every shipping platform), then the resources dir as a legacy fallback. The target-triple suffixes match what tauri-cli emits.

## Native Claude sign-in (`claude_login`)

`pub(crate) mod` submodules: `generate_handler!` in `lib.rs` names commands at their defining path (for example `claude_login::credential::read_claude_credential`) because the macro resolves the sibling `__cmd__*` items in the module where the command lives; re-exporting only the function would not carry them. `app/src-tauri/src/claude_login/mod.rs`.

Unsupported CPU: Bun-compiled helpers need AVX2 on x86-64 and die instantly with SIGILL otherwise. `start_claude_login` checks `cpu::unsupported_reason()` first and reports through the `done` event (not `Err`) so the frontend's single failure router can degrade to the runtime's paste flow. It logs at WARN: an environmental fact with a designed degrade path. A helper that dies from a signal carries `helperUnavailable`; a plain non-zero exit (for example a declined authorization) never does. Windows reports a binary its loader could not start as an NTSTATUS exit code, not a signal: a missing DLL (0xC0000135), a missing entry point on an OS too old for the binary (0xC0000139), a DLL init failure (0xC0000142) or an illegal instruction (0xC000001D, the Windows face of SIGILL). Those four codes also carry `helperUnavailable`; a Unix exit code never reaches them. The error names the concrete signal (SIGILL is 4) so triage can tell it from an OOM kill.

A new login cancels any still-running one first by flipping the previous attempt's cancel flag. Without it, a retry would leave two `claude auth login` children racing their loopbacks and two done listeners firing conflicting completions. The cancel flag and stdin slot are published before the task starts, so a cancel or pasted code racing the spawn is honored. The child is spawned synchronously so a launch failure surfaces as an `Err`.

The config dir is created before spawn because the CLI writes the cached credential there. The handoff config dir (`claude-login-handoff`) is separate from the shared login dir (`claude-login`) so a credential minted for a remote engine is never visible to a co-located engine; otherwise two rotators would share one refresh-token family.

On a successful done event the app is brought forward, mirroring the OAuth loopback. A failed emit from the background task is logged only: the command already returned and there is no Result left to surface; this is the documented event-callback exception, with the frontend's retry as the safety net.

`runner`: stderr is drained concurrently so a chatty failure cannot fill the pipe and wedge the child; the tail is only read on non-zero exit. Completion requires both child exit and a fully drained stdout. A login expiry logs at INFO, not error: an abandoned login is expected and the expiry is the designed teardown, matching the OAuth loopback listener timeout.

`ExitReport::classify` decides the log level and the flags the frontend degrades on: `helperUnavailable`, the Windows shell-gate refusal (a missing prerequisite, shown as install-Git copy or the paste flow on a remote engine) and offline (Node's raw socket error with no DNS, shown as the connectivity toast). On Windows `ExitStatus::code()` is always `Some`, so the non-unix signal arm is unreachable in practice but kept so the function stays total.

`network_gate` matches getaddrinfo failures and resolver codes, both `ETIMEOUT` (Windows) and `ETIMEDOUT` (POSIX) because neither is a substring of the other, and undici's bare `fetch failed`. `shell_gate` matches the CLI's three Windows shell-gate wordings (an unrunnable `CLAUDE_CODE_GIT_BASH_PATH` override on CLI 2.1.25x and earlier, neither Git Bash nor PowerShell found, Git Bash missing with the PowerShell tool disabled). Declined authorizations, server rejections and TLS failures match neither.

`credential::read_credential` reads the credentials file first (Linux, Windows, some macOS). A file that is empty, token-less (a logout leaves `{accessToken:""}`) or malformed falls through to the macOS Keychain, which is the CLI's source of truth there. The file's concrete problem is kept for the final error so a Linux user with no Keychain sees why the file was rejected. The Keychain lookup uses only the dir-scoped service name: `Claude Code-credentials-<first 8 hex of sha256(config dir path)>`. A husk returned from the Keychain is rejected rather than pushing an empty token to a pod.

`discard` keeps deleting Keychain items until none remain, because the item may exist under more than one account.

`resolve::claude_bin` order: `HOUSTON_CLAUDE_BIN`, then the bundled sibling in release builds only (debug builds stage a sleep-forever placeholder that would hang the login spinner), then `claude` on PATH.

`build_login_command` repairs the shell env (the CLI's Windows startup gate needs Git Bash or PowerShell) and spawns from the user's home directory, not the inherited cwd: the CLI's shell probe discards `which()` hits inside its own cwd, so an inherited `C:\Windows\System32` (autostart and deep-link launches) filters out the built-in PowerShell. On Windows it sets `CREATE_NO_WINDOW` (`claude.exe` is a console binary; without it each sign-in pops a console, and closing it hangs up the child with exit 129) and `CREATE_NEW_PROCESS_GROUP`, mirroring the engine spawn.

`extract_visit_url` strips OSC-8 hyperlink sequences (terminated by BEL or ESC-backslash; CLI 2.1.201 wraps the URL this way), drops an unterminated sequence instead of emitting raw escapes, takes the first token after `visit:` and trims trailing `.` or `)`.

`code_input`: clipboard reads go through `spawn_blocking` because arboard blocks. An empty or non-text clipboard is expected and logged at debug only, never with contents. The accepted code shape is an opaque code, `#`, then a 43-character base64url state. A relay failure after the child exited is treated as nothing consumed so the dialog falls back.

## OAuth sign-in loopback (`oauth_loopback`)

Attempt ordering follows user initiation. `start_oauth_loopback` mints the attempt id first (it records when the user clicked, not which coroutine reaches `install` last), claims the slot, and supersedes the previous listener before binding. Binding first left the old listener holding its port, so each re-click moved to the next candidate port and the fourth had nowhere to go. If a newer click claims the slot while this one is binding, the freshly bound sockets are dropped and the frontend is told this attempt lost. An abandoned attempt's cancel cannot free a newer attempt's port, and a listener that ended long ago cannot clear the current one (`state.rs`, `clear_if`, `take_matching`).

The GCIP-brokered flow minted its authorize URL for one port, so it asks for exactly that port and, on `PortBusy`, steps and re-mints; it never silently binds another port the provider would refuse to redirect to. The PKCE flow takes the first free candidate; a process holding port 8975 falls through to the next registered redirect URI.

Both `127.0.0.1` and `::1` are bound, because a browser resolving `localhost` may arrive on either. A process holding only `[::1]:port` would receive IPv6 callbacks, so that port counts as busy. If the machine has no IPv6 loopback, IPv4 alone is fine; browsers fall back to `127.0.0.1`.

The listener releases its sockets before announcing it freed the port, because a superseding start waits on that signal to rebind the same port. It clears the registry only if the slot still points at its own generation.

`callback::decide`: no legitimate callback is state-less, so a request without our `state` (a restored tab replaying an old redirect, or a local probe) is `Stale` and does not consume the one-shot listener. `error=access_denied` with our state is a real answer and completes the attempt; the TS side turns it into a typed failure. The query is forwarded with `code` and `state` intact on the `auth://deep-link` event, the same channel an OS deep link of that shape uses.

The success and stale pages inline their SVG and contain no raster images, because the loopback serves nothing else. "Open Houston" uses `houston://open`. The stale page does not invite the user back as if signed in, because the real attempt is still waiting.

A listener error after the start command returned is logged only (the documented event-callback exception); starting again is the user's remedy.

## Codex OAuth loopback (`codex_oauth_loopback`)

Binds OpenAI's registered port 1455 and forwards the raw callback query verbatim; the JS side owns parsing and the PKCE exchange. Non-callback paths such as `/favicon.ico` get a 404 and the accept loop continues.

A timeout (user closed the consent tab) logs at INFO so it stays out of Sentry, matching the GCIP loopback. A listener error after the command returned is logged only.

Binding retries absorb the asynchronous socket drop when a previous attempt's listener is aborted on retry. A real squatter (for example a Codex CLI mid-login) never releases, so retries exhaust and surface the remedy. When a foreign process owns `127.0.0.1:1455` but `[::1]` is free, binding `[::1]` alone keeps the one-click flow alive, because OpenAI redirects to `localhost` and browsers try `::1` first. The IPv4 error stays the primary diagnostic since squatters live there.

## Slack connect loopback (`channels_loopback`)

The active listener is registered before its task starts, so a listener that ends immediately still finds its own entry to release.

## Windows Redirection Guard relaunch (`redirection_guard`)

`relaunch_decision`: relaunch through the shell when launched by the Windows Installer Service (also when msiexec already exited before the check). A shell-launched instance has explorer's own policy, and relaunching would loop. A deep link in argv would be lost through explorer, so that case does not relaunch.

If no second instance appears after the hand-off, the original keeps running mitigated rather than leave the user with no app, and the marker is removed so it does not claim a hand-off. Nothing can be logged before logging init, so `report_after_logging_init` records the stand-down later.

The process mitigation policy is read as a plain u32 of flags. Pre-22H2 Windows has no such policy; the call fails and there is nothing to drop.

## Resumable update download (`commands/update_*`)

Large release assets (hundreds of MB) restarting from byte 0 on every poll never finish for users on slow links, so downloads resume from a partial file with a sidecar validator. GitHub's release CDN answers 206 to any `If-Range`, so the condition proves nothing; a 206 under a validator the sidecar does not name restarts the download (`update_attempt.rs`). A fresh body, a server that ignored the range, or a re-published asset also restart. A stream closed early without an error frame is a retry.

A 504 from the release host mid-roll is retried like a dropped stream, and the resume keeps bytes already received.

Bytes that never reached disk cannot be resumed. On a flush failure a finished body becomes a failure; an attempt that already failed keeps its own reason and re-reads how much landed so the next resume asks for the right offset; if that is unknown the download is final (`update_fetch.rs`).

A full disk mid-body is final for the call, frees what it could not keep, and the frontend latches it so it is not retried this session.

The launch-time install holds the user behind an overlay, so it asks for a short time budget and leaves the rest to the next poll.

The updater hook remounts (across the mobile breakpoint, on identity change, on reload) while the shell's download keeps running, so a second concurrent caller is refused rather than appending to the same file.

Partial files: opening one version sweeps other versions' partials, except a partial some download in this process is writing right now (`InFlightClaim`), whatever its version. The running version's own partial and week-old ones go at startup (`prune_abandoned`).

`update_stage`: a closed progress channel only means the webview went away; the result still returns. On Windows the installer hand-off exits the process; on macOS the buffer is dropped once the bytes are on disk.

## OS commands (`commands/os.rs`, `commands/dialogs.rs`, `commands/save_file.rs`, `commands/file_failure.rs`, `commands/migration.rs`)

`open_url` on Windows calls `ShellExecuteW` instead of `cmd /C start`. `cmd` parses metacharacters before `start` runs: every `&` in an OAuth/PKCE authorize URL becomes a command separator, and `%xx` escapes can pair into `%VAR%` expansions. ShellExecuteW takes the target as one wide string with the same default-handler semantics for URLs, files and folders. A return value of 32 or less is a Win32 error and is surfaced. `SW_SHOWNORMAL` is inlined to avoid pulling in a whole windows-sys feature for one constant.

`open_url` on Linux strips the AppImage env from `xdg-open`, otherwise the browser loads the bundle's libraries and crashes before showing the consent page.

Opening and revealing files on Windows: relative paths arrive forward-slash (the engine's `ProjectFile.path` contract) and `Path::join` keeps them, producing mixed separators that Explorer and some handlers (notably Office) reject, so paths are normalized to backslashes. `explorer /select,<path>` uses `raw_arg`, because `Command::arg` quotes arguments with spaces and Explorer then ignores the verb and opens Documents. Some machines refuse to spawn `explorer.exe` from Houston ("Access is denied", from an app-control policy or an installer-launched token); the fallback opens the parent folder through the running Explorer's shell verb, and the original error is reported if both fail. Linux has no portable select verb, so reveal opens the parent directory.

macOS dialogs use `osascript`; a cancel exits non-zero and maps to `None`. `choose file` returns a POSIX path of any extension and callers validate the bytes. Windows dialog output is decoded so accented user folders are not mangled.

`save_download` on platforms without a native dialog saves into the Downloads folder and deduplicates `name.ext` to `name (2).ext`, like a browser. A dotfile has no stem, so the counter goes after the whole name.

`file_failure`: `ERROR_SHARING_VIOLATION` and `ERROR_LOCK_VIOLATION` (a destination open in Excel, for example) are mapped only on Windows, because only Windows locks open files against writers and Unix code 32 is EPIPE. `NotFound` alone never proves the folder is gone (a dangling symlink, a filter driver or placeholder refusal produce it while the folder exists), see `parent_is_gone`. The serialized kind strings are read by `KINDS` in `app/src/lib/file-op-failure.ts`.

`backup_houston_data` names the backup `<dir>-<stamp>-backup` and avoids clobbering an existing sibling from a same-second re-run. Links and FIFOs left by agent processes are skipped; regular files are copied with the same relative paths.

## Sidecar staging in `build.rs`

`build.rs` stages `target/host-sidecar/houston-host-<triple>` as `binaries/houston-engine-<triple>` and `claude-<triple>` as `binaries/claude-<triple>` for Tauri's `externalBin`. Both come from `scripts/build-host-sidecar.sh`. The `claude` binary sits next to the sidecar so the Bun-compiled runtime resolves it as a sibling (`packages/runtime/src/backends/claude/binary-path.ts`). It is about 232 MB per arch (the macOS universal build is a roughly 470 MB fat Mach-O) and dominates bundle size.

Missing host sidecar: debug builds warn and stage a placeholder, because the dev loop talks to an externally run host and `pnpm tauri dev` must compile without the binaries. Release builds fail, because a signed bundle whose sidecar is a placeholder can never serve. The placeholder exits non-zero immediately and never sleeps: if something does spawn it (the supervisor, or the Agent SDK handed it as `claude`) it must die loudly; a sleep-forever stub once hung every Claude turn on "mission in progress".

Missing whisper-cli never fails the build, release included. It is kept out of the fail-closed stamp guard; the release workflow's own `test -x` gate after `scripts/build-whisper.sh` catches it, so a local `pnpm tauri build` does not depend on building whisper first. Its placeholder also exits non-zero so dictation fails loudly.

Source binaries are named by the same Rust triple Tauri uses as the externalBin suffix, with a default-triple fallback when `TARGET` is unset. Every candidate path is watched in both arms (Cargo re-runs a script whose watched file is missing), so a placeholder is replaced on the next build after the real binary appears. The `.stamp` file is watched too, so a rebuilt sidecar re-stages.

Release freshness check against the stamp (`sidecar_is_fresh`): the stamp commit must still exist (a rebase or gc can orphan it; fail closed), no sidecar input path may differ between the stamp commit and HEAD (so docs-only or frontend-only commits do not flag stale), no staged or unstaged edits to tracked inputs, and no untracked files under the input paths (`git diff` ignores those, `git status --porcelain` catches them).

`SENTRY_DSN` and `SENTRY_SEND_IN_DEV` get explicit `rerun-if-env-changed` so the native `option_env!` gate cannot go stale relative to the renderer's `__SENTRY_SEND_IN_DEV__` define within one dev session. Shell env is preferred over a dotenv file, matching the Vite define.

## Auth session storage (`auth.rs`)

File-backed stores (DPAPI on Windows, 0600 file elsewhere) write a temp file and rename atomically, so a crash never leaves a truncated or half-encrypted blob, and the file is never readable by other users even transiently.

After a successful keyring write the stale fallback file is removed; failure there is cleanup only. On sign-out, a secret-service delete failure is logged but must not block sign-out, because with no reachable daemon nothing was persisted there.

## DMG guard (`dmg_guard.rs`)

The installed copy is replaced with `/bin/rm -rf` on a hardcoded bundle path, because Rust's recursive remove fails on signed bundles whose `Contents/_CodeSignature` has restrictive permissions. In debug builds a force flag shows the dialog for copy review without touching `/Applications/Houston.app`.

## Child process guards (`child_guard.rs`)

Same model as the engine supervisor: Unix children get their own process group and are killed with `killpg`; Windows children are bound to a kill-on-close Job Object whose handle crosses threads, and closing the last handle is the kill.

## Windows shell env (`shell_env.rs`, `git_bash.rs`)

A non-Unicode PATH is left alone. Emitting a repaired value would replace the inherited PATH with only the parsable entries. The Git Bash override still applies.

`claude_spawn_cwd` returns an existing directory the CLI's cwd filter cannot collide with (the home dir).

`is_wsl_bash_alias` rejects the WSL `bash.exe` alias (case and separator variants) while a portable MSYS2 bash is accepted. `is_usable_git_bash_override` rejects directories and judges symlinks on their own unfollowed metadata, the same posture that rejects a Windows reparse-point stub.

## Dictation (`dictation/`)

The CPU is checked before spawning whisper: on pre-AVX2 x86-64 the sidecar dies with an illegal instruction. AVX2 implies the rest of the pinned baseline (FMA, F16C, BMI2 arrived with Haswell), so one probe covers it.

The CPU and missing-model errors are exact strings the frontend maps to translated copy (no bug report for the CPU case, the download flow for the model case, which also replaces a wrong-size file).

Both pipes are drained on threads because whisper logs its whole model load to stderr. A hung child is reaped so the stderr tail reaches EOF; that tail is the only clue. The non-zero exit message keeps its exact wording so the Sentry issue per exit flavor stays continuous.

Model download: idempotent (a ready model returns a terminal Done tick), a guard removes the partial on early return, progress is throttled to about 4 ticks per second so a 181 MB stream cannot flood the webview, an error both emits an Error tick and returns `Err`, and a failed progress emit is logged only.

WAV duration parsing walks RIFF chunks (word-aligned: odd sizes carry a pad byte) to find the fmt byte rate, falling back to a fixed rate for non-RIFF input. The transcription timeout is four times the clip length with a 120 s floor.

`dictation/mod.rs` uses glob re-exports so `generate_handler!` reaches the hidden `__cmd__*` items the command macro emits; a named `pub use` would leave them behind.

## AppImage env and Linux deep-link registration

`appimage_env.rs` and `deep_link_register.rs` keep their pure logic compiled on every platform (dead-code lint silenced off Linux) so unit tests run on all CI platforms. Path matching respects component boundaries (`/tmp/.mount_X2` is not under `/tmp/.mount_X`), and doubled `$APPDIR//usr/lib` entries from linuxdeploy's gtk hook are handled.

`deep_link_register/linux.rs`: the `.desktop` file must exist where the plugin writes it, or xdg-mime would point at nothing. The plugin ignores exit statuses, so when the resulting handler is not ours the step that sets it is retried once. xdg-mime runs with the AppImage env stripped. The fallback keys on std's spawn-error kind for a missing binary, and handles xdg-utils 1.1.3 without desktop-file-utils (empty query result while the file is set).

## Windows icon repair (`windows_icon_repair.rs`)

Runs once per installed version, recorded in a marker under `houston_dir()` (created if missing, since the host may not have created it yet). A failed marker write just means the idempotent pass reruns. The PowerShell child runs with `CREATE_NO_WINDOW`, cwd anchored at the install dir (System32 as cwd breaks PowerShell child spawns), and `-EncodedCommand` to avoid argv re-quoting. The script covers both the public desktop (where the per-machine MSI writes) and the user desktop, parses the icon path from the last comma, only rewrites icons that are dead or point into the installer icon cache, and never retargets the shortcut. `ie4uinit.exe -show` then refreshes the shell icon cache, as Squirrel and Electron do after updates.

## Notifications and focus

`show_session_notification` exists on every target so `generate_handler!` compiles, but only Linux and Windows call it. The click callback runs on a platform notification thread, so the emit is marshalled onto the main thread. On Linux, notify-rust's `wait_for_action` blocks on a D-Bus loop and gets its own thread; the `default` action makes the whole body clickable (or renders an Open button). Both platforms play the default sound to match macOS's Glass ping. On Windows the toast carries Houston's registered AUMID in release builds (icon, name, click routing) and PowerShell's in dev, where none is registered.

`open_notification_settings` on Windows uses `cmd /C start` for the `ms-settings:` URI; that URI carries no shell metacharacters, unlike OAuth URLs. The macOS and Windows arms are not unit tested because they would open System Settings on every run.

`focus_main_window` on macOS activates the NSApplication, because `makeKeyAndOrderFront` does not bring the app in front of the browser when activation is programmatic.

## Bug reports (`bug_report/`)

The user's own feedback text leads both the title and the body when present; a whitespace-only message counts as absent. A GraphQL error answered with 200 when the tracker workspace is at its issue cap must come back typed, and a hung tracker is cut by the client timeout, so the frontend delivers the report through its fallback in both cases.

## Smaller items

`logging.rs` stores the non-blocking writer guard in a static so the writer thread stays alive, and installs `webview_guard::FailureRecorder` to keep the runtime's WebView2 creation error for the guard's event.

`webview_guard/enforce.rs` releases the single-instance mutex before relaunching so the child is not routed back to the dying process.

`window_preflight/win.rs` reuses a window class left behind by an earlier attempt instead of failing on it, and clears the thread's last error before comctl32 calls that only document FALSE on failure.

`local_bridge/detection.rs`: a client build failure (broken TLS backend) degrades to nothing reachable rather than failing the command; probes are bounded by `PROBE_TIMEOUT`.

`sentry_filter.rs` passes no span context because span attributes are not enabled on the layer.

`main.rs` sets the Windows GUI subsystem in release builds so no console window opens.
