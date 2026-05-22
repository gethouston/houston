//! Houston-managed `HOME` runtime for spawned `gemini` subprocesses.
//!
//! Gemini-cli loads `<HOME>/.gemini/GEMINI.md` as global memory on every
//! invocation (upstream v0.42.0, `packages/core/src/utils/memoryDiscovery.ts`)
//! and its memory tool auto-appends the user's cross-project preferences
//! to that file. Houston sessions therefore inherit notes from the
//! user's other projects (Ombra, Alpine.js, ...) and answer Houston
//! tasks with the wrong context.
//!
//! Fix: spawn with `HOME` pointed at `<houston_data>/runtime/gemini-home/`
//! containing only `.gemini/{oauth_creds,google_accounts}.json` symlinked
//! from the real home (so OAuth still works) plus a Houston-written
//! `settings.json`. No `GEMINI.md`, so global memory discovery finds
//! nothing. Per-agent context still flows because gemini-cli walks UP
//! from cwd looking for `GEMINI.md`, and `seed_agent` symlinks
//! `GEMINI.md → CLAUDE.md` in the agent dir.
//!
//! Idempotent: re-checks symlink targets and settings content on every
//! call, only rewrites on drift.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// Build a deterministic settings.json body. Hand-formatted (not via
/// `serde_json::to_string`) so byte-identical output across calls keeps
/// the drift-detection check trivial.
fn settings_json(selected_auth_type: &str) -> String {
    format!(
        "{{\"general\":{{\"previewFeatures\":true,\"sessionRetention\":{{\"enabled\":false}}}},\
\"security\":{{\"auth\":{{\"selectedType\":{}}}}}}}",
        serde_json::Value::String(selected_auth_type.to_string())
    )
}

/// Read the user's real `~/.gemini/settings.json` and extract
/// `security.auth.selectedType`. Falls back to `"oauth-personal"` —
/// the dominant Houston install path uses Google OAuth via gemini-cli.
fn detect_selected_auth_type(real_home_gemini_dir: &Path) -> String {
    let path = real_home_gemini_dir.join("settings.json");
    let Ok(bytes) = fs::read(&path) else {
        return "oauth-personal".to_string();
    };
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
        return "oauth-personal".to_string();
    };
    value
        .pointer("/security/auth/selectedType")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("oauth-personal")
        .to_string()
}

/// Build the sibling `.<name>.houston-tmp` staging path used for
/// atomic create-then-rename of symlinks and config files.
fn tmp_sibling(path: &Path) -> io::Result<PathBuf> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no parent"))?;
    let name = path
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no file name"))?;
    let mut tmp = std::ffi::OsString::from(".");
    tmp.push(name);
    tmp.push(".houston-tmp");
    Ok(parent.join(tmp))
}

/// Ensure `link` is a symlink to `target`. Replaces any existing entry
/// atomically: build at a sibling temp path, then `rename` (which is
/// atomic on Unix for same-filesystem entries — always true here).
#[cfg(unix)]
fn ensure_symlink(target: &Path, link: &Path) -> io::Result<()> {
    use std::os::unix::fs::symlink;
    let tmp = tmp_sibling(link)?;
    let _ = fs::remove_file(&tmp);
    symlink(target, &tmp)?;
    fs::rename(&tmp, link)
}

/// Windows symlinks need Developer Mode or admin and can fail on stock
/// installs. Try a real symlink first, fall back to copying the file
/// (small JSON, only re-copied on drift). Atomic in both branches:
/// build at a sibling temp path, then `rename` over (Rust's `fs::rename`
/// atomically replaces an existing entry on Windows since 1.45).
///
/// Tolerates a missing `target`: Unix's `symlink(2)` creates dangling
/// links and reads start working once the user logs in. The Windows
/// `symlink_file` permission-denied path falls through to `fs::copy`,
/// which fails with ENOENT (os error 2) on a missing source — that
/// would break first-time gemini users who have not written
/// `~/.gemini/.env` or completed OAuth yet. Treat the missing source
/// as "skip this entry": remove any stale entry at `link` so a
/// previous run's content isn't mistaken for current state.
#[cfg(windows)]
fn ensure_symlink(target: &Path, link: &Path) -> io::Result<()> {
    use std::os::windows::fs::symlink_file;
    let tmp = tmp_sibling(link)?;
    let _ = fs::remove_file(&tmp);
    if symlink_file(target, &tmp).is_ok() {
        return fs::rename(&tmp, link);
    }
    // Symlink denied. Try copy. If the source is missing, drop any stale
    // entry at `link` and return Ok — there is nothing to point at yet.
    match fs::copy(target, &tmp) {
        Ok(_) => fs::rename(&tmp, link),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let _ = fs::remove_file(link);
            Ok(())
        }
        Err(e) => Err(e),
    }
}

