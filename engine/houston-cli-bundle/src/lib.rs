//! Resolve bundled CLI binaries that ship inside the Houston `.app`.
//!
//! Houston bundles two upstream CLIs into the signed/notarized desktop app
//! so non-technical users get them preinstalled with zero terminal exposure:
//!
//! - **codex** (Apache-2.0, OpenAI) — Rust binary, `lipo`'d into a single
//!   universal Mach-O shipped at `Contents/Resources/bin/codex`.
//! - **composio** (MIT, Composio) — Bun-bundled JS app with arch-specific
//!   runtime + sibling `.mjs`/`services` files; cannot be lipo'd, ships
//!   per-arch under `Contents/Resources/bin/composio-{aarch64|x86_64}/`.
//!
//! `claude-code` cannot be bundled (proprietary license). The runtime
//! `houston-claude-installer` downloads it on first launch using URLs +
//! SHA-256 checksums pinned in `cli-deps.json` (also bundled inside the
//! .app via [`bundled_cli_deps_manifest`]).
//!
//! ## Resolution model
//!
//! Every function in this crate returns `Option<PathBuf>` and is `None`
//! when not running inside a recognizable bundle layout. That keeps dev
//! builds (`pnpm tauri dev`, `cargo run -p houston-engine-server`)
//! working unchanged — callers fall back to PATH lookup or a one-time
//! `~/.composio` install.
//!
//! Detection is **structural** — we walk parent directories and check
//! known names — so we don't depend on any env var that could be
//! stripped by macOS `.app` launchers or scrubbed in Spotlight indexing.
//!
//! ## Bundle layouts
//!
//! macOS `.app`:
//! ```text
//! Houston.app/
//!   Contents/
//!     MacOS/
//!       houston-app                ← parent app binary
//!       houston-engine[-<triple>]  ← engine sidecar (current_exe here)
//!     Resources/
//!       bin/                       ← bundled_bin_dir() returns this
//!         codex                    (universal)
//!         composio-aarch64/composio
//!         composio-x86_64/composio
//!         cli-deps.json
//! ```
//!
//! Windows MSI / NSIS:
//! ```text
//! C:\Program Files\Houston\
//!   houston-app.exe
//!   houston-engine.exe                ← current_exe here
//!   resources\
//!     bin\                            ← bundled_bin_dir() returns this
//!       ...
//! ```
//!
//! Linux AppImage / deb / rpm: not yet supported by Houston releases.

use std::path::{Path, PathBuf};

/// Subdirectory under `Resources/` (macOS) or alongside the exe
/// (Windows) that holds bundled CLI binaries. Must match the destination
/// in `tauri.conf.json#bundle.resources` and the layout produced by
/// `scripts/fetch-cli-deps.sh`.
pub const BIN_SUBDIR: &str = "bin";

/// File name of the runtime install manifest (used by
/// `houston-claude-installer`).
pub const CLI_DEPS_MANIFEST: &str = "cli-deps.json";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Top of the bundled CLI directory, or `None` if the current process is
/// not running inside a recognizable bundle layout (dev build, cargo run,
/// CI test harness, etc.).
pub fn bundled_bin_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    bundled_bin_dir_for(&exe)
}

/// As [`bundled_bin_dir`] but resolves relative to an explicit
/// executable path. Used by tests and by code paths that have already
/// resolved the engine binary (e.g. the supervisor that spawned it).
pub fn bundled_bin_dir_for(exe: &Path) -> Option<PathBuf> {
    if let Some(dir) = macos_app_bin_dir(exe) {
        return Some(dir);
    }
    if let Some(dir) = sibling_resources_bin_dir(exe) {
        return Some(dir);
    }
    if let Some(dir) = sibling_bin_dir(exe) {
        return Some(dir);
    }
    if let Some(dir) = dev_workspace_bin_dir(exe) {
        return Some(dir);
    }
    None
}

/// Universal `codex` binary inside the bundle, or `None`.
pub fn bundled_codex_path() -> Option<PathBuf> {
    let p = bundled_bin_dir()?.join(codex_binary_name());
    if p.is_file() {
        Some(p)
    } else {
        None
    }
}

/// Per-arch composio directory inside the bundle. Composio is multi-file
/// (binary + sibling `.mjs`/`services`) so callers that want to spawn the
/// binary should use [`bundled_composio_binary`]; callers that need to
/// add the dir to `PATH` (so e.g. agents can shell out to `composio`)
/// should use [`bundled_path_entries`].
pub fn bundled_composio_dir() -> Option<PathBuf> {
    let arch = host_arch_for_composio();
    let p = bundled_bin_dir()?.join(format!("composio-{arch}"));
    if p.is_dir() {
        Some(p)
    } else {
        None
    }
}

