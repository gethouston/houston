use std::path::{Path, PathBuf};

fn main() {
    let dotenv_pairs = load_dotenv_pairs();
    configure_bug_report_env(&dotenv_pairs);
    configure_auth_storage(&dotenv_pairs);
    configure_sentry_env(&dotenv_pairs);

    // Stage the two bundled externalBins from `target/host-sidecar/` into
    // `app/src-tauri/binaries/…-<triple>` so tauri's `externalBin` picks them up:
    //   houston-host-<triple>  → binaries/houston-engine-<triple>  (the host sidecar)
    //   claude-<triple>        → binaries/claude-<triple>          (Claude Code CLI)
    // Both are produced by `scripts/build-host-sidecar.sh` (CI wires this into the
    // release workflow); the claude binary is staged next to the sidecar so the
    // Bun-compiled runtime can resolve it as a sibling (see
    // packages/runtime/src/backends/claude/binary-path.ts). NOTE: the claude
    // binary is large (~232MB per arch; the macOS universal build lipos two
    // slices into a ~470MB fat Mach-O), so it dominates the bundle size.
    //
    // Missing → depends on the profile. Debug builds warn + stage a harmless
    // placeholder: the dev loop runs the app against an externally-run host
    // (`pnpm dev:host` + VITE_NEW_ENGINE_URL) and never spawns the staged
    // sidecar (nor `claude auth login`), so `pnpm tauri dev` must still compile
    // without the bun-compiled host / claude binary on disk. Release builds
    // FAIL: a signed, installable bundle whose sidecar is the placeholder can
    // never serve, which is strictly worse than a failed build (release CI
    // compiles the host + stages claude first; a local `pnpm tauri build` must
    // too).
    if let Err(e) = stage_host_sidecar() {
        if release_profile() {
            panic!(
                "host sidecar staging failed for a release build: {e}\n\
                 Run `scripts/build-host-sidecar.sh <triple>` to bun-compile the host first."
            );
        }
        println!("cargo:warning=host sidecar staging skipped: {e}");
    }

    if let Err(e) = stage_claude_binary() {
        if release_profile() {
            panic!(
                "Claude Code binary staging failed for a release build: {e}\n\
                 Run `scripts/build-host-sidecar.sh <triple>` — it stages the SDK's \
                 native `claude` binary next to the host sidecar."
            );
        }
        println!("cargo:warning=claude binary staging skipped: {e}");
    }

    // Stage the bundled frpc tunnel client into `binaries/frpc-<triple>` for
    // Tauri's `externalBin`. Unlike the host sidecar, a missing frpc NEVER fails
    // the build (even release) — it stages a placeholder that exits non-zero so
    // a tunnel attempt surfaces a clear error instead of blocking packaging. A
    // shippable tunnel needs `scripts/fetch-frpc.sh <triple>` run first (release
    // CI wires this in, same as build-host-sidecar.sh).
    if let Err(e) = stage_frpc_sidecar() {
        println!("cargo:warning=frpc staging skipped: {e}");
    }

    // Stage the bundled whisper.cpp dictation sidecar into
    // `binaries/whisper-cli-<triple>` for Tauri's `externalBin`. Like frpc (and
    // unlike the host sidecar), a missing whisper-cli NEVER fails the build —
    // not even a release build. It is deliberately kept OUT of the fail-closed
    // host-sidecar stamp guard: a broken/absent whisper build must be caught by
    // the release workflow's own `test -x` gate (scripts/build-whisper.sh runs
    // there before `tauri build`), not by build.rs, so a local `pnpm tauri
    // build` never hard-depends on having built whisper first. Missing → a
    // placeholder that exits non-zero, so a dictation attempt fails loudly.
    if let Err(e) = stage_whisper_sidecar() {
        println!("cargo:warning=whisper staging skipped: {e}");
    }

    tauri_build::build()
}

/// Whether this build script run is for a release-profile (shippable) build.
/// Cargo sets `PROFILE` to the base profile name (`debug`/`release`) for
/// build scripts; `cfg!(debug_assertions)` can't be used here because it
/// describes the profile the build SCRIPT was compiled under, not the target's.
fn release_profile() -> bool {
    std::env::var("PROFILE").as_deref() == Ok("release")
}