/// Atomic write-then-rename. Skips the write when content already
/// matches so inode + mtime stay stable across no-op calls.
fn write_if_changed(path: &Path, content: &str) -> io::Result<()> {
    if let Ok(existing) = fs::read_to_string(path) {
        if existing == content {
            return Ok(());
        }
    }
    let tmp = tmp_sibling(path)?;
    let _ = fs::remove_file(&tmp);
    fs::write(&tmp, content)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        // Settings.json mirrors the user's selectedType — not strictly
        // a secret, but it's adjacent to the OAuth credential symlinks
        // and consistent owner-only mode keeps the whole .gemini tree
        // hardened. Propagate the failure rather than ship a settings
        // file silently readable by other users.
        fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600))?;
    }
    fs::rename(&tmp, path)
}

/// Resolve the Houston data root. Mirrors `houston_db::db::houston_dir`
/// (duplicated because terminal-manager sits below the DB crate in the
/// workspace graph): `HOUSTON_HOME` env wins, otherwise `~/.dev-houston`
/// in debug builds and `~/.houston` in release. Keep the two copies in
/// sync.
pub fn houston_data_root() -> PathBuf {
    if let Ok(override_path) = std::env::var("HOUSTON_HOME") {
        return PathBuf::from(override_path);
    }
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let subdir = if cfg!(debug_assertions) {
        ".dev-houston"
    } else {
        ".houston"
    };
    home.join(subdir)
}

/// Resolve the user's real `$HOME` (where their actual `~/.gemini/`
/// credentials live). Errors when `dirs::home_dir()` fails — there is
/// nowhere to point the credential symlinks. Callers must surface (no
/// silent fallback) since falling through to the user's real HOME
/// re-introduces the memory bleed this isolation prevents.
pub fn resolve_real_home() -> io::Result<PathBuf> {
    dirs::home_dir().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "dirs::home_dir() returned None; cannot stage gemini runtime home",
        )
    })
}