/// Per-arch composio binary, or `None`.
pub fn bundled_composio_binary() -> Option<PathBuf> {
    let p = bundled_composio_dir()?.join(composio_binary_name());
    if p.is_file() {
        Some(p)
    } else {
        None
    }
}

/// Per-arch gemini directory inside the bundle.
///
/// Gemini's Node SEA binary is arch-specific: the Mach-O has the
/// injected `NODE_SEA` segment baked at fixed offsets per arch (with a
/// sentinel fuse string the runtime scans for at boot), so we ship
/// per-arch directories the same way composio does. Unlike composio
/// there are no `.mjs` / `services/` companions today (everything is
/// embedded in the SEA blob), but the per-arch dir leaves room for
/// future vendored sidecars (upstream's `scripts/build_binary.js`
/// already references a `vendor/ripgrep/` tree that may eventually
/// escape the SEA on first launch).
pub fn bundled_gemini_dir() -> Option<PathBuf> {
    let arch = std::env::consts::ARCH;
    let p = bundled_bin_dir()?.join(format!("gemini-{arch}"));
    if p.is_dir() {
        Some(p)
    } else {
        None
    }
}

/// Per-arch gemini binary, or `None`.
pub fn bundled_gemini_path() -> Option<PathBuf> {
    let p = bundled_gemini_dir()?.join(gemini_binary_name());
    if p.is_file() {
        Some(p)
    } else {
        None
    }
}

/// Per-arch SkillSpector directory inside the bundle.
///
/// SkillSpector is NVIDIA's agent-skill security scanner — a Python tool
/// with no prebuilt binary and no PyPI release, so unlike the other
/// bundled CLIs it ships as a relocatable python-build-standalone
/// interpreter with the package installed into its own site-packages,
/// staged per-arch at `Resources/bin/skillspector-{aarch64|x86_64}/`
/// (same per-arch model as composio/gemini). macOS only in v1; on any
/// platform where the directory was never staged this returns `None` and
/// the scan feature is simply unavailable (the install flow still works,
/// just without a pre-install safety check).
pub fn bundled_skillspector_dir() -> Option<PathBuf> {
    let arch = std::env::consts::ARCH;
    let p = bundled_bin_dir()?.join(format!("skillspector-{arch}"));
    p.is_dir().then_some(p)
}

/// The interpreter that runs a scan, or `None` when SkillSpector isn't
/// bundled / fully installed on this device.
///
/// The scan is launched as
/// `python -c "from skillspector.cli import app; app()" scan …` — a bootstrap
/// that bypasses the installed console-script launcher entirely. Both the
/// unix script shebang and the Windows `.exe` launcher embed the absolute
/// *build-time* path, which is stale once the bundle is relocated into the
/// installed app; importing the module directly avoids that on every OS.
pub fn bundled_skillspector_python() -> Option<PathBuf> {
    let dir = bundled_skillspector_dir()?;
    if !skillspector_pkg_present(&dir) {
        return None;
    }
    skillspector_python(&dir)
}

/// True when the `skillspector` package landed in the interpreter's
/// site-packages — guards against a hollow tree from a half-finished
/// (e.g. best-effort, cross-arch) build that shipped the interpreter but
/// not the package.
fn skillspector_pkg_present(dir: &Path) -> bool {
    // Windows: Lib/site-packages/skillspector
    if dir.join("Lib").join("site-packages").join("skillspector").is_dir() {
        return true;
    }
    // Unix: lib/python3.<n>/site-packages/skillspector
    let lib = dir.join("lib");
    let Ok(entries) = std::fs::read_dir(&lib) else {
        return false;
    };
    entries.flatten().any(|e| {
        e.path()
            .join("site-packages")
            .join("skillspector")
            .is_dir()
    })
}

/// Resolve the interpreter inside a staged SkillSpector tree. On unix prefers
/// the stable `bin/python3` symlink, falling back to `python3.<n>`; on
/// Windows it's `python.exe` at the tree root.
#[cfg(not(windows))]
fn skillspector_python(dir: &Path) -> Option<PathBuf> {
    let bin = dir.join("bin");
    let p3 = bin.join("python3");
    if p3.is_file() {
        return Some(p3);
    }
    std::fs::read_dir(&bin).ok()?.flatten().find_map(|e| {
        let name = e.file_name();
        let name = name.to_str()?;
        (name.starts_with("python3.") && name[8..].chars().all(|c| c.is_ascii_digit()))
            .then(|| e.path())
    })
}

#[cfg(windows)]
fn skillspector_python(dir: &Path) -> Option<PathBuf> {
    let p = dir.join("python.exe");
    p.is_file().then_some(p)
}

