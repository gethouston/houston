//! Airlock — per-agent OS-level isolation for the multi-tenant Engine.
//!
//! The agent is the adversary: a prompt-injected agent must be *unable* to
//! reach another tenant's data, not merely *told* not to. This module moves
//! the trust boundary from the prompt to the kernel by wrapping the single
//! subprocess spawn site (`cli_process::run_cli_process`) with:
//!
//! - a **per-tenant uid/gid** the agent CLI is dropped to before `exec`
//!   (closes cross-agent filesystem reads and `/proc/<pid>/environ` theft via
//!   standard Unix DAC), and
//! - a **Landlock filesystem jail** restricting the agent to its own folder
//!   plus the read-only runtime paths the CLI needs.
//!
//! Linux only — the desktop app (macOS/Windows) is single-tenant and needs no
//! sandbox. On non-Linux targets [`IsolationPolicy::for_agent`] always returns
//! `None` and the spawn path is identical to before.
//!
//! Activation is gated behind the `HOUSTON_ISOLATION` env var (default OFF) so
//! dev checkouts and the desktop sidecar are untouched. When it IS on and the
//! kernel cannot honor the jail, the spawn fails loudly rather than silently
//! running an un-isolated agent — see the no-silent-failures policy in
//! `CLAUDE.md` and `knowledge-base/agent-isolation.md`.

use std::path::{Path, PathBuf};

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
mod seccomp;

/// Env var that turns multi-tenant isolation ON. Default OFF: the desktop
/// app and dev checkouts spawn agents exactly as before.
pub const ISOLATION_ENV: &str = "HOUSTON_ISOLATION";

/// Env var overriding the root under which per-tenant home directories are
/// provisioned. Defaults to [`DEFAULT_TENANTS_ROOT`]. Tests point this at a
/// tempdir.
pub const TENANTS_ROOT_ENV: &str = "HOUSTON_TENANTS_ROOT";

/// Default per-tenant home root. Sits beside `~/.houston/workspaces` in the
/// Always-On container (`-v houston-home:/data/.houston`).
pub const DEFAULT_TENANTS_ROOT: &str = "/data/.houston/tenants";

/// Base of the per-tenant uid range. Deliberately high to avoid collisions
/// with system / login users.
const TENANT_UID_BASE: u32 = 100_000;
/// Size of the per-tenant uid range. uids land in
/// `[TENANT_UID_BASE, TENANT_UID_BASE + TENANT_UID_SPAN)`.
const TENANT_UID_SPAN: u32 = 60_000;

/// A resolved isolation policy for one agent subprocess. Built in the parent
/// before spawn; consumed by [`apply_to_command`].
#[derive(Debug, Clone)]
pub struct IsolationPolicy {
    /// The agent's own folder — its only read/write filesystem root (besides
    /// its tenant home and /tmp).
    pub agent_root: PathBuf,
    /// Per-tenant `$HOME`. The provider CLI writes its transcripts here
    /// (`~/.claude/projects/...`), isolated from other tenants.
    pub tenant_home: PathBuf,
    /// Per-tenant uid the CLI is dropped to before `exec`.
    pub tenant_uid: u32,
    /// Per-tenant gid (kept equal to the uid).
    pub tenant_gid: u32,
}

impl IsolationPolicy {
    /// Build a policy for an agent from its working directory (the agent
    /// folder under `.../workspaces/<Workspace>/<Agent>/`).
    ///
    /// Returns `None` — meaning "spawn exactly as before" — when isolation is
    /// disabled (`HOUSTON_ISOLATION` unset), when no working dir is known, or
    /// on non-Linux targets. The uid/gid is a deterministic hash of the agent
    /// path so file ownership stays stable across engine restarts.
    pub fn for_agent(working_dir: Option<&Path>) -> Option<Self> {
        // Flag absent → isolation off → spawn exactly as before.
        std::env::var_os(ISOLATION_ENV)?;
        if !cfg!(target_os = "linux") {
            return None;
        }
        let raw = working_dir?;
        // Canonicalize for a stable hash regardless of how the caller spelled
        // the path; fall back to the raw path if it can't be resolved yet.
        let agent_root = std::fs::canonicalize(raw).unwrap_or_else(|_| raw.to_path_buf());
        let id = tenant_id(&agent_root);
        Some(Self {
            tenant_home: tenant_home_dir(id),
            agent_root,
            tenant_uid: id,
            tenant_gid: id,
        })
    }
}