fn load_dotenv_pairs() -> Vec<(String, String)> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let app_root = manifest
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(".."));
    let candidates = [
        manifest.join(".env"),
        manifest.join(".env.local"),
        app_root.join(".env"),
        app_root.join(".env.local"),
    ];

    let mut pairs = Vec::new();
    for path in candidates {
        println!("cargo:rerun-if-changed={}", path.display());
        let Ok(content) = std::fs::read_to_string(&path) else {
            continue;
        };
        for line in content.lines().filter_map(parse_dotenv_line) {
            let (key, value) = line;
            println!("cargo:rustc-env={key}={value}");
            pairs.push((key, value));
        }
    }
    pairs
}

fn parse_dotenv_line(line: &str) -> Option<(String, String)> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
        return None;
    }
    let (key, value) = line.split_once('=')?;
    Some((key.trim().to_string(), value.trim().to_string()))
}

fn configure_bug_report_env(dotenv_pairs: &[(String, String)]) {
    for key in ["LINEAR_API_KEY", "LINEAR_TEAM_ID", "LINEAR_BUG_LABEL_NAME"] {
        println!("cargo:rerun-if-env-changed={key}");
        if let Some(value) = env_value(key, dotenv_pairs) {
            println!("cargo:rustc-env={key}={value}");
        }
    }
}

fn configure_sentry_env(dotenv_pairs: &[(String, String)]) {
    // Bake SENTRY_DSN + the SENTRY_SEND_IN_DEV dev opt-in into the binary the
    // same way the frontend's Vite define reads them (shell env preferred over
    // a dotenv file). The explicit `rerun-if-env-changed` is the point: it
    // forces a recompile + re-bake when either var changes in the SHELL, so the
    // native `option_env!` gate (lib.rs) can never go stale relative to the
    // renderer's `__SENTRY_SEND_IN_DEV__` define (HOU-469). Without it a
    // shell-only toggle could leave the renderer sending while the native
    // client stayed suppressed for the same `pnpm tauri dev` session. We don't
    // rely on rustc's implicit env tracking for `option_env!` — this is explicit
    // and matches the LINEAR_* / auth-storage pattern above.
    for key in ["SENTRY_DSN", "SENTRY_SEND_IN_DEV"] {
        println!("cargo:rerun-if-env-changed={key}");
        if let Some(value) = env_value(key, dotenv_pairs) {
            println!("cargo:rustc-env={key}={value}");
        }
    }
}

fn configure_auth_storage(dotenv_pairs: &[(String, String)]) {
    println!("cargo:rerun-if-env-changed=HOUSTON_AUTH_STORAGE");
    println!("cargo:rerun-if-env-changed=CI");

    let mode = resolve_auth_storage_mode(dotenv_pairs);
    println!("cargo:rustc-env=HOUSTON_AUTH_STORAGE_MODE={mode}");
}

fn resolve_auth_storage_mode(dotenv_pairs: &[(String, String)]) -> &'static str {
    if let Some(override_mode) = env_value("HOUSTON_AUTH_STORAGE", dotenv_pairs) {
        let normalized = override_mode.trim().to_ascii_lowercase();
        return match normalized.as_str() {
            "keychain" => "keychain",
            "browser" => "browser",
            _ => panic!("HOUSTON_AUTH_STORAGE must be keychain or browser"),
        };
    }

    if env_value("CI", dotenv_pairs).as_deref() == Some("true") {
        return "keychain";
    }
    "browser"
}

fn env_value(key: &str, dotenv_pairs: &[(String, String)]) -> Option<String> {
    std::env::var(key)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            dotenv_pairs
                .iter()
                .rev()
                .find(|(candidate, _)| candidate == key)
                .map(|(_, value)| value.clone())
                .filter(|value| !value.trim().is_empty())
        })
}