/// Per-arch PortableGit self-extracting 7z. The SFX itself never
/// runs on the host that built the bundle — it's a Windows PE meant
/// to be extracted on the user's machine on first launch (see
/// houston-engine-core::git_bash). Returns `None` on macOS / Linux
/// or when the bundle wasn't staged with `windows-{x64,arm64}` modes.
#[cfg(target_os = "windows")]
pub fn bundled_git_bash_sfx() -> Option<PathBuf> {
    let arch = host_arch_for_composio();
    let p = bundled_bin_dir()?.join(format!("git-bash-{arch}.7z.exe"));
    if p.is_file() {
        Some(p)
    } else {
        None
    }
}

/// Path to the bundled `cli-deps.json` manifest, or `None`.
pub fn bundled_cli_deps_manifest() -> Option<PathBuf> {
    let p = bundled_bin_dir()?.join(CLI_DEPS_MANIFEST);
    if p.is_file() {
        Some(p)
    } else {
        None
    }
}

/// Directories to prepend to `PATH` so subprocesses spawned by the engine
/// (`claude`, `codex`, agent-side `composio search`/`composio execute`,
/// …) resolve to the bundled binaries. Returned in priority order
/// (front-of-PATH first). Empty if not bundled, in which case the caller
/// falls back to its existing PATH-augmentation behavior.
///
/// Order:
///   1. `<bundle>/bin/`                  — codex (and any future single-file CLIs)
///   2. `<bundle>/bin/composio-<arch>/`  — composio (multi-file bundle)
///   3. `<bundle>/bin/gemini-<arch>/`    — gemini (per-arch Node SEA)
///
/// Gemini uses `std::env::consts::ARCH` directly — no Windows-on-ARM
/// emulation override is needed in phase 1 because we don't ship a
/// Windows gemini at all (Google publishes only macOS binaries). When
/// the Windows fork-build lands, the resolver should adopt the same
/// `host_arch_for_composio` pattern; ideally the helper gets extracted
/// into a shared `host_arch_for_node_sea` so both consult one probe.
pub fn bundled_path_entries() -> Vec<PathBuf> {
    let Some(bin) = bundled_bin_dir() else {
        return Vec::new();
    };
    let mut out = Vec::with_capacity(3);
    out.push(bin.clone());
    let arch = host_arch_for_composio();
    let composio_dir = bin.join(format!("composio-{arch}"));
    if composio_dir.is_dir() {
        out.push(composio_dir);
    }
    let gemini_arch = std::env::consts::ARCH;
    let gemini_dir = bin.join(format!("gemini-{gemini_arch}"));
    if gemini_dir.is_dir() {
        out.push(gemini_dir);
    }
    out
}

// ---------------------------------------------------------------------------
// Pinned manifest accessors (cli-deps.json)
//
// Reading the manifest lets callers (notably houston-claude-installer)
// pull pinned download URLs + SHA-256 checksums for runtime-installed
// CLIs without a separate network round-trip to a remote manifest. The
// .app bundle is signed + notarized, so the file is tamper-evident at
// rest; using compile-time `include_str!` would force a Houston rebuild
// on every claude-code version bump, which we explicitly want to avoid.
// ---------------------------------------------------------------------------

/// Subset of `cli-deps.json` that callers care about. Generic over the
/// CLI key — claude-code, codex, composio all share this shape.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct CliEntry {
    pub version: String,
    /// Whether this CLI is bundled inside the .app. `false` means it's
    /// downloaded at runtime (`claude-code`).
    pub bundled: bool,
    /// Final invocable name (`claude`, `codex`, `composio`).
    pub binary_name: String,
    /// SPDX-style license tag for audit/build-noise (no logic depends on
    /// it, but keeping it accessible from runtime helps support diagnose
    /// distribution questions).
    #[serde(default)]
    pub license: Option<String>,
    /// `darwin-arm64` / `darwin-x64` / etc. → URL template (replace
    /// `{version}` at install time).
    #[serde(default)]
    pub urls: std::collections::BTreeMap<String, String>,
    /// `darwin-arm64` / `darwin-x64` / etc. → SHA-256 hex digest.
    #[serde(default)]
    pub checksums: std::collections::BTreeMap<String, String>,
    /// Optional install target hint for runtime-installed CLIs (e.g.
    /// `$HOME/.local/bin/claude`).
    #[serde(default)]
    pub install_target: Option<String>,
}

