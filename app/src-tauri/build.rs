use std::path::PathBuf;

fn main() {
    let dotenv_pairs = load_dotenv_pairs();
    configure_bug_report_env(&dotenv_pairs);
    configure_auth_storage(&dotenv_pairs);
    configure_sentry_env(&dotenv_pairs);

    // Stage the sidecar into `binaries/houston-engine-<triple>` so tauri's
    // `externalBin` picks it up for bundling. Two sources, chosen by the
    // `host-sidecar` cargo feature:
    //   - default        → the Rust engine (`houston-engine`), staged from the
    //                       cargo target dir. The user is expected to run
    //                       `cargo build -p houston-engine-server --release`
    //                       first; CI wires that into the release workflow.
    //                       Missing → warn, don't fail (dev builds resolve it at
    //                       runtime, and host/cutover dev mode skips spawning it).
    //   - `host-sidecar` → the Bun-compiled Houston host, staged from
    //                       `target/host-sidecar/houston-host-<triple>`.
    //                       Missing → FAIL: a host-sidecar build with no host
    //                       ships a non-functional app (no runtime fallback).
    //                       Run `scripts/build-host-sidecar.sh` first.
    // Both reuse the SAME externalBin name (`houston-engine-<triple>`), so
    // tauri.conf.json never has to branch on the feature.
    //
    // We check `CARGO_FEATURE_HOST_SIDECAR` (cargo sets it for every enabled
    // feature) rather than `cfg!`, because build scripts can't see their own
    // crate's `cfg` features.
    println!("cargo:rerun-if-env-changed=CARGO_FEATURE_HOST_SIDECAR");
    if std::env::var_os("CARGO_FEATURE_HOST_SIDECAR").is_some() {
        if let Err(e) = stage_host_sidecar() {
            panic!(
                "host-sidecar feature enabled but the compiled host could not be staged: {e}\n\
                 Run `scripts/build-host-sidecar.sh` to bun-compile it first."
            );
        }
    } else if let Err(e) = stage_engine_sidecar() {
        println!("cargo:warning=houston-engine sidecar staging skipped: {e}");
    }

    // Ensure the bundled-CLI staging directory exists. Tauri's `bundle.resources`
    // points at `resources/bin` and its resource walker errors out if the
    // directory is missing entirely (a real config error would still surface
    // — empty walks are silent). CI populates this dir via
    // `scripts/fetch-cli-deps.sh both` before invoking the bundler. Local
    // `pnpm tauri dev` builds don't strictly need bundled CLIs (engine
    // falls back to PATH lookup / `~/.composio` install), so we create
    // an empty dir here to keep the config valid without forcing every
    // developer to fetch ~700 MB of binaries on first checkout.
    ensure_resources_bin_dir();

    tauri_build::build()
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

fn ensure_resources_bin_dir() {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dir = manifest.join("resources").join("bin");
    if let Err(e) = std::fs::create_dir_all(&dir) {
        println!(
            "cargo:warning=could not create {} (Tauri bundle.resources may fail): {e}",
            dir.display()
        );
    }
}

fn stage_engine_sidecar() -> Result<(), String> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace = manifest
        .parent()
        .and_then(|p| p.parent())
        .ok_or("could not resolve workspace root from CARGO_MANIFEST_DIR")?;
    let triple = std::env::var("TARGET").unwrap_or_default();
    let bin_name = if cfg!(windows) {
        "houston-engine.exe"
    } else {
        "houston-engine"
    };

    // Pick the first existing source. Ordering:
    //   1. `target/<triple>/release/` — required for universal-apple-darwin
    //      because tauri invokes cargo once per real triple (aarch64 + x86_64)
    //      and each invocation needs the engine built for THAT triple.
    //   2. `target/release/` — single-triple release (local `pnpm tauri build`).
    //   3. `target/<triple>/debug/` — rarely used but keeps `tauri dev --target`
    //      happy.
    //   4. `target/debug/` — default dev build.
    let mut candidates: Vec<PathBuf> = Vec::new();
    if !triple.is_empty() {
        candidates.push(
            workspace
                .join("target")
                .join(&triple)
                .join("release")
                .join(bin_name),
        );
    }
    candidates.push(workspace.join("target").join("release").join(bin_name));
    if !triple.is_empty() {
        candidates.push(
            workspace
                .join("target")
                .join(&triple)
                .join("debug")
                .join(bin_name),
        );
    }
    candidates.push(workspace.join("target").join("debug").join(bin_name));
    let src = candidates.iter().find(|p| p.exists());

    let dest_dir = manifest.join("binaries");
    std::fs::create_dir_all(&dest_dir).map_err(|e| format!("mkdir binaries: {e}"))?;
    let dest_name = if triple.is_empty() {
        bin_name.to_string()
    } else if cfg!(windows) {
        format!("houston-engine-{triple}.exe")
    } else {
        format!("houston-engine-{triple}")
    };
    let dest = dest_dir.join(&dest_name);
    match src {
        Some(src) => {
            std::fs::copy(src, &dest).map_err(|e| format!("copy engine sidecar: {e}"))?;
            println!("cargo:rerun-if-changed={}", src.display());
        }
        None => {
            // The Rust engine isn't built — the single-engine cutover dev loop
            // runs the desktop against the external Houston host and never
            // spawns this sidecar (see lib.rs host_mode). Tauri's externalBin
            // bundling still requires the file to exist, so stage a harmless
            // placeholder. Host mode skips spawning it; a real Rust build would
            // spawn it and (correctly) fail the /v1/health gate, signalling
            // "build houston-engine-server first".
            let placeholder = if cfg!(windows) {
                "@echo off\r\nexit /b 0\r\n"
            } else {
                "#!/bin/sh\n# placeholder houston-engine (real engine not built)\nsleep 2147483647\n"
            };
            std::fs::write(&dest, placeholder)
                .map_err(|e| format!("write placeholder sidecar: {e}"))?;
            println!(
                "cargo:warning=houston-engine not built — staged a placeholder at {} (cutover/host mode skips it; build houston-engine-server for a real Rust build)",
                dest.display()
            );
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&dest)
            .map_err(|e| format!("stat sidecar: {e}"))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&dest, perms).map_err(|e| format!("chmod sidecar: {e}"))?;
    }
    Ok(())
}