/// Stage the Bun-compiled Houston host as the Tauri externalBin
/// `binaries/houston-engine-<triple>`.
///
/// Source: `target/host-sidecar/houston-host-<triple>[.exe]`, produced by
/// `scripts/build-host-sidecar.sh` (or the release CI host-compile step). The
/// destination keeps the historical `houston-engine-<triple>` name so
/// `tauri.conf.json`'s `externalBin` list needs no change — at runtime the
/// supervisor spawns whatever binary is staged there and parses its
/// `HOUSTON_HOST_LISTENING` banner.
///
/// Missing host binary → debug builds stage a harmless placeholder (the caller
/// warns): the dev loop runs the app against an externally-run host
/// (`pnpm dev:host` + `VITE_NEW_ENGINE_URL`) and never spawns the staged
/// sidecar, so `pnpm tauri dev` must compile without a bun-compiled host on
/// disk. Release builds get an `Err` instead (the caller panics) — a shippable
/// bundle must contain the real host, staged by `scripts/build-host-sidecar.sh`.
///
/// STALENESS GUARD (release only): the sidecar is compiled from repo source, so
/// a binary left over from a previous commit (a rebase without a rebuild) would
/// be staged and shipped with no error — the class of bug where the packaged app
/// showed providers but zero models because the shipped host predated
/// `GET /v1/catalog`. `build-host-sidecar.sh` writes a `<binary>.stamp` holding
/// the git HEAD at compile time; for a release build we diff the sidecar's INPUT
/// paths (its transitive workspace source closure + manifests + the compile
/// script) between that stamp commit and the working tree, and panic if any
/// input changed — so a docs-only or frontend-only commit made after compiling
/// does NOT force a needless recompile, while an edit to real sidecar source
/// (committed OR uncommitted) is caught. `require_fresh` is true only for the
/// host sidecar — the `claude` binary comes from the versioned pnpm store, not
/// repo source, so it has no staleness class.
fn stage_host_sidecar() -> Result<(), String> {
    stage_external_bin("houston-host", "houston-engine", "host-sidecar", true)
}

/// Stage the Claude Agent SDK's native `claude` binary as the Tauri externalBin
/// `binaries/claude-<triple>`.
///
/// Source: `target/host-sidecar/claude-<triple>[.exe]`, staged by
/// `scripts/build-host-sidecar.sh` from the SDK's per-platform optional package
/// (`@anthropic-ai/claude-agent-sdk-<os>-<arch>`). It ships as a SIBLING of the
/// host sidecar (both land in the bundle dir, e.g. `Contents/MacOS/` on macOS)
/// so the Bun-compiled runtime resolves it — the SDK can't self-resolve its
/// binary from Bun's `$bunfs` (see
/// `packages/runtime/src/backends/claude/binary-path.ts`). The desktop app runs
/// it for `claude auth login`.
///
/// Missing binary → debug builds stage a harmless placeholder (the caller
/// warns): `pnpm tauri dev` talks to an externally-run host and never spawns
/// `claude`, so it must compile without the binary on disk. Release builds get
/// an `Err` (the caller panics) — a shippable bundle must carry the real
/// binary, staged by `scripts/build-host-sidecar.sh`.
fn stage_claude_binary() -> Result<(), String> {
    stage_external_bin("claude", "claude", "claude", false)
}