impl CliEntry {
    /// URL for the given platform (`darwin-arm64`, `darwin-x64`, …) with
    /// `{version}` substituted. Returns `None` if no URL is registered
    /// for the requested platform.
    pub fn url_for(&self, platform: &str) -> Option<String> {
        self.urls
            .get(platform)
            .map(|tmpl| tmpl.replace("{version}", &self.version))
    }

    /// SHA-256 for the given platform, hex-encoded.
    pub fn checksum_for(&self, platform: &str) -> Option<&str> {
        self.checksums.get(platform).map(String::as_str)
    }
}

/// Parsed `cli-deps.json`. Only the three known CLIs are exposed as
/// strongly-typed getters; the raw map is kept around so future entries
/// stay readable without a Houston rebuild.
#[derive(Debug, Clone)]
pub struct CliDepsManifest {
    raw: serde_json::Value,
}

impl CliDepsManifest {
    /// Parse a manifest from disk. Returns a structured error string if
    /// the file is missing or unparseable.
    pub fn load(path: &Path) -> Result<Self, String> {
        let bytes = std::fs::read(path)
            .map_err(|e| format!("failed to read {}: {e}", path.display()))?;
        let raw: serde_json::Value = serde_json::from_slice(&bytes)
            .map_err(|e| format!("invalid JSON in {}: {e}", path.display()))?;
        Ok(Self { raw })
    }

    /// Look up an entry by CLI key (`claude-code`, `codex`, `composio`).
    pub fn entry(&self, key: &str) -> Option<CliEntry> {
        let val = self.raw.get(key)?;
        serde_json::from_value::<CliEntry>(val.clone()).ok()
    }
}

/// Convenience: load the bundled manifest. `None` if not bundled.
pub fn load_bundled_manifest() -> Option<CliDepsManifest> {
    let path = bundled_cli_deps_manifest()?;
    match CliDepsManifest::load(&path) {
        Ok(m) => Some(m),
        Err(e) => {
            tracing::warn!("[cli-bundle] failed to load bundled manifest: {e}");
            None
        }
    }
}

/// The platform key used inside `cli-deps.json` for the current host
/// (`darwin-arm64` / `darwin-x64` / `windows-x64`). Used by the runtime
/// installer to look up its download URL + checksum without each caller
/// recomputing the mapping.
pub fn host_platform_key() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "darwin-arm64"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "darwin-x64"
    }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "windows-x64"
    }
    // Windows ARM64. Required since v0.4.10 shipped the ARM64 MSI — without
    // this branch the engine binary running natively on Snapdragon /
    // Surface laptops returns "unknown" here, and houston-claude-installer
    // bails with `no claude-code URL for platform 'unknown'` instead of
    // downloading the arm64 claude.exe. cli-deps.json has the URL
    // (`windows-arm64`), the engine just never asked for it.
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    {
        "windows-arm64"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "linux-x64"
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        "linux-arm64"
    }
    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "aarch64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
    )))]
    {
        "unknown"
    }
}

// ---------------------------------------------------------------------------
// Internals — layout detection
// ---------------------------------------------------------------------------

fn macos_app_bin_dir(exe: &Path) -> Option<PathBuf> {
    let macos_dir = exe.parent()?;
    if macos_dir.file_name()?.to_str()? != "MacOS" {
        return None;
    }
    let contents = macos_dir.parent()?;
    if contents.file_name()?.to_str()? != "Contents" {
        return None;
    }
    let app = contents.parent()?;
    let app_name = app.file_name()?.to_str()?;
    if !app_name.ends_with(".app") {
        return None;
    }
    let bin = contents.join("Resources").join(BIN_SUBDIR);
    bin.is_dir().then_some(bin)
}

fn sibling_resources_bin_dir(exe: &Path) -> Option<PathBuf> {
    let exe_dir = exe.parent()?;
    let bin = exe_dir.join("resources").join(BIN_SUBDIR);
    bin.is_dir().then_some(bin)
}

/// Windows MSI/NSIS layout: Tauri's `bundle.resources` map
/// `{"resources/bin": "bin"}` lands files at `<install_dir>\bin\` on
/// Windows (the resource_dir is the install dir, no separate
/// Resources/ tree like macOS). Both `houston-app.exe` and the
/// `houston-engine.exe` sidecar live at the install root, so the
/// bundled CLI dir is the engine's own sibling `bin/`.
fn sibling_bin_dir(exe: &Path) -> Option<PathBuf> {
    let exe_dir = exe.parent()?;
    let bin = exe_dir.join(BIN_SUBDIR);
    bin.is_dir().then_some(bin)
}

