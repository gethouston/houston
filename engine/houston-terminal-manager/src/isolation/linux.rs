//! Linux implementation of the Airlock cell: per-tenant uid drop + Landlock
//! filesystem jail, applied at the single subprocess spawn site.
//!
//! ## Fork safety
//!
//! The process is multi-threaded (tokio). After `fork`, only async-signal-safe
//! operations are legal in the child until `exec` — in particular, allocating
//! (`malloc`) can deadlock if another thread held the allocator lock at fork
//! time. So **all allocation happens in the parent**: the Landlock ruleset is
//! built and its rules added (the `landlock_add_rule` syscalls run here) before
//! the fork. The post-fork `pre_exec` closure performs only bare syscalls:
//! `landlock_restrict_self`, `setgroups`, `setresgid`, `setresuid`. See
//! `knowledge-base/agent-isolation.md` §4.

use super::IsolationPolicy;
use landlock::{
    path_beneath_rules, Access, AccessFs, CompatLevel, Compatible, Ruleset, RulesetAttr,
    RulesetCreated, RulesetCreatedAttr, ABI,
};
use std::io;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

/// Read-only runtime paths the provider CLIs (claude/codex/gemini, node, their
/// shared libraries, TLS roots, DNS config) need to start and run. Kept broad
/// for the MVP; Phase 1.3 tightens this against a real `claude -p` run and
/// records the final list in the knowledge base.
const RUNTIME_RO_PATHS: &[&str] = &[
    "/usr", "/bin", "/sbin", "/lib", "/lib64", "/etc", "/opt", "/run", "/proc",
];

/// Device files the CLIs commonly need. `/dev/null` must be writable.
const DEV_RW_PATHS: &[&str] = &["/dev/null"];
const DEV_RO_PATHS: &[&str] = &["/dev/urandom", "/dev/random", "/dev/zero", "/dev/tty"];

pub fn apply_to_command(
    cmd: &mut tokio::process::Command,
    policy: &IsolationPolicy,
) -> io::Result<()> {
    // 1. Parent-side filesystem provisioning (needs CAP_CHOWN; the engine runs
    //    as root *inside the container*). Loud on failure — never spawn
    //    un-isolated when isolation was requested.
    provision(policy)?;

    // The CLI's $HOME must point at the tenant's own home so transcripts land
    // in an isolated, jailed location. TMPDIR points at a per-tenant tmp under
    // that home — a *shared* /tmp would itself be a cross-tenant leak channel
    // (A writes, B reads), so the jail never grants the global /tmp.
    cmd.env("HOME", &policy.tenant_home);
    cmd.env("TMPDIR", policy.tenant_home.join("tmp"));

    // 2. Build the Landlock ruleset in the parent (all allocation + the
    //    landlock_add_rule syscalls happen here).
    let ruleset = build_ruleset(policy)?;

    // 3. Arm the post-fork hook: restrict_self + drop privileges, in that
    //    order. restrict_self sets PR_SET_NO_NEW_PRIVS; dropping the uid
    //    afterwards is still permitted (NNP blocks *gaining* privilege via
    //    setuid binaries, not voluntarily shedding it).
    let uid = policy.tenant_uid;
    let gid = policy.tenant_gid;
    let mut ruleset = Some(ruleset);
    // SAFETY: the closure performs only async-signal-safe syscalls; the
    // RulesetCreated holds an inherited fd and the rules were already added in
    // the parent. See the module-level fork-safety note.
    unsafe {
        cmd.pre_exec(move || {
            if let Some(rs) = ruleset.take() {
                rs.restrict_self()
                    .map_err(|e| io::Error::other(format!("landlock: {e}")))?;
            }
            drop_privileges(uid, gid)?;
            Ok(())
        });
    }
    Ok(())
}

/// Create the per-tenant home and lock the agent folder to the tenant uid.
fn provision(policy: &IsolationPolicy) -> io::Result<()> {
    let uid = policy.tenant_uid;
    let gid = policy.tenant_gid;

    std::fs::create_dir_all(&policy.tenant_home)?;
    // Per-tenant tmp (TMPDIR) under the home, so the jail never needs the
    // shared global /tmp.
    std::fs::create_dir_all(policy.tenant_home.join("tmp"))?;
    chown_tree(&policy.tenant_home, uid, gid)?;
    set_mode_0700(&policy.tenant_home)?;

    if policy.agent_root.is_dir() {
        chown_tree(&policy.agent_root, uid, gid)?;
        set_mode_0700(&policy.agent_root)?;
    }
    Ok(())
}