/// Copy `target/host-sidecar/<source_stem>-<triple>[.exe]` to the Tauri
/// externalBin `binaries/<dest_stem>-<triple>[.exe]`. Shared by the host sidecar
/// and the Claude Code binary — both are produced by
/// `scripts/build-host-sidecar.sh` and bundled side-by-side. `label` prefixes
/// the cargo warnings so the two stagings are distinguishable in build output.
///
/// Missing source → debug builds stage a harmless placeholder; release builds
/// return `Err` (the caller panics). See the wrapper docs for the rationale.
///
/// `require_fresh` (host sidecar only): for a release build, additionally require
/// a `<source>.stamp` next to the staged binary recording the commit it was
/// compiled at, and reject the binary if any of the sidecar's INPUT paths changed
/// since (see `verify_sidecar_fresh`), so a sidecar compiled against stale source
/// is rejected instead of silently shipped. Debug builds never check the stamp.
fn stage_external_bin(
    source_stem: &str,
    dest_stem: &str,
    label: &str,
    require_fresh: bool,
) -> Result<(), String> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace = manifest
        .parent()
        .and_then(|p| p.parent())
        .ok_or("could not resolve workspace root from CARGO_MANIFEST_DIR")?;
    let triple = std::env::var("TARGET").unwrap_or_default();
    let ext = if cfg!(windows) { ".exe" } else { "" };

    // The compile script names outputs by the same rust triple Tauri uses as the
    // externalBin suffix, so for a given `cargo --target <triple>` invocation the
    // source binary is at exactly this path.
    let host_dir = workspace.join("target").join("host-sidecar");
    let mut candidates: Vec<PathBuf> = Vec::new();
    if !triple.is_empty() {
        candidates.push(host_dir.join(format!("{source_stem}-{triple}{ext}")));
    }
    // Fallback for a default-triple build where TARGET is unset.
    candidates.push(host_dir.join(format!("{source_stem}{ext}")));

    // Watch every candidate source in BOTH arms. Cargo re-runs a build script
    // whose watched file is missing, so after `build-host-sidecar.sh` produces
    // the binary the next build re-runs this script and replaces a previously
    // staged placeholder — without this, the placeholder is sticky until some
    // unrelated input dirties the script.
    for candidate in &candidates {
        println!("cargo:rerun-if-changed={}", candidate.display());
        // Re-stage when the freshness stamp changes too: rebuilding the sidecar
        // rewrites `<binary>.stamp` with the new HEAD, so watching it re-runs
        // this script and replaces a previously staged (now-stale) binary.
        if require_fresh {
            println!("cargo:rerun-if-changed={}.stamp", candidate.display());
        }
    }

    let dest_dir = manifest.join("binaries");
    std::fs::create_dir_all(&dest_dir).map_err(|e| format!("mkdir binaries: {e}"))?;
    let dest_name = if triple.is_empty() {
        format!("{dest_stem}{ext}")
    } else {
        format!("{dest_stem}-{triple}{ext}")
    };
    let dest = dest_dir.join(&dest_name);

    match candidates.iter().find(|p| p.exists()) {
        Some(src) => {
            // Release builds must not ship a sidecar compiled against stale
            // source (inputs changed since the stamp commit, or a dirty tree).
            if require_fresh && release_profile() {
                verify_sidecar_fresh(src, workspace)?;
            }
            std::fs::copy(src, &dest).map_err(|e| format!("copy {label}: {e}"))?;
            println!(
                "cargo:warning={label}: staged {} -> {}",
                src.display(),
                dest.display()
            );
        }
        None => {
            // No staged binary on disk. Release builds must not ship the
            // placeholder — surface the miss as a hard error (main panics).
            if release_profile() {
                return Err(format!(
                    "no staged {label} binary found. Tried:\n  - {}",
                    candidates
                        .iter()
                        .map(|p| p.display().to_string())
                        .collect::<Vec<_>>()
                        .join("\n  - ")
                ));
            }
            // Debug builds (typical for `pnpm tauri dev`, which talks to an
            // externally-run host and never spawns this file): Tauri's
            // externalBin bundling still requires the file to exist, so stage
            // a placeholder. It EXITS NON-ZERO immediately (never `sleep`s): if
            // something does spawn it — the engine supervisor, or the Claude
            // Agent SDK handed this as its `claude` binary — the process must die
            // loud so the failure surfaces, NOT hang forever waiting on a stub.
            // (A `sleep`-forever stub here is exactly what hung every Claude turn
            // on "mission in progress".) Mirrors the frpc placeholder below.
            let placeholder = if cfg!(windows) {
                "@echo off\r\necho placeholder external bin (real binary not staged) - run scripts/build-host-sidecar.sh 1>&2\r\nexit /b 1\r\n"
            } else {
                "#!/bin/sh\necho 'placeholder external bin (real binary not staged) - run scripts/build-host-sidecar.sh' >&2\nexit 1\n"
            };
            std::fs::write(&dest, placeholder)
                .map_err(|e| format!("write placeholder {label}: {e}"))?;
            println!(
                "cargo:warning={label} not staged — wrote a placeholder at {} (run scripts/build-host-sidecar.sh for a real build)",
                dest.display()
            );
        }
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&dest)
            .map_err(|e| format!("stat {label}: {e}"))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&dest, perms).map_err(|e| format!("chmod {label}: {e}"))?;
    }
    Ok(())
}