/// Dev fallback: when the engine is running from `<workspace>/target/{debug,
/// release}/houston-engine` (i.e. `pnpm tauri dev` or `cargo run`), the
/// bundled CLIs aren't staged next to the binary. Instead they live in
/// `<workspace>/app/src-tauri/resources/bin/` after the user runs
/// `./scripts/fetch-cli-deps.sh host`. Resolve that layout so dev sessions
/// can use the pinned, version-controlled CLI (instead of whatever happens
/// to be on the user's PATH, which is how we ended up serving an ancient
/// `codex` from `nvm` to the tutorial).
fn dev_workspace_bin_dir(exe: &Path) -> Option<PathBuf> {
    // Only the real engine sidecar should trigger the dev fallback —
    // otherwise `cargo test` binaries living at `target/debug/deps/<hash>`
    // would also resolve to the staged bundle, and tests that assume "no
    // bundled CLIs are visible in dev" (e.g. composio's not-installed
    // smoke test) start failing whenever a developer has run
    // `./scripts/fetch-cli-deps.sh`. Restricting to the canonical engine
    // binary name keeps test isolation intact while still serving real
    // `pnpm tauri dev` / `cargo run -p houston-engine-server` invocations.
    let file_name = exe.file_name().and_then(|n| n.to_str())?;
    let expected = if cfg!(windows) {
        "houston-engine.exe"
    } else {
        "houston-engine"
    };
    if file_name != expected {
        return None;
    }
    // The engine sits directly under `target/{debug,release}/`. Walk up two
    // levels (engine → profile → target → workspace) and check that the
    // shape matches before consulting the filesystem.
    let profile_dir = exe.parent()?;
    let profile = profile_dir.file_name().and_then(|n| n.to_str())?;
    if profile != "debug" && profile != "release" {
        return None;
    }
    let target_dir = profile_dir.parent()?;
    if target_dir.file_name().and_then(|n| n.to_str()) != Some("target") {
        return None;
    }
    let workspace = target_dir.parent()?;
    let bin = workspace
        .join("app")
        .join("src-tauri")
        .join("resources")
        .join(BIN_SUBDIR);
    bin.is_dir().then_some(bin)
}

fn codex_binary_name() -> &'static str {
    if cfg!(windows) {
        "codex.exe"
    } else {
        "codex"
    }
}

fn composio_binary_name() -> &'static str {
    if cfg!(windows) {
        "composio.exe"
    } else {
        "composio"
    }
}

fn gemini_binary_name() -> &'static str {
    if cfg!(windows) {
        "gemini.exe"
    } else {
        "gemini"
    }
}

/// Composio's per-arch directory uses Rust `std::env::consts::ARCH`
/// names ("aarch64", "x86_64") so the runtime resolver doesn't need a
/// translation table from upstream's "arm64"/"x64" naming. Matches the
/// directory layout produced by `scripts/fetch-cli-deps.sh`.
///
/// **Windows-on-ARM exception**: when an x64 Houston binary runs under
/// Microsoft's x64 emulator on an ARM64 Windows host, `consts::ARCH`
/// returns "x86_64" because the running process IS x86_64. But the
/// emulator does not implement every x86 instruction set, so x64
/// Composio crashes with `STATUS_ILLEGAL_INSTRUCTION` (0xc000001d) on
/// real ARM laptops. We detect this case via `IsWow64Process2` and
/// prefer the native `composio-aarch64/` directory when it's present
/// in the bundle. Falls back to `composio-x86_64/` if the aarch64
/// build hasn't been bundled (which is the case until the
/// gethouston/composio fork ships an ARM build).
fn host_arch_for_composio() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        let probe = windows_native_arch_under_emulation();
        let bin = bundled_bin_dir();
        tracing::info!(
            "[composio:arch] windows probe: native_under_emulation={:?} bundled_bin_dir={:?}",
            probe,
            bin.as_deref().map(|p| p.display().to_string())
        );
        if let Some(native) = probe {
            if let Some(bin) = bin {
                let native_dir = bin.join(format!("composio-{native}"));
                let exists = native_dir.is_dir();
                tracing::info!(
                    "[composio:arch] checking native dir {} exists={}",
                    native_dir.display(),
                    exists
                );
                if exists {
                    return native;
                }
            }
        }
    }
    let fallback = std::env::consts::ARCH;
    #[cfg(target_os = "windows")]
    tracing::info!("[composio:arch] falling back to consts::ARCH = {}", fallback);
    fallback
}

