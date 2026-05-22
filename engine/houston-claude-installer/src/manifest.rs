//! Manifest resolution for the runtime installer.
//!
//! Production: the bundled `cli-deps.json` shipped inside the .app via
//! `houston-cli-bundle::load_bundled_manifest()` is always present and
//! always wins.
//!
//! Dev (cargo run, no bundle): walk up from CWD looking for a sibling
//! `cli-deps.json` so engineers iterating on the engine still hit the
//! same auto-install behavior as a packaged release.

use houston_cli_bundle::CliDepsManifest;

/// Resolve the `cli-deps.json` manifest. See module docs.
pub(crate) fn resolve_manifest() -> Option<CliDepsManifest> {
    if let Some(m) = houston_cli_bundle::load_bundled_manifest() {
        return Some(m);
    }
    // allow-silent-failure: CWD unavailable in degraded environments
    // (chroot without /proc, etc.). The lifecycle entry treats `None`
    // here as "no manifest" and emits `ClaudeCliReady` so the user can
    // still use Codex; production never hits this path.
    let cwd = std::env::current_dir().ok()?;
    let mut here = cwd.as_path();
    loop {
        let candidate = here.join("cli-deps.json");
        if candidate.is_file() {
            // allow-silent-failure: dev fallback only. A malformed
            // `cli-deps.json` in a dev checkout is treated as "no
            // manifest" so the lifecycle entry emits `ClaudeCliReady`
            // and the engineer notices the broken JSON on next iteration.
            // Production loads the bundled manifest above, which CI verifies.
            return CliDepsManifest::load(&candidate).ok();
        }
        match here.parent() {
            Some(p) => here = p,
            None => return None,
        }
    }
}