/// Repo-relative paths whose contents determine the compiled host sidecar. This
/// is the transitive workspace source closure of
/// `packages/host/src/sidecar-entry.ts` (host → runtime → runtime-client →
/// domain → protocol → ui/agent-schemas), plus the workspace manifests and
/// lockfile that pin every dependency version, plus the compile script itself
/// (its flags shape the binary). If NONE of these changed between the stamp
/// commit and the working tree, a binary compiled at the stamp is still current
/// — even if unrelated (docs-only, frontend-only) commits happened since.
const SIDECAR_INPUT_PATHS: &[&str] = &[
    "packages/host",
    "packages/runtime",
    "packages/runtime-client",
    "packages/domain",
    "packages/protocol",
    "ui/agent-schemas",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "package.json",
    "scripts/build-host-sidecar.sh",
];

/// Recompile hint appended to every staleness error so the message is actionable.
const RECOMPILE_HINT: &str = "Recompile it: scripts/build-host-sidecar.sh <triple>";

/// Verify the staged host sidecar `src` is current with respect to its INPUT
/// source (`SIDECAR_INPUT_PATHS`), not merely the current HEAD.
/// `build-host-sidecar.sh` writes `<src>.stamp` with the workspace HEAD at
/// compile time; this diffs the input paths between that stamp commit and the
/// working tree. Any change to an input — committed since the stamp, staged,
/// unstaged, or untracked — means the binary predates its source and is stale;
/// for a release build that is a hard error (the caller panics). Unrelated
/// commits made after compiling do NOT trip it, since their paths are outside
/// the input set. Any git error is treated as stale (fail closed). The panic
/// messages are distinct so a developer knows WHY: unknown stamp vs inputs
/// changed since compile vs dirty tree (tracked) vs untracked inputs.
fn verify_sidecar_fresh(src: &Path, workspace: &Path) -> Result<(), String> {
    let stamp_path = PathBuf::from(format!("{}.stamp", src.display()));
    let stamped = std::fs::read_to_string(&stamp_path).map_err(|e| {
        format!(
            "the staged host sidecar has no freshness stamp at {} ({e}), so it \
             cannot be verified fresh. {RECOMPILE_HINT}",
            stamp_path.display()
        )
    })?;
    let stamp_sha = stamped.trim();
    if stamp_sha.is_empty() {
        return Err(format!(
            "the host sidecar freshness stamp at {} is empty, so it cannot be \
             verified fresh. {RECOMPILE_HINT}",
            stamp_path.display()
        ));
    }

    // 1. The stamp commit must still exist. A rebase or `git gc` can orphan the
    //    commit the binary was stamped at, leaving us nothing to diff against —
    //    fail closed rather than assume fresh.
    let commit_ref = format!("{stamp_sha}^{{commit}}");
    let out = run_git(workspace, &["cat-file", "-e", &commit_ref])?;
    if !out.status.success() {
        return Err(format!(
            "the host sidecar was compiled at commit {stamp_sha}, which is no longer \
             in this repo (rebased or garbage-collected), so it cannot be verified \
             fresh. {RECOMPILE_HINT}"
        ));
    }

    // 2. No input path changed between the stamp commit and HEAD. This is the
    //    over-fire fix: a docs-only or frontend-only commit made after compiling
    //    touches no input, so it is NOT flagged stale.
    if sidecar_paths_differ(workspace, &[stamp_sha, "HEAD"])? {
        return Err(format!(
            "the staged host sidecar is STALE: sidecar inputs changed between the \
             commit it was compiled at ({stamp_sha}) and HEAD. {RECOMPILE_HINT}"
        ));
    }

    // 3. No staged or unstaged edits to tracked input files in the working tree.
    //    This is the under-detect fix: editing sidecar source WITHOUT committing
    //    leaves HEAD unchanged, so an equality-vs-HEAD check would miss it.
    if sidecar_paths_differ(workspace, &["HEAD"])? {
        return Err(format!(
            "the staged host sidecar is STALE: the working tree has uncommitted \
             (staged or unstaged) edits to sidecar input files. {RECOMPILE_HINT}"
        ));
    }

    // 4. No untracked files under the input paths. `git diff` above ignores
    //    untracked files, so a brand-new source file added but not yet committed
    //    would slip past — `git status --porcelain` catches it.
    let mut status_args: Vec<&str> = vec!["status", "--porcelain", "--"];
    status_args.extend_from_slice(SIDECAR_INPUT_PATHS);
    let out = run_git(workspace, &status_args)?;
    if !out.status.success() {
        return Err(format!(
            "`git status` failed ({}) while verifying the host sidecar is fresh, so \
             it cannot be verified. {RECOMPILE_HINT}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    if !out.stdout.is_empty() {
        return Err(format!(
            "the staged host sidecar is STALE: there are untracked files under the \
             sidecar input paths that the compiled binary cannot contain. \
             {RECOMPILE_HINT}"
        ));
    }

    Ok(())
}

/// Run `git -C <workspace> <args>` and return its captured output. A spawn
/// failure is an `Err` the caller turns into a panic — a release build must not
/// ship a sidecar it could not verify.
fn run_git(workspace: &Path, args: &[&str]) -> Result<std::process::Output, String> {
    std::process::Command::new("git")
        .arg("-C")
        .arg(workspace)
        .args(args)
        .output()
        .map_err(|e| format!("could not run git to verify the host sidecar is fresh: {e}"))
}

/// Run `git diff --quiet <base_args> -- <SIDECAR_INPUT_PATHS>`. `git diff
/// --quiet` uses its exit code as the answer: 0 = no difference, 1 = the paths
/// differ, and anything else is a git error. Returns `Ok(true)` when the inputs
/// differ, `Ok(false)` when identical, and `Err` for any other exit code (a git
/// error the callers treat as fail-closed). Distinguishing 1 from >1 matters:
/// >1 must not be read as "differs" nor as "same".
fn sidecar_paths_differ(workspace: &Path, base_args: &[&str]) -> Result<bool, String> {
    let mut args: Vec<&str> = vec!["diff", "--quiet"];
    args.extend_from_slice(base_args);
    args.push("--");
    args.extend_from_slice(SIDECAR_INPUT_PATHS);
    let out = run_git(workspace, &args)?;
    match out.status.code() {
        Some(0) => Ok(false),
        Some(1) => Ok(true),
        other => Err(format!(
            "`git diff --quiet {}` exited with {} while verifying the host sidecar \
             is fresh: {}",
            base_args.join(" "),
            other
                .map(|c| c.to_string())
                .unwrap_or_else(|| "a signal".to_string()),
            String::from_utf8_lossy(&out.stderr).trim()
        )),
    }
}

/// Stage the bundled frpc tunnel client as the Tauri externalBin
/// `binaries/frpc-<triple>`.
///
/// Source: `target/frpc/frpc-<triple>[.exe]`, produced by
/// `scripts/fetch-frpc.sh` (or the release CI frpc-fetch step). Missing frpc →
/// a placeholder that exits non-zero (so a tunnel attempt fails loudly), NOT a
/// build failure: frp is only needed when the user actually tunnels a local
/// model, so an app build must never hard-depend on having fetched it.
fn stage_frpc_sidecar() -> Result<(), String> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace = manifest
        .parent()
        .and_then(|p| p.parent())
        .ok_or("could not resolve workspace root from CARGO_MANIFEST_DIR")?;
    let triple = std::env::var("TARGET").unwrap_or_default();
    let ext = if cfg!(windows) { ".exe" } else { "" };

    let src_dir = workspace.join("target").join("frpc");
    let mut candidates: Vec<PathBuf> = Vec::new();
    if !triple.is_empty() {
        candidates.push(src_dir.join(format!("frpc-{triple}{ext}")));
    }
    candidates.push(src_dir.join(format!("frpc{ext}")));

    // Re-run when a fetched frpc appears/changes so a staged placeholder is
    // replaced on the next build (mirrors the host-sidecar staging).
    for candidate in &candidates {
        println!("cargo:rerun-if-changed={}", candidate.display());
    }

    let dest_dir = manifest.join("binaries");
    std::fs::create_dir_all(&dest_dir).map_err(|e| format!("mkdir binaries: {e}"))?;
    let dest_name = if triple.is_empty() {
        format!("frpc{ext}")
    } else {
        format!("frpc-{triple}{ext}")
    };
    let dest = dest_dir.join(&dest_name);

    match candidates.iter().find(|p| p.exists()) {
        Some(src) => {
            std::fs::copy(src, &dest).map_err(|e| format!("copy frpc: {e}"))?;
            println!(
                "cargo:warning=frpc: staged {} -> {}",
                src.display(),
                dest.display()
            );
        }
        None => {
            let placeholder = if cfg!(windows) {
                "@echo off\r\necho frpc not bundled - run scripts/fetch-frpc.sh 1>&2\r\nexit /b 1\r\n"
            } else {
                "#!/bin/sh\necho 'frpc not bundled - run scripts/fetch-frpc.sh' >&2\nexit 1\n"
            };
            std::fs::write(&dest, placeholder)
                .map_err(|e| format!("write frpc placeholder: {e}"))?;
            println!(
                "cargo:warning=frpc binary not fetched - staged a placeholder at {} (run scripts/fetch-frpc.sh for a real tunnel)",
                dest.display()
            );
        }
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&dest)
            .map_err(|e| format!("stat frpc: {e}"))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&dest, perms).map_err(|e| format!("chmod frpc: {e}"))?;
    }
    Ok(())
}

