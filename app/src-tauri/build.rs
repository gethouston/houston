use std::path::PathBuf;

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
fn stage_host_sidecar() -> Result<(), String> {
    stage_external_bin("houston-host", "houston-engine", "host-sidecar")
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
    stage_external_bin("claude", "claude", "claude")
}

/// Copy `target/host-sidecar/<source_stem>-<triple>[.exe]` to the Tauri
/// externalBin `binaries/<dest_stem>-<triple>[.exe]`. Shared by the host sidecar
/// and the Claude Code binary — both are produced by
/// `scripts/build-host-sidecar.sh` and bundled side-by-side. `label` prefixes
/// the cargo warnings so the two stagings are distinguishable in build output.
///
/// Missing source → debug builds stage a harmless placeholder; release builds
/// return `Err` (the caller panics). See the wrapper docs for the rationale.
fn stage_external_bin(source_stem: &str, dest_stem: &str, label: &str) -> Result<(), String> {
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
            // a placeholder.
            let placeholder = if cfg!(windows) {
                "@echo off\r\nexit /b 0\r\n"
            } else {
                "#!/bin/sh\n# placeholder external bin (real binary not staged)\nsleep 2147483647\n"
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