/// Detect Windows-on-ARM running an x64 process under emulation.
/// Returns the native architecture name ("aarch64") when the current
/// process is being emulated; `None` when running natively on
/// whatever architecture matches the binary. Uses `IsWow64Process2`
/// available since Windows 10 1709 — Houston's minimum supported
/// Windows is 10, so the lookup never fails on unsupported OS.
#[cfg(target_os = "windows")]
fn windows_native_arch_under_emulation() -> Option<&'static str> {
    // Avoid pulling in the `windows` crate for one syscall.
    type Handle = *mut std::ffi::c_void;
    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentProcess() -> Handle;
        fn IsWow64Process2(
            h_process: Handle,
            p_process_machine: *mut u16,
            p_native_machine: *mut u16,
        ) -> i32;
    }
    const IMAGE_FILE_MACHINE_UNKNOWN: u16 = 0x0000;
    const IMAGE_FILE_MACHINE_ARM64: u16 = 0xAA64;
    const IMAGE_FILE_MACHINE_AMD64: u16 = 0x8664;

    let mut process_machine: u16 = 0;
    let mut native_machine: u16 = 0;
    let ok = unsafe {
        IsWow64Process2(
            GetCurrentProcess(),
            &mut process_machine,
            &mut native_machine,
        )
    };
    tracing::info!(
        "[composio:arch] IsWow64Process2 ok={} process_machine=0x{:04x} native_machine=0x{:04x}",
        ok,
        process_machine,
        native_machine
    );
    if ok == 0 {
        return None;
    }
    // `native_machine` is always populated with the host's true arch
    // regardless of emulation status, so use IT as the source of truth.
    // The earlier "process_machine == UNKNOWN means native" check was
    // wrong for the Houston-on-ARM case: Microsoft's x64-on-ARM
    // emulator reports `process_machine == AMD64` correctly on most
    // SKUs, but there's an edge where the OS reports UNKNOWN even
    // under emulation. Trusting `native_machine` directly is robust
    // either way — if the host is ARM64, we want native ARM; if the
    // host is x64, we want x64 (which `consts::ARCH` would have given
    // us anyway since the binary is x64).
    match native_machine {
        IMAGE_FILE_MACHINE_ARM64 => Some("aarch64"),
        IMAGE_FILE_MACHINE_AMD64 => Some("x86_64"),
        IMAGE_FILE_MACHINE_UNKNOWN => None,
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Build a fake `Houston.app/Contents/{MacOS,Resources/bin}` tree under
    /// `root` and return `(engine_exe_path, bin_dir)`.
    fn fake_app(root: &Path, bin_contents: &[&str]) -> (PathBuf, PathBuf) {
        let app = root.join("Houston.app");
        let macos = app.join("Contents").join("MacOS");
        let bin = app.join("Contents").join("Resources").join(BIN_SUBDIR);
        fs::create_dir_all(&macos).unwrap();
        fs::create_dir_all(&bin).unwrap();
        let exe = macos.join("houston-engine");
        fs::write(&exe, b"").unwrap();
        for name in bin_contents {
            let p = bin.join(name);
            if let Some(parent) = p.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(&p, b"").unwrap();
        }
        (exe, bin)
    }

    #[test]
    fn detects_macos_app_layout() {
        let tmp = tempfile::tempdir().unwrap();
        let (exe, bin) = fake_app(tmp.path(), &["codex"]);
        let resolved = bundled_bin_dir_for(&exe).expect("should detect bundle");
        assert_eq!(resolved, bin);
    }

    #[test]
    fn rejects_non_app_macos_layout() {
        let tmp = tempfile::tempdir().unwrap();
        let macos = tmp.path().join("Contents").join("MacOS");
        fs::create_dir_all(&macos).unwrap();
        // No `.app` parent — should not match.
        let exe = macos.join("houston-engine");
        fs::write(&exe, b"").unwrap();
        assert!(bundled_bin_dir_for(&exe).is_none());
    }

    #[test]
    fn rejects_random_path() {
        let tmp = tempfile::tempdir().unwrap();
        let exe = tmp.path().join("random").join("houston-engine");
        fs::create_dir_all(exe.parent().unwrap()).unwrap();
        fs::write(&exe, b"").unwrap();
        assert!(bundled_bin_dir_for(&exe).is_none());
    }

    #[test]
    fn detects_windows_sibling_layout() {
        // Even on macOS, the sibling-layout fallback should resolve when
        // `<exe-dir>/resources/bin/` exists. Used by Windows + a future
        // generic install layout.
        let tmp = tempfile::tempdir().unwrap();
        let exe_dir = tmp.path().join("install");
        fs::create_dir_all(&exe_dir).unwrap();
        let exe = exe_dir.join("houston-engine");
        fs::write(&exe, b"").unwrap();
        let bin = exe_dir.join("resources").join(BIN_SUBDIR);
        fs::create_dir_all(&bin).unwrap();
        assert_eq!(bundled_bin_dir_for(&exe), Some(bin));
    }

    #[test]
    fn detects_dev_workspace_layout() {
        // Dev: engine spawned from `<workspace>/target/{debug,release}/`.
        // The staged bin dir lives at `<workspace>/app/src-tauri/resources/bin/`.
        let tmp = tempfile::tempdir().unwrap();
        let workspace = tmp.path();
        let target_debug = workspace.join("target").join("debug");
        fs::create_dir_all(&target_debug).unwrap();
        let engine_name = if cfg!(windows) {
            "houston-engine.exe"
        } else {
            "houston-engine"
        };
        let exe = target_debug.join(engine_name);
        fs::write(&exe, b"").unwrap();
        let bin = workspace
            .join("app")
            .join("src-tauri")
            .join("resources")
            .join(BIN_SUBDIR);
        fs::create_dir_all(&bin).unwrap();
        assert_eq!(bundled_bin_dir_for(&exe), Some(bin));
    }

    #[test]
    fn dev_workspace_layout_skips_when_unstaged() {
        // If the user hasn't run `./scripts/fetch-cli-deps.sh`, the
        // resources/bin dir doesn't exist and the resolver must fall through
        // to None — not return a stale-looking phantom path.
        let tmp = tempfile::tempdir().unwrap();
        let target_release = tmp.path().join("target").join("release");
        fs::create_dir_all(&target_release).unwrap();
        let engine_name = if cfg!(windows) {
            "houston-engine.exe"
        } else {
            "houston-engine"
        };
        let exe = target_release.join(engine_name);
        fs::write(&exe, b"").unwrap();
        assert_eq!(bundled_bin_dir_for(&exe), None);
    }

    #[test]
    fn dev_workspace_layout_skips_for_cargo_test_binaries() {
        // Cargo test binaries live at `target/debug/deps/<name>-<hash>` and
        // must NOT trigger the dev bundle resolver — otherwise tests that
        // assume an empty install state start using the developer's staged
        // CLIs and fail in confusing ways.
        let tmp = tempfile::tempdir().unwrap();
        let deps_dir = tmp.path().join("target").join("debug").join("deps");
        fs::create_dir_all(&deps_dir).unwrap();
        let bin = tmp
            .path()
            .join("app")
            .join("src-tauri")
            .join("resources")
            .join(BIN_SUBDIR);
        fs::create_dir_all(&bin).unwrap();
        let test_bin = deps_dir.join("composio-abc123");
        fs::write(&test_bin, b"").unwrap();
        assert_eq!(bundled_bin_dir_for(&test_bin), None);
    }

    #[test]
    fn detects_windows_msi_install_layout() {
        // Windows MSI / NSIS: Tauri stages bundle.resources directly under
        // the install root, so resources/bin/<files> ends up at
        // `<install>\bin\<files>`. The engine sidecar lives at the
        // install root next to houston-app.exe.
        let tmp = tempfile::tempdir().unwrap();
        let install = tmp.path().join("Houston");
        fs::create_dir_all(&install).unwrap();
        let exe = install.join("houston-engine.exe");
        fs::write(&exe, b"").unwrap();
        let bin = install.join(BIN_SUBDIR);
        fs::create_dir_all(&bin).unwrap();
        assert_eq!(bundled_bin_dir_for(&exe), Some(bin));
    }

    #[test]
    fn manifest_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("cli-deps.json");
        fs::write(
            &path,
            br#"{
              "claude-code": {
                "version": "1.2.3",
                "bundled": false,
                "binary_name": "claude",
                "license": "PROPRIETARY",
                "install_target": "$HOME/.local/bin/claude",
                "urls": {
                  "darwin-arm64": "https://example.com/{version}/darwin-arm64/claude",
                  "darwin-x64":   "https://example.com/{version}/darwin-x64/claude"
                },
                "checksums": {
                  "darwin-arm64": "deadbeef",
                  "darwin-x64":   "cafebabe"
                }
              }
            }"#,
        )
        .unwrap();

        let manifest = CliDepsManifest::load(&path).unwrap();
        let entry = manifest.entry("claude-code").unwrap();
        assert_eq!(entry.version, "1.2.3");
        assert!(!entry.bundled);
        assert_eq!(entry.binary_name, "claude");
        assert_eq!(
            entry.url_for("darwin-arm64").as_deref(),
            Some("https://example.com/1.2.3/darwin-arm64/claude")
        );
        assert_eq!(entry.checksum_for("darwin-x64"), Some("cafebabe"));
        assert!(manifest.entry("does-not-exist").is_none());
    }

    #[test]
    fn detects_bundled_gemini_per_arch() {
        // Build a fake .app with the per-arch gemini layout and assert
        // the resolver finds the binary at
        // `Resources/bin/gemini-<arch>/gemini`. We can't unit-test
        // `bundled_gemini_path()` directly because it consults
        // `std::env::current_exe()`; instead test the underlying layout
        // via `bundled_bin_dir_for(&exe)` and trust the public function
        // (same pattern as the codex/composio tests above).
        let tmp = tempfile::tempdir().unwrap();
        let app = tmp.path().join("Houston.app");
        let macos = app.join("Contents").join("MacOS");
        let bin = app.join("Contents").join("Resources").join(BIN_SUBDIR);
        let gemini_arch = bin.join(format!("gemini-{}", std::env::consts::ARCH));
        fs::create_dir_all(&macos).unwrap();
        fs::create_dir_all(&gemini_arch).unwrap();
        let exe = macos.join("houston-engine");
        fs::write(&exe, b"").unwrap();
        let gemini = gemini_arch.join(gemini_binary_name());
        fs::write(&gemini, b"").unwrap();

        let bin_resolved = bundled_bin_dir_for(&exe).unwrap();
        let gemini_resolved = bin_resolved
            .join(format!("gemini-{}", std::env::consts::ARCH))
            .join(gemini_binary_name());
        assert!(gemini_resolved.is_file());
    }

    #[cfg(not(windows))]
    #[test]
    fn detects_bundled_skillspector_per_arch() {
        // Build a fake .app with the per-arch skillspector layout: a
        // relocatable interpreter dir with bin/python3 + bin/skillspector.
        // Same approach as the gemini test — drive the underlying layout
        // via `bundled_bin_dir_for(&exe)` since the public functions read
        // `std::env::current_exe()`.
        let tmp = tempfile::tempdir().unwrap();
        let app = tmp.path().join("Houston.app");
        let macos = app.join("Contents").join("MacOS");
        let bin = app.join("Contents").join("Resources").join(BIN_SUBDIR);
        let ss = bin.join(format!("skillspector-{}", std::env::consts::ARCH));
        let ss_bin = ss.join("bin");
        fs::create_dir_all(&macos).unwrap();
        fs::create_dir_all(&ss_bin).unwrap();
        let exe = macos.join("houston-engine");
        fs::write(&exe, b"").unwrap();
        fs::write(ss_bin.join("python3"), b"").unwrap();
        fs::write(ss_bin.join("python3.13"), b"").unwrap();
        // The package installed into the interpreter's site-packages.
        let pkg = ss
            .join("lib")
            .join("python3.13")
            .join("site-packages")
            .join("skillspector");
        fs::create_dir_all(&pkg).unwrap();
        fs::write(pkg.join("__init__.py"), b"").unwrap();

        let bin_resolved = bundled_bin_dir_for(&exe).unwrap();
        let ss_resolved = bin_resolved.join(format!("skillspector-{}", std::env::consts::ARCH));
        assert!(ss_resolved.is_dir());

        // The interpreter finder prefers the stable `bin/python3` symlink.
        let py = skillspector_python(&ss_resolved).expect("python resolved");
        assert_eq!(py.file_name().unwrap(), "python3");
        // The package-presence guard sees the installed package.
        assert!(skillspector_pkg_present(&ss_resolved));
    }

    #[cfg(not(windows))]
    #[test]
    fn skillspector_pkg_absent_when_only_interpreter_staged() {
        // A hollow tree (interpreter but no package) must not resolve.
        let tmp = tempfile::tempdir().unwrap();
        let bin = tmp.path().join("bin");
        fs::create_dir_all(&bin).unwrap();
        fs::write(bin.join("python3"), b"").unwrap();
        assert!(!skillspector_pkg_present(tmp.path()));
    }

    #[cfg(not(windows))]
    #[test]
    fn skillspector_python_falls_back_to_versioned_name() {
        // If a future python-build-standalone drops the `python3` alias,
        // the finder must still locate `python3.<n>`.
        let tmp = tempfile::tempdir().unwrap();
        let bin = tmp.path().join("bin");
        fs::create_dir_all(&bin).unwrap();
        fs::write(bin.join("python3.13"), b"").unwrap();
        let py = skillspector_python(tmp.path()).expect("versioned python resolved");
        assert_eq!(py.file_name().unwrap(), "python3.13");
    }

    #[test]
    fn host_platform_key_is_known() {
        // Just assert it's not "unknown" on the platforms we actually
        // build for. CI runs macOS only today; the assertion still
        // catches regressions on dev machines.
        let k = host_platform_key();
        assert!(
            matches!(k, "darwin-arm64" | "darwin-x64" | "windows-x64" | "windows-arm64" | "linux-x64" | "linux-arm64"),
            "unknown host platform: {k}"
        );
    }
}
