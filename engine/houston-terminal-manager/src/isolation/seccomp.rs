//! seccomp-bpf denylist (Airlock L4): block the syscalls a jailed agent would
//! use to read or tamper with another process's memory or to introspect other
//! processes. The per-tenant uid (L1) already stops cross-uid `/proc` reads via
//! DAC; this layer is defense-in-depth against same-uid edge cases and any
//! future provider that runs multiple tenants under one uid, and it makes the
//! "read another process's memory" attack fail at the kernel regardless.
//!
//! A *denylist* (default-allow, deny a few) is used deliberately: an allowlist
//! over node/claude's huge syscall surface would be fragile and is out of scope
//! for the MVP. The denied calls are ones a legitimate provider CLI never
//! issues, so the blast radius is nil.
//!
//! Fork-safety: the BPF program is compiled in the parent; [`apply`] runs only
//! the `seccomp`/`prctl` syscalls in the post-fork child. See `linux.rs`.

use seccompiler::{apply_filter, BpfProgram, SeccompAction, SeccompFilter};
use std::collections::BTreeMap;
use std::io;

#[cfg(target_arch = "x86_64")]
const TARGET_ARCH: seccompiler::TargetArch = seccompiler::TargetArch::x86_64;
#[cfg(target_arch = "aarch64")]
const TARGET_ARCH: seccompiler::TargetArch = seccompiler::TargetArch::aarch64;

/// Syscalls denied to a jailed agent — cross-process memory access and
/// introspection. A provider CLI never needs these.
fn denied_syscalls() -> Vec<i64> {
    vec![
        libc::SYS_ptrace,            // debugger attach / peek another process
        libc::SYS_process_vm_readv,  // read another process's memory
        libc::SYS_process_vm_writev, // write another process's memory
        libc::SYS_kcmp,              // compare/correlate processes (info leak)
        libc::SYS_pidfd_getfd,       // steal an fd from another process
        libc::SYS_process_madvise,   // operate on another process's address space
    ]
}

/// Compile the denylist into a BPF program. Call in the parent (this
/// allocates); apply the result in the child via [`apply`].
pub fn build_program() -> io::Result<BpfProgram> {
    // Empty rule vec for a syscall == match unconditionally → `match_action`.
    let rules: BTreeMap<i64, Vec<seccompiler::SeccompRule>> =
        denied_syscalls().into_iter().map(|sc| (sc, vec![])).collect();

    let filter = SeccompFilter::new(
        rules,
        SeccompAction::Allow,                     // default: allow everything else
        SeccompAction::Errno(libc::EPERM as u32), // denied → EPERM (blocked, not killed)
        TARGET_ARCH,
    )
    .map_err(|e| io::Error::other(format!("seccomp filter: {e}")))?;

    filter
        .try_into()
        .map_err(|e| io::Error::other(format!("seccomp compile: {e}")))
}

/// Install a pre-built filter on the current (post-fork) process. Async-signal-
/// safe: only `seccomp`/`prctl` syscalls run here.
pub fn apply(program: &BpfProgram) -> io::Result<()> {
    apply_filter(program).map_err(|e| io::Error::other(format!("seccomp apply: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Red-team proof of L4, runnable **unprivileged** (the `NO_NEW_PRIVS`
    /// path): a child that installs the filter and then calls
    /// `ptrace(PTRACE_TRACEME)` is rejected with `EPERM`. The program is built
    /// in the parent; the child performs only async-signal-safe syscalls.
    #[test]
    fn seccomp_blocks_ptrace() {
        let prog = build_program().expect("build seccomp program");
        // SAFETY: the child path uses only async-signal-safe libc calls
        // (prctl, the seccomp syscall via `apply`, ptrace, _exit).
        unsafe {
            let pid = libc::fork();
            assert!(pid >= 0, "fork failed");
            if pid == 0 {
                if libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0 {
                    libc::_exit(91);
                }
                if apply(&prog).is_err() {
                    libc::_exit(92);
                }
                *libc::__errno_location() = 0;
                let r = libc::ptrace(libc::PTRACE_TRACEME, 0, 0, 0);
                let e = *libc::__errno_location();
                // Blocked as expected → exit 0. Anything else encodes why.
                if r == -1 && e == libc::EPERM {
                    libc::_exit(0);
                }
                libc::_exit(40 + (e & 0x1f));
            }
            let mut status = 0;
            libc::waitpid(pid, &mut status, 0);
            let code = libc::WEXITSTATUS(status);
            assert_eq!(
                code, 0,
                "ptrace(PTRACE_TRACEME) must be blocked with EPERM under seccomp (child exit {code})"
            );
        }
    }
}