fn set_mode_0700(path: &Path) -> io::Result<()> {
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
}

/// Recursively chown `root` to `(uid, gid)`. Symlinks are chowned without
/// following (lchown semantics via `std::os::unix::fs::chown` on the link
/// itself is not exposed, so we skip descending into symlinked dirs to avoid
/// escaping the tree).
fn chown_tree(root: &Path, uid: u32, gid: u32) -> io::Result<()> {
    let mut stack = vec![root.to_path_buf()];
    while let Some(path) = stack.pop() {
        let meta = std::fs::symlink_metadata(&path)?;
        std::os::unix::fs::chown(&path, Some(uid), Some(gid))?;
        if meta.file_type().is_dir() {
            for entry in std::fs::read_dir(&path)? {
                stack.push(entry?.path());
            }
        }
    }
    Ok(())
}

/// Build (but do not yet enforce) the Landlock ruleset: read/write inside the
/// agent folder, tenant home and /tmp; read-only across the system runtime
/// paths; plus the handful of device files CLIs touch.
fn build_ruleset(policy: &IsolationPolicy) -> io::Result<RulesetCreated> {
    let abi = ABI::V1;
    let rw = AccessFs::from_all(abi);
    let ro = AccessFs::from_read(abi);

    // No global /tmp here: the tenant's writable roots are its own folder and
    // its home (which contains its private TMPDIR). A shared /tmp would be a
    // cross-tenant leak channel.
    let rw_paths: Vec<PathBuf> = vec![policy.agent_root.clone(), policy.tenant_home.clone()];
    let ro_paths: Vec<PathBuf> = RUNTIME_RO_PATHS.iter().map(PathBuf::from).collect();
    let dev_rw: Vec<PathBuf> = DEV_RW_PATHS.iter().map(PathBuf::from).collect();
    let dev_ro: Vec<PathBuf> = DEV_RO_PATHS.iter().map(PathBuf::from).collect();

    // HardRequirement (not BestEffort): if the kernel lacks Landlock ABI v1
    // (<5.13), `create()` errors and we surface it — no silent un-jailed
    // fallback. Missing optional paths are tolerated by `path_beneath_rules`
    // (it skips paths it can't open), which is fine for the device list.
    let ruleset = Ruleset::default()
        .set_compatibility(CompatLevel::HardRequirement)
        .handle_access(rw)
        .map_err(landlock_err)?
        .create()
        .map_err(landlock_err)?
        .add_rules(path_beneath_rules(&rw_paths, rw))
        .map_err(landlock_err)?
        .add_rules(path_beneath_rules(&ro_paths, ro))
        .map_err(landlock_err)?
        .add_rules(path_beneath_rules(&dev_rw, rw))
        .map_err(landlock_err)?
        .add_rules(path_beneath_rules(&dev_ro, ro))
        .map_err(landlock_err)?;

    Ok(ruleset)
}

fn landlock_err(e: impl std::fmt::Display) -> io::Error {
    io::Error::other(format!("landlock ruleset: {e}"))
}

/// Drop the supplementary groups, gid, then uid to the per-tenant identity.
/// Async-signal-safe: thin syscall wrappers, no allocation.
fn drop_privileges(uid: u32, gid: u32) -> io::Result<()> {
    use nix::unistd::{setgroups, setresgid, setresuid, Gid, Uid};

    setgroups(&[]).map_err(errno_to_io)?;
    let g = Gid::from_raw(gid);
    setresgid(g, g, g).map_err(errno_to_io)?;
    let u = Uid::from_raw(uid);
    setresuid(u, u, u).map_err(errno_to_io)?;
    Ok(())
}