/// Build / refresh the Houston-managed `HOME` directory used when
/// spawning `gemini` subprocesses. Returns the absolute path the caller
/// passes via `cmd.env("HOME", ...)`.
///
/// Layout under `<houston_data>/runtime/gemini-home/.gemini/`:
///   * `oauth_creds.json`     — symlink to `<real_home>/.gemini/oauth_creds.json`
///   * `google_accounts.json` — symlink to `<real_home>/.gemini/google_accounts.json`
///   * `.env`                 — symlink to `<real_home>/.gemini/.env` (API-key auth path)
///   * `settings.json`        — Houston-written, mirrors user's `selectedType`
///
/// Idempotent: rewrites only on drift.
///
/// `real_home` is taken as a parameter so tests can stage a tempdir
/// without mutating the process-global `HOME` env var (which races with
/// parallel cargo tests). Production callers pass [`resolve_real_home`].
pub fn ensure_gemini_runtime_home(houston_data: &Path, real_home: &Path) -> io::Result<PathBuf> {
    let real_gemini = real_home.join(".gemini");

    let runtime_home = houston_data.join("runtime").join("gemini-home");
    let runtime_gemini = runtime_home.join(".gemini");
    fs::create_dir_all(&runtime_gemini)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        // 0700 — symlinks point at OAuth token files; owner-only.
        // Propagate failures rather than silently shipping a
        // world-readable directory containing credential symlinks.
        fs::set_permissions(&runtime_home, fs::Permissions::from_mode(0o700))?;
        fs::set_permissions(&runtime_gemini, fs::Permissions::from_mode(0o700))?;
    }

    // Symlink credential files. A missing real-home file is fine — the
    // user just hasn't logged in yet; the CLI surfaces unauth itself
    // and the link starts working the moment auth completes. Three
    // links cover both auth modes Houston supports:
    //  - oauth_creds.json + google_accounts.json: OAuth ("Sign in with Google")
    //  - .env: API-key auth (Houston writes GEMINI_API_KEY=... here via
    //    the gemini_credentials route). Without this third symlink, any
    //    user on API-key auth would be unauthenticated under isolation.
    ensure_symlink(
        &real_gemini.join("oauth_creds.json"),
        &runtime_gemini.join("oauth_creds.json"),
    )?;
    ensure_symlink(
        &real_gemini.join("google_accounts.json"),
        &runtime_gemini.join("google_accounts.json"),
    )?;
    ensure_symlink(&real_gemini.join(".env"), &runtime_gemini.join(".env"))?;

    let selected = detect_selected_auth_type(&real_gemini);
    write_if_changed(
        &runtime_gemini.join("settings.json"),
        &settings_json(&selected),
    )?;

    // Defensive: nuke any stale GEMINI.md a developer may have dropped
    // in. The whole point is that global memory discovery finds nothing
    // — if removal fails (e.g. permission denied), the isolation
    // guarantee is broken and we must surface that, not log-and-skip.
    let stale = runtime_gemini.join("GEMINI.md");
    if fs::symlink_metadata(&stale).is_ok() {
        fs::remove_file(&stale)?;
    }

    Ok(runtime_home)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[cfg(unix)]
    fn fake_home_with_gemini(tmp: &TempDir, settings: Option<&str>) -> PathBuf {
        let home = tmp.path().join("real-home");
        let gemini = home.join(".gemini");
        fs::create_dir_all(&gemini).unwrap();
        fs::write(gemini.join("oauth_creds.json"), "{\"access_token\":\"x\"}").unwrap();
        fs::write(gemini.join("google_accounts.json"), "{\"active\":\"u@x\"}").unwrap();
        fs::write(gemini.join(".env"), "GEMINI_API_KEY=test-key-value\n").unwrap();
        if let Some(s) = settings {
            fs::write(gemini.join("settings.json"), s).unwrap();
        }
        home
    }

    #[test]
    fn settings_json_mirrors_oauth_personal() {
        let s = settings_json("oauth-personal");
        let v: serde_json::Value = serde_json::from_str(&s).unwrap();
        assert_eq!(v["security"]["auth"]["selectedType"], "oauth-personal");
        assert_eq!(v["general"]["previewFeatures"], true);
        assert_eq!(v["general"]["sessionRetention"]["enabled"], false);
        assert!(v.get("mcpServers").is_none(), "must NOT carry mcpServers");
        assert!(v.get("model").is_none(), "must NOT pin a model");
    }

    #[test]
    fn detect_selected_auth_type_falls_back_when_settings_missing() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join(".gemini");
        // No settings.json present.
        assert_eq!(detect_selected_auth_type(&dir), "oauth-personal");
    }

    #[test]
    fn detect_selected_auth_type_mirrors_user_choice() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join(".gemini");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("settings.json"),
            r#"{"security":{"auth":{"selectedType":"gemini-api-key"}}}"#,
        )
        .unwrap();
        assert_eq!(detect_selected_auth_type(&dir), "gemini-api-key");
    }

    #[cfg(unix)]
    #[test]
    fn ensure_runtime_home_symlinks_credentials() {
        let tmp = TempDir::new().unwrap();
        let home = fake_home_with_gemini(&tmp, None);
        let houston_data = tmp.path().join("houston-data");

        let runtime_home = ensure_gemini_runtime_home(&houston_data, &home).unwrap();

        let oauth = runtime_home.join(".gemini/oauth_creds.json");
        let accounts = runtime_home.join(".gemini/google_accounts.json");
        let settings = runtime_home.join(".gemini/settings.json");

        assert!(oauth.is_symlink(), "oauth_creds.json must be a symlink");
        assert!(
            accounts.is_symlink(),
            "google_accounts.json must be a symlink"
        );
        assert_eq!(
            fs::read_link(&oauth).unwrap(),
            home.join(".gemini/oauth_creds.json")
        );
        assert_eq!(
            fs::read_link(&accounts).unwrap(),
            home.join(".gemini/google_accounts.json")
        );

        // Following the symlink must yield the real file content.
        assert_eq!(
            fs::read_to_string(&oauth).unwrap(),
            "{\"access_token\":\"x\"}"
        );

        // Settings was written; default auth type is oauth-personal.
        let s = fs::read_to_string(&settings).unwrap();
        assert!(s.contains("\"oauth-personal\""));

        // No GEMINI.md leaked into the runtime home.
        assert!(!runtime_home.join(".gemini/GEMINI.md").exists());
    }

    #[cfg(unix)]
    #[test]
    fn ensure_runtime_home_is_idempotent() {
        let tmp = TempDir::new().unwrap();
        let home = fake_home_with_gemini(&tmp, None);
        let houston_data = tmp.path().join("houston-data");

        let first = ensure_gemini_runtime_home(&houston_data, &home).unwrap();
        let second = ensure_gemini_runtime_home(&houston_data, &home).unwrap();
        assert_eq!(first, second);

        // Settings file inode/content stable across calls — drift
        // detection avoids needless rewrites.
        let settings = houston_data.join("runtime/gemini-home/.gemini/settings.json");
        let mtime_a = fs::metadata(&settings).unwrap().modified().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        ensure_gemini_runtime_home(&houston_data, &home).unwrap();
        let mtime_b = fs::metadata(&settings).unwrap().modified().unwrap();
        assert_eq!(mtime_a, mtime_b, "no-op call must not rewrite settings");
    }

    #[cfg(unix)]
    #[test]
    fn ensure_runtime_home_mirrors_user_selected_auth_type() {
        let tmp = TempDir::new().unwrap();
        let home = fake_home_with_gemini(
            &tmp,
            Some(r#"{"security":{"auth":{"selectedType":"gemini-api-key"}}}"#),
        );
        let houston_data = tmp.path().join("houston-data");

        ensure_gemini_runtime_home(&houston_data, &home).unwrap();

        let s = fs::read_to_string(houston_data.join("runtime/gemini-home/.gemini/settings.json"))
            .unwrap();
        assert!(s.contains("\"gemini-api-key\""));
    }

    #[cfg(unix)]
    #[test]
    fn ensure_runtime_home_replaces_stale_gemini_md() {
        let tmp = TempDir::new().unwrap();
        let home = fake_home_with_gemini(&tmp, None);
        let houston_data = tmp.path().join("houston-data");

        // Pre-stage a stale GEMINI.md in the runtime location to
        // simulate something a curious developer may have written.
        let stale_dir = houston_data.join("runtime/gemini-home/.gemini");
        fs::create_dir_all(&stale_dir).unwrap();
        fs::write(stale_dir.join("GEMINI.md"), "stale memory bleed").unwrap();

        ensure_gemini_runtime_home(&houston_data, &home).unwrap();

        assert!(!stale_dir.join("GEMINI.md").exists());
    }

    #[cfg(unix)]
    #[test]
    fn ensure_runtime_home_symlinks_dotenv_for_api_key_auth() {
        // Users on API-key auth have GEMINI_API_KEY in ~/.gemini/.env
        // (Houston writes it via the gemini_credentials route). Without
        // this third symlink the API-key user would be silently
        // unauthenticated under isolation. Regression guard.
        let tmp = TempDir::new().unwrap();
        let home = fake_home_with_gemini(&tmp, None);
        let houston_data = tmp.path().join("houston-data");

        let runtime_home = ensure_gemini_runtime_home(&houston_data, &home).unwrap();

        let env = runtime_home.join(".gemini/.env");
        assert!(env.is_symlink(), ".env must be a symlink for API-key auth");
        assert_eq!(fs::read_link(&env).unwrap(), home.join(".gemini/.env"));
        assert_eq!(
            fs::read_to_string(&env).unwrap(),
            "GEMINI_API_KEY=test-key-value\n"
        );
    }

    #[test]
    fn ensure_runtime_home_tolerates_missing_credential_files() {
        // First-time gemini users do not yet have `~/.gemini/oauth_creds.json`,
        // `google_accounts.json`, or `.env`. On Unix the symlinks dangle and
        // reads fail with ENOENT; on Windows without Dev Mode the copy
        // fallback would error with ENOENT and abort the whole runtime-home
        // prep — exactly the "Failed to prepare gemini runtime home" toast
        // the user reported. Both platforms must succeed without those
        // source files, and on Windows the runtime entries must simply be
        // absent (no stale content masquerading as fresh state).
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join("real-home");
        let gemini = home.join(".gemini");
        fs::create_dir_all(&gemini).unwrap();
        // Note: NO oauth_creds.json, google_accounts.json, or .env written.
        let houston_data = tmp.path().join("houston-data");

        let runtime_home = ensure_gemini_runtime_home(&houston_data, &home).unwrap();

        // settings.json must still exist (Houston-written, not symlinked).
        assert!(runtime_home.join(".gemini/settings.json").exists());

        #[cfg(windows)]
        {
            // Copy fallback on Windows: missing source → no entry. Reads
            // by gemini-cli will return ENOENT, matching Unix's dangling
            // symlink behavior at read time.
            assert!(!runtime_home.join(".gemini/oauth_creds.json").exists());
            assert!(!runtime_home.join(".gemini/google_accounts.json").exists());
            assert!(!runtime_home.join(".gemini/.env").exists());
        }
    }

    #[cfg(unix)]
    #[test]
    fn ensure_runtime_home_dir_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let tmp = TempDir::new().unwrap();
        let home = fake_home_with_gemini(&tmp, None);
        let houston_data = tmp.path().join("houston-data");
        ensure_gemini_runtime_home(&houston_data, &home).unwrap();
        let mode = fs::metadata(houston_data.join("runtime/gemini-home"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o700, "runtime home must be owner-only");
    }
}
