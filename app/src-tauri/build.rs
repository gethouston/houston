use std::path::PathBuf;

fn main() {
    let dotenv_pairs = load_dotenv_pairs();
    configure_bug_report_env(&dotenv_pairs);
    configure_auth_storage(&dotenv_pairs);

    // Stage the houston-engine binary into `binaries/houston-engine-<triple>`
    // so tauri's `externalBin` picks it up for bundling. The user is expected
    // to run `cargo build -p houston-engine-server --release` first; CI wires
    // that into the release workflow. If the binary is missing we print a
    // warning but don't fail — dev builds resolve the engine binary from the
    // cargo target directory at runtime (see engine_supervisor::resolve_*).
    if let Err(e) = stage_engine_sidecar() {
        println!("cargo:warning=houston-engine sidecar staging skipped: {e}");
    }

    // Ensure the bundled-CLI staging directory exists. Tauri's `bundle.resources`
    // points at `resources/bin` and its resource walker errors out if the
    // directory is missing entirely (a real config error would still surface
    // — empty walks are silent). CI populates this dir via
    // `scripts/fetch-cli-deps.sh both` before invoking the bundler. Local
    // `bun run tauri dev` builds don't strictly need bundled CLIs (engine
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
    let src = candidates
        .iter()
        .find(|p| p.exists())
        .ok_or(format!("houston-engine not built — tried {:?}", candidates))?;

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
    std::fs::copy(src, &dest).map_err(|e| format!("copy engine sidecar: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&dest)
            .map_err(|e| format!("stat sidecar: {e}"))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&dest, perms).map_err(|e| format!("chmod sidecar: {e}"))?;
    }
    println!("cargo:rerun-if-changed={}", src.display());
    Ok(())
}