/// Stage the bundled whisper.cpp dictation sidecar as the Tauri externalBin
/// `binaries/whisper-cli-<triple>`.
///
/// Source: `target/whisper/whisper-cli-<triple>[.exe]`, produced by
/// `scripts/build-whisper.sh` (or the release CI whisper-build step). Missing
/// whisper-cli → a placeholder that exits non-zero (so a dictation attempt
/// fails loudly), NOT a build failure — even for a release build. Local
/// dictation is only exercised when the user voice-types, so an app build must
/// never hard-depend on having built it. This staging is deliberately kept
/// independent of the host-sidecar fail-closed stamp guard: a broken whisper
/// build is caught by the release workflow's `test -x` gate, not build.rs.
fn stage_whisper_sidecar() -> Result<(), String> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace = manifest
        .parent()
        .and_then(|p| p.parent())
        .ok_or("could not resolve workspace root from CARGO_MANIFEST_DIR")?;
    let triple = std::env::var("TARGET").unwrap_or_default();
    let ext = if cfg!(windows) { ".exe" } else { "" };

    let src_dir = workspace.join("target").join("whisper");
    let mut candidates: Vec<PathBuf> = Vec::new();
    if !triple.is_empty() {
        candidates.push(src_dir.join(format!("whisper-cli-{triple}{ext}")));
    }
    candidates.push(src_dir.join(format!("whisper-cli{ext}")));

    // Re-run when a built whisper-cli appears/changes so a staged placeholder is
    // replaced on the next build (mirrors the frpc + host-sidecar staging).
    for candidate in &candidates {
        println!("cargo:rerun-if-changed={}", candidate.display());
    }

    let dest_dir = manifest.join("binaries");
    std::fs::create_dir_all(&dest_dir).map_err(|e| format!("mkdir binaries: {e}"))?;
    let dest_name = if triple.is_empty() {
        format!("whisper-cli{ext}")
    } else {
        format!("whisper-cli-{triple}{ext}")
    };
    let dest = dest_dir.join(&dest_name);

    match candidates.iter().find(|p| p.exists()) {
        Some(src) => {
            std::fs::copy(src, &dest).map_err(|e| format!("copy whisper-cli: {e}"))?;
            println!(
                "cargo:warning=whisper-cli: staged {} -> {}",
                src.display(),
                dest.display()
            );
        }
        None => {
            let placeholder = if cfg!(windows) {
                "@echo off\r\necho whisper-cli not built - run scripts/build-whisper.sh 1>&2\r\nexit /b 1\r\n"
            } else {
                "#!/bin/sh\necho 'whisper-cli not built - run scripts/build-whisper.sh' >&2\nexit 1\n"
            };
            std::fs::write(&dest, placeholder)
                .map_err(|e| format!("write whisper-cli placeholder: {e}"))?;
            println!(
                "cargo:warning=whisper-cli binary not built - staged a placeholder at {} (run scripts/build-whisper.sh for local dictation)",
                dest.display()
            );
        }
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&dest)
            .map_err(|e| format!("stat whisper-cli: {e}"))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&dest, perms).map_err(|e| format!("chmod whisper-cli: {e}"))?;
    }
    Ok(())
}