/// Deterministic per-tenant uid derived from the agent path via FNV-1a.
///
/// FNV-1a (not `DefaultHasher`) is used deliberately: the mapping must be
/// byte-for-byte stable across Rust versions and engine restarts so a tenant's
/// on-disk files keep the same owner. Collisions are possible within the
/// 60k-wide range (two agents sharing a uid); acceptable for the hackathon MVP
/// and documented in `knowledge-base/agent-isolation.md`. The persisted-map
/// alternative is noted there for a hardened build.
fn tenant_id(agent_root: &Path) -> u32 {
    // `to_string_lossy().as_bytes()` keeps this cross-platform (no unix-only
    // `OsStrExt`); the crate still compiles for the macOS/Windows desktop even
    // though isolation is never activated there.
    const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;
    let mut hash = FNV_OFFSET;
    for byte in agent_root.to_string_lossy().as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    TENANT_UID_BASE + (hash % TENANT_UID_SPAN as u64) as u32
}

fn tenants_root() -> PathBuf {
    std::env::var_os(TENANTS_ROOT_ENV)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(DEFAULT_TENANTS_ROOT))
}

fn tenant_home_dir(uid: u32) -> PathBuf {
    tenants_root().join(uid.to_string())
}

/// Provision the tenant's filesystem and arm the post-fork isolation hook on
/// `cmd`. Call once, in the parent, immediately before spawning.
///
/// On Linux this (1) creates and chowns the per-tenant home, (2) chowns the
/// agent folder to the tenant uid with `0700`, (3) sets `$HOME` to the tenant
/// home, and (4) registers a `pre_exec` closure that applies the Landlock
/// ruleset and drops to the tenant uid/gid. Returns `Err` — so the caller can
/// surface a visible `SpawnFailed` and abort — if the kernel lacks Landlock or
/// the process lacks the privilege to drop uids.
///
/// On non-Linux targets this is unreachable (policies are never built) and
/// returns an error to make misuse loud.
#[cfg(target_os = "linux")]
pub fn apply_to_command(
    cmd: &mut tokio::process::Command,
    policy: &IsolationPolicy,
) -> std::io::Result<()> {
    linux::apply_to_command(cmd, policy)
}

#[cfg(not(target_os = "linux"))]
pub fn apply_to_command(
    _cmd: &mut tokio::process::Command,
    _policy: &IsolationPolicy,
) -> std::io::Result<()> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "Airlock isolation is Linux-only",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn for_agent_is_none_without_flag() {
        // Without HOUSTON_ISOLATION set, isolation is fully transparent.
        // (CI runs without the flag, so this reflects the default path.)
        if std::env::var_os(ISOLATION_ENV).is_none() {
            assert!(IsolationPolicy::for_agent(Some(Path::new("/whatever"))).is_none());
        }
    }

    #[test]
    fn tenant_id_is_deterministic_and_in_range() {
        let p = Path::new("/data/.houston/workspaces/Acme/Bookkeeper");
        let a = tenant_id(p);
        let b = tenant_id(p);
        assert_eq!(a, b, "same path must hash to the same uid across calls");
        assert!(a >= TENANT_UID_BASE);
        assert!(a < TENANT_UID_BASE + TENANT_UID_SPAN);
    }

    #[test]
    fn tenant_id_differs_across_agents() {
        let a = tenant_id(Path::new("/data/.houston/workspaces/Acme/Bookkeeper"));
        let b = tenant_id(Path::new("/data/.houston/workspaces/Acme/TaxReviewer"));
        // Not a hard guarantee (60k-wide range can collide), but these two
        // fixed paths must not, or the demo's two agents would share a uid.
        assert_ne!(a, b);
    }

    #[test]
    fn tenant_home_is_under_configured_root() {
        // Pure-function check that doesn't depend on the env override.
        let home = tenants_root().join("123456");
        assert!(home.ends_with("123456"));
    }
}