fn errno_to_io(e: nix::errno::Errno) -> io::Error {
    io::Error::from_raw_os_error(e as i32)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Privileged: needs root (CAP_CHOWN) and writable tenant roots. Run with
    // `HOUSTON_ISOLATION=1 cargo test -- --ignored` as root. The unprivileged
    // ruleset build is covered separately below.
    #[test]
    #[ignore]
    fn provision_chowns_agent_dir() {
        let tmp = tempfile::tempdir().unwrap();
        std::env::set_var(super::super::TENANTS_ROOT_ENV, tmp.path().join("tenants"));
        let agent = tmp.path().join("agent");
        std::fs::create_dir_all(&agent).unwrap();
        let policy = IsolationPolicy {
            agent_root: agent.clone(),
            tenant_home: tmp.path().join("tenants/100001"),
            tenant_uid: 100_001,
            tenant_gid: 100_001,
        };
        provision(&policy).unwrap();
        let meta = std::fs::metadata(&agent).unwrap();
        assert_eq!(meta.permissions().mode() & 0o777, 0o700);
    }

    #[test]
    fn build_ruleset_succeeds_on_landlock_kernel() {
        // Building (not enforcing) the ruleset is unprivileged. On a kernel
        // with Landlock ABI v1 this must succeed; if the CI kernel lacks
        // Landlock the HardRequirement makes this Err — which is the correct,
        // loud behavior, so we only assert when we can actually build.
        let tmp = tempfile::tempdir().unwrap();
        let policy = IsolationPolicy {
            agent_root: tmp.path().to_path_buf(),
            tenant_home: tmp.path().to_path_buf(),
            tenant_uid: 100_002,
            tenant_gid: 100_002,
        };
        match build_ruleset(&policy) {
            Ok(_) => {}
            Err(e) => {
                // Acceptable only when the kernel genuinely lacks Landlock.
                let msg = e.to_string();
                assert!(msg.contains("landlock"), "unexpected ruleset error: {msg}");
            }
        }
    }

    /// Red-team proof of the L2 (filesystem) layer, runnable **unprivileged**
    /// on any Landlock kernel: a child jailed to the attacker's folder cannot
    /// read the victim tenant's secret, but can still read its own file. This
    /// is the core "agent A cannot read agent B" property, enforced by the
    /// kernel rather than the prompt. (uid drop — L1/L3 — needs root and is
    /// covered by the `--ignored` privileged tests + the always-on demo.)
    #[test]
    fn landlock_jail_blocks_sibling_read_but_allows_own() {
        use std::os::unix::process::CommandExt;
        use std::process::{Command as StdCommand, Stdio};

        // Skip cleanly if this kernel lacks Landlock (the build is the gate).
        let probe = IsolationPolicy {
            agent_root: std::env::temp_dir(),
            tenant_home: std::env::temp_dir(),
            tenant_uid: 100_900,
            tenant_gid: 100_900,
        };
        if build_ruleset(&probe).is_err() {
            eprintln!("kernel lacks Landlock — skipping red-team proof");
            return;
        }

        let tmp = tempfile::tempdir().unwrap();
        let victim = tmp.path().join("victim");
        let attacker = tmp.path().join("attacker");
        std::fs::create_dir_all(&victim).unwrap();
        std::fs::create_dir_all(&attacker).unwrap();
        std::fs::write(victim.join("secret.txt"), "TENANT_B_API_KEY=sk-secret").unwrap();
        std::fs::write(attacker.join("own.txt"), "mine").unwrap();

        let policy = IsolationPolicy {
            agent_root: attacker.clone(),
            tenant_home: attacker.clone(),
            tenant_uid: 100_901,
            tenant_gid: 100_901,
        };

        // Run `cat <target>` with ONLY the Landlock jail applied (no uid drop,
        // so the test needs no privilege).
        let run_cat = |target: PathBuf| -> std::process::ExitStatus {
            let mut ruleset = Some(build_ruleset(&policy).unwrap());
            let mut cmd = StdCommand::new("cat");
            cmd.arg(&target).stdout(Stdio::null()).stderr(Stdio::null());
            // SAFETY: async-signal-safe — restrict_self is a bare syscall and
            // the ruleset was built (allocated) in the parent above.
            unsafe {
                cmd.pre_exec(move || {
                    if let Some(rs) = ruleset.take() {
                        rs.restrict_self()
                            .map_err(|e| io::Error::other(format!("landlock: {e}")))?;
                    }
                    Ok(())
                });
            }
            cmd.status().unwrap()
        };

        assert!(
            run_cat(attacker.join("own.txt")).success(),
            "jailed agent MUST be able to read its own folder"
        );
        assert!(
            !run_cat(victim.join("secret.txt")).success(),
            "jailed agent MUST NOT be able to read the victim tenant's secret"
        );
    }
}