/// Stage the Bun-compiled Houston host (the `host-sidecar` feature path) as the
/// Tauri externalBin `binaries/houston-engine-<triple>`.
///
/// Source: `target/host-sidecar/houston-host-<triple>[.exe]`, produced by
/// `scripts/build-host-sidecar.sh` (or the release CI host-compile step). We
/// keep the destination name identical to the Rust engine's so tauri.conf.json's
/// `externalBin` list stays untouched — at runtime the supervisor spawns whatever
/// binary is staged there and parses its `HOUSTON_HOST_LISTENING` banner.
///
/// Unlike the Rust-engine path, a missing host binary is a HARD ERROR (the
/// caller `panic!`s): there is no host-mode runtime fallback for a packaged
/// `--features host-sidecar` build, so shipping the placeholder would yield an
/// app that never serves.
fn stage_host_sidecar() -> Result<(), String> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace = manifest
        .parent()
        .and_then(|p| p.parent())
        .ok_or("could not resolve workspace root from CARGO_MANIFEST_DIR")?;
    let triple = std::env::var("TARGET").unwrap_or_default();
    let ext = if cfg!(windows) { ".exe" } else { "" };

    // The compile script names outputs by the same rust triple Tauri uses as the
    // externalBin suffix, so for a given `cargo --target <triple>` invocation the
    // host binary is at exactly this path.
    let host_dir = workspace.join("target").join("host-sidecar");
    let mut candidates: Vec<PathBuf> = Vec::new();
    if !triple.is_empty() {
        candidates.push(host_dir.join(format!("houston-host-{triple}{ext}")));
    }
    // Fallback for a default-triple build where TARGET is unset: a single
    // host-host-<anything> output in the dir.
    candidates.push(host_dir.join(format!("houston-host{ext}")));
    let src = candidates.iter().find(|p| p.exists()).ok_or_else(|| {
        format!(
            "no compiled host found. Tried:\n  - {}\n  (run `scripts/build-host-sidecar.sh`)",
            candidates
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>()
                .join("\n  - ")
        )
    })?;

    let dest_dir = manifest.join("binaries");
    std::fs::create_dir_all(&dest_dir).map_err(|e| format!("mkdir binaries: {e}"))?;
    // SAME externalBin name as the Rust engine — see the module-level comment.
    let dest_name = if triple.is_empty() {
        format!("houston-engine{ext}")
    } else {
        format!("houston-engine-{triple}{ext}")
    };
    let dest = dest_dir.join(&dest_name);
    std::fs::copy(src, &dest).map_err(|e| format!("copy host sidecar: {e}"))?;
    println!("cargo:rerun-if-changed={}", src.display());
    println!(
        "cargo:warning=host-sidecar: staged compiled host {} -> {}",
        src.display(),
        dest.display()
    );

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&dest)
            .map_err(|e| format!("stat sidecar: {e}"))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&dest, perms).map_err(|e| format!("chmod sidecar: {e}"))?;
    }
    Ok(())
}
