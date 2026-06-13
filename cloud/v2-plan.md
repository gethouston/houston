# Houston Cloud v2 — Plan: one microVM per workspace, bwrap per agent, cron inside

> **RETIRED (2026-06-10).** This blueprint walled the WHOLE agent in a microVM
> because the agent had `bash`. The shipped architecture removes that premise:
> the agent is a cheap per-turn Cloud Run request with clamped file tools and
> NO bash; arbitrary code runs in the credential-less, egress-locked code
> sandbox. Paying the Kata/Intel nested-virt premium to wall a bash-less,
> key-less agent buys nothing. See `cloud/code-execution.md` (the decided
> model) and `cloud/README.md`. Kept for the cost tables and the bin-packing
> analysis only — do not build from this.

**Status:** retired design blueprint (never built).

---

## TL;DR

**v1 problem:** one GKE-Autopilot **pod per agent**. Autopilot bills per pod with a ~$10/pod/month floor → 10 agents ≈ **$100/user**, ≈ **$74.5k/mo at 745 users** — and it only gets worse if we push always-on 24/7 routine agents.

**v2:** one **microVM per *workspace*** (the hard, cross-tenant boundary) bin-packed onto big nodes; **inside** it a per-workspace **runtime manager** spawns a **pi worker per agent on demand**, each **bwrap-jailed** to its own directory (the soft, same-user boundary), with an **internal cron** for routines. An idle agent is **just a directory — zero processes, zero RAM**. A workspace with routines/activity stays warm; a dormant one sleeps to ~$0.

**Cost:** **~$1–4.5 / workspace / month** depending on stack + pricing tier (table below) — **20–40× cheaper than v1**, and the LLM still runs on the user's own subscription ($0 to us).

---

## Current live v1 infra (what you're evolving)

- **Frontend:** Cloud Run `https://houston-web-1056698080170.us-east1.run.app`.
- **Control-plane:** GKE **Autopilot** cluster `houston-cloud` (us-east1, project `gethouston`), LoadBalancer `34.74.83.237`, namespace `houston-system`. Images at `us-east1-docker.pkg.dev/gethouston/houston/{control-plane,runtime,web}`; build via `gcloud builds submit --config cloud/cloudbuild.yaml`.
- **Auth:** Supabase project `zfpnlvxazrataiannvtq` (ES256/JWKS). **Secrets only in `.context/cloud.env` (gitignored).**
- **Data:** ~745 real users in `auth.users` — **prod DB ops must be additive + transparent.**
- v1 is the **reference, and it's live** — don't break it; build v2 alongside and cut over deliberately.

## Architecture

```
 big Intel node (bin-packed, committed/Spot)
 ├─ workspace-A microVM (Kata/Firecracker)         ← HARD boundary: user vs user (KVM, own guest kernel)
 │   └─ runtime MANAGER  (1 bun process / VM)
 │        ├─ HTTP :4317  (the only thing the control-plane reaches; workspace-scoped Bearer)
 │        ├─ internal CRON  (fires routines from per-agent files — no external scheduler)
 │        ├─ connect-once credential loop (1 per workspace)
 │        └─ spawns on demand:
 │             ├─ agent-1 worker  (bwrap: only /agents/1 visible)   ← SOFT boundary: agent vs agent (same user)
 │             └─ agent-2 worker  (bwrap: only /agents/2 visible)
 ├─ workspace-B microVM …
 └─ …
```

Two isolation layers, each matched to its threat:
- **microVM per workspace** — kernel-hard, for *different users* (hostile). The only boundary that must be VM-grade.
- **bwrap per agent** — namespaces + bind-mounts + cgroups, for *one user's own agents* (blast-radius containment, e.g. a prompt-injected agent can't read a sibling's files). Cheap, in-VM. A bwrap escape is still trapped inside that one user's microVM.

---

## ⚠️ THE key decision: Kata vs gVisor (they are NOT interchangeable here)

The bwrap-per-agent design needs **unprivileged user/mount/pid namespaces (`clone`/`unshare`)** — i.e. a **real Linux kernel**.

| | **Kata-fc (Firecracker under Kata RuntimeClass)** | **gVisor (GKE Sandbox / Agent Sandbox)** |
|---|---|---|
| Cross-tenant boundary | **Hard** — real KVM microVM, own guest kernel | Medium-hard — userspace syscall interception, shared host kernel |
| bwrap-per-agent inside | **Works** (real kernel) | **Breaks** — gVisor doesn't reliably support nested user namespaces; you'd drop bwrap and isolate agents another way (gVisor-native pod per agent, or chroot+cgroup) |
| Node requirement | **Intel-only** (`n2`/`c3`-Intel) + `--enable-nested-virtualization`; **not E2/AMD/Arm**; privileged pods; self-install Kata RuntimeClass DaemonSet | Runs on E2/Arm/**Autopilot**; managed RuntimeClass `gvisor`; zero infra |
| Startup | ~125 ms VM boot; ~1–2 s realistic cold pod | Sub-second; warm pools; **Pod Snapshots** suspend/resume (great for the sleep lifecycle) |
| Ops | High-medium (you own the node pool, nested-virt image pins, Kata upgrades) | Lowest (managed) |
| Cost | ~45% pricier (Intel N2 + ~10% nested-virt CPU tax) | Cheaper (E2, denser) |

**Recommendation:** ship **Kata-fc on an Intel nested-virt GKE-Standard node pool** for the hard per-workspace boundary + bwrap-per-agent (the design as written). **Prototype GKE Agent Sandbox (gVisor) in parallel** as the lower-ops/cheaper fallback — its snapshot/suspend is a near-perfect match for sleep — *if* the team accepts a non-VM cross-tenant boundary and drops bwrap. **Do not assume you can have both the cheap E2/gVisor stack AND bwrap-inside.**

---

## Cost model

Slice = **0.1 vCPU + 512 MB** per workspace (1 vCPU : 5 GiB). Match the node ratio so nothing strands: a **24 vCPU / 120 GiB** custom node holds **~215 workspaces** after ~10–12% node/system reservation.

Per-workspace / month (validated us-central1 list prices; ~215 reserved slices/node; **verify against the BigQuery billing export before committing dollars** — `config.billingBqTable` is already wired):

| Stack / node | On-demand | 3-yr committed | Spot |
|---|---|---|---|
| **gVisor on `e2-custom-24-122880`** ($638/mo node) | **~$3.0** | ~$1.3 | ~$0.9 |
| **Kata-fc on `n2-custom-24-122880`** ($925/mo node, +~10% virt tax) | **~$4.5** | ~$1.9 | ~$1.3 |

Notes:
- These are the **conservative, reserved-slice** floor. Because an idle agent runs **zero processes**, real idle draw is ~0.02–0.03 vCPU — so with **vCPU oversubscription** (RAM stays the binding constraint) you can pack more workspaces/node and approach **~$3 even on Kata/N2**. Validate real idle-worker RSS first.
- **Kata-qemu** adds ~100–130 MiB/VM RAM → ~20% less density; **kata-fc** keeps the per-VM RAM floor negligible — prefer it.
- **Pricing is mode-exclusive:** Spot gets no CUD/SUD; CUDs don't stack with SUDs. Strategy: **committed** node pool for the always-warm baseline (workspaces with routines) + **Spot** pool for burst/wake, with graceful drain (Spot evicts on ~30 s notice — fine for stateless wakes, not for a workspace mid-routine unless checkpointed).
- **The Intel premium:** the hard-boundary (Kata/Firecracker) path **cannot** use E2/AMD/Arm — nested virtualization is **Intel-only** — so it runs on **N2** (~45% more per vCPU + per GB) plus a ~10% nested-virt CPU tax. That is the entire `~$3 (gVisor/E2) → ~$4.5 (Kata-fc/N2)` gap. It buys the kernel-hard cross-tenant boundary and keeps bwrap; still 20–30× under v1. (`kata-fc` = Firecracker as Kata's hypervisor — light VMM + managed GKE plumbing; drop to `kata-clh` only if Firecracker's minimal device model bites.)
- vs v1 (~$100/user, ~$74.5k/mo @ 745 users): **20–40× cheaper.**

---

## Reuse map — keep / modify / replace / new

**KEEP (reuse ~verbatim — it's already workspace- or agent-scoped):**
- `packages/control-plane/src/auth/*` (Supabase JWT verify), `domain/*` (workspaces/agents + `canUseAgent`), `store/*` (Pg/Memory workspace store).
- `packages/control-plane/src/credentials/*` (connect-once store + central refresh + vault) — **already workspace-scoped; reused verbatim.**
- `packages/control-plane/src/proxy/route.ts` (the SSE-safe `forward()` with retry/abort) — reused **and lifted into the runtime manager** for the in-VM fan-out.
- `packages/web/*` (frontend + engine-adapter + cloud-login + profile + admin) — UI is unchanged (agents are still per-agent to the user).
- `packages/runtime/src/{session/chat,session/bus,session/sse,store/conversations,ai/providers,auth/login,auth/storage,session/resource-loader}` — this **is** the per-agent worker logic; runs inside the bwrapped worker, paths resolved per-agent.
- `supabase/migrations/*`.

**MODIFY:**
- `control-plane/src/ports.ts` + `server.ts`: `SandboxManager.ensureAwake(agent)` → keyed on **workspace**; `SandboxEndpoint` becomes per-workspace; the `/agents/:id/*` proxy resolves agent→workspace, wakes the **workspace VM**, and forwards with the agent id in the path so the in-VM manager demuxes.
- `control-plane/src/config.ts`: `runtimeClass` (kata-fc/gvisor), node-pool + lifecycle config.
- `runtime/src/config.ts`: split into **manager** config vs **per-worker** config (worker paths derive from `HOUSTON_AGENT_DIR`).
- `runtime/src/transport/server.ts`: demoted to the **worker's unix-socket handler** (drop the TCP listen + workspace-token gate; the socket is the trust boundary).
- `runtime/src/session/chat.ts`: drop the inline `syncServedCredential()` (the manager guarantees a fresh `auth.json` before forwarding).

**REPLACE (the real rebuild):**
- `control-plane/src/launcher/{gke,manifest,reconcile,names}.ts`: per-agent Deployment/Service/PVC → **per-workspace microVM** lifecycle (ensure/sleep/destroy keyed by workspace, Kata RuntimeClass).
- `cloud/k8s/*` + `cloud/scripts/02-cluster.sh`: Autopilot + `--enable-agent-sandbox` → **GKE Standard + Intel nested-virt node pool + Kata RuntimeClass install** (or gVisor-on-Autopilot for the fallback).
- `runtime/src/main.ts`: becomes the **manager** entrypoint.

**NEW:**
- `runtime/src/manager/{server,workers,cron,credential}.ts` — the per-workspace supervisor (see below).
- `runtime/src/worker/main.ts` — the worker entrypoint bound to a **unix socket**.
- `runtime/Dockerfile`: add **bubblewrap** + util-linux; CMD → manager.
- The **internal cron / routine scheduler**, **idle-sleep**, and the **per-workspace up/sleep policy**.

---

## Runtime redesign (manager + worker + cron)

**Manager** (one bun process per microVM, the only thing the control-plane reaches; owns NO AI logic):
1. HTTP `:4317`, workspace-scoped Bearer.
2. Worker registry `Map<agentId, {child, sock, lastActivity}>` — absent entry = zero processes for that agent.
3. `ensureWorker(agentId)` → fork the bwrapped worker if absent (dedupe concurrent first-hits), await socket readiness.
4. Transparent reverse-proxy `/agents/:id/<rest>` → that worker's **unix socket** (lift `forward()` from the control-plane, retargeted to `fetch({ unix })`, SSE byte-for-byte).
5. **Internal cron** (below).
6. The one connect-once credential loop for the workspace.
7. **Idle reaper**: SIGTERM workers idle > `HOUSTON_WORKER_IDLE_MS` with no in-flight turn / SSE; files persist, next hit cold-starts and `SessionManager.continueRecent()` resumes.

**Worker** (`worker/main.ts`, one per active agent): today's whole single-agent runtime, but bound to a unix socket instead of TCP, exposing only `/health` + `/conversations/*` + `/auth/*` + `/settings`.

**bwrap flags per worker** (agent `A`):
```
--unshare-pid --unshare-mount --unshare-ipc --unshare-uts --unshare-cgroup
--die-with-parent --new-session --cap-drop ALL --no-new-privs --clearenv
--proc /proc --dev /dev --tmpfs /tmp
--ro-bind /app /app  --ro-bind /usr/local/bin/bun /usr/local/bin/bun  --ro-bind /etc/ssl /etc/ssl
--bind /agents/A /agents/A          # the ONLY writable mount — siblings are simply ABSENT
--bind /run/agents/A.sock /run/agents/A.sock
--setenv HOUSTON_AGENT_DIR /agents/A  (+ DATA/WORKSPACE/SOCK + connect-once env)
```
Plus a **cgroup v2** per worker: `memory.max=1.5Gi`, `cpu.max="100000 100000"` (1 vCPU), `pids.max=256`. A sibling's dir isn't denied — it's *not in the mount namespace at all*. Drop-ALL-caps + no-new-privs + own PID ns means no ptrace/`/proc/<pid>/root` path to a sibling.

**Internal cron** (`manager/cron.ts`, modeled on the desktop `engine/houston-engine-core/src/routines/scheduler.rs`):
- Schedules live as **per-agent files** on the PVC: `/agents/<id>/.data/routines/<id>.json` (reuse the Rust `Routine` JSON shape so the existing frontend CRUD + board parity carry over; match `cron_compat` day-of-week normalization).
- Manager rescans + reconciles timers on boot and on file-watch change.
- **On fire:** `ensureWorker(agentId)` → POST a routine turn to its socket (`session_key = "routine-<id>"`) → write a run record → dedupe if the prior run is still in flight.
- **This is the load-bearing change:** no 24/7 turn loop — the manager fires, the worker spins up for the task, then the reaper reaps it.

---

## Lifecycle (wake / sleep)

- **Unit = the workspace VM** (not the agent). Control-plane stays stateless + event-driven and is the only thing that scales VMs.
- **Wake:** request → control-plane resolves agent→workspace → `ensureWorkspaceAwake` (scale Kata Deployment 0→1, or resume a Pod Snapshot) → forward; manager lazily spawns the agent worker.
- **Stay-up:** while the manager has an enabled routine, a warm worker, or recent traffic, it reports "busy" so the control-plane idle reaper (`config.idleSleepMinutes`) won't sleep it. → ~$1–4.5/workspace/mo.
- **Sleep (dormant → ~$0):** no workers, no near-future cron, no traffic for `idleSleepMinutes` → control-plane scales the VM to 0 (or snapshots+suspends). PVC + central credential persist; a woken workspace re-pulls a fresh token per turn (no re-login). Standing cost = just PD storage (~$0.10/GiB-mo).
- **Catch-up:** a slept workspace with a routine due needs the control-plane to know its next fire — manager exposes `GET /cron/next`, or persist next-fire to Postgres at routine-write time; on wake, fire-once any missed routine then schedule forward.

---

## Phased build plan

1. **Cluster swap** — GKE Standard regional cluster + Intel nested-virt node pool + Kata-fc RuntimeClass (rewrite `cloud/scripts/02-cluster.sh`). Smoke-test a Kata pod with bwrap-in-VM.
2. **Runtime: manager + worker split** — `manager/{server,workers}` + `worker/main.ts` (unix socket); prove chat routes through the manager to a bwrapped worker; idle reaper.
3. **Control-plane: per-workspace SandboxManager** — replace `sandbox/*` to ensure/sleep/destroy one VM per workspace; proxy carries agentId; reuse auth/credentials/proxy.
4. **Internal cron + routines** — `manager/cron.ts`, per-agent routine files, fire→spawn→run→reap; reuse the desktop Routine schema + frontend CRUD.
5. **Idle-sleep + up/sleep policy** — the reaper + `GET /cron/next` + catch-up-on-wake.
6. **Cost hardening** — committed baseline pool + Spot burst pool; validate real idle RSS; tune density/oversubscription against BigQuery actuals.
7. **(Parallel) gVisor/Agent-Sandbox spike** — the fallback, in case Kata ops/cost hurts.

---

## Open decisions for the team

- **Kata vs gVisor** — hard VM boundary + bwrap (Kata, Intel, pricier, more ops) **vs** managed/cheap gVisor (drop bwrap, redesign agent jail). This is the fork everything hangs on.
- Worker transport: unix socket (assumed) vs loopback TCP per worker.
- Credential delivery: manager pre-writes each worker's `auth.json` per turn, vs workers fetch `/sandbox/credential` through the manager.
- Sleep-policy ownership + missed-routine "fire-once vs skip" rule.
- Per-VM concurrency cap (max warm workers) + behavior when chat + several routines exceed it (queue / LRU-evict / backpressure).
- Routine schema: reuse the Rust shape verbatim vs a lean TS subset (cron dialect must match to avoid the Sunday off-by-one bug).
- Does bwrap need a CAP_SYS_ADMIN helper inside the guest, or do unprivileged userns suffice on the chosen node image?

---

## Picking up this work (read me first if you're the rebuild session)

- The reusable v1 code lives on branch **`cloud-orgs-agent-isolation`** (PR #8). The cleanest start is to **branch v2 from there** (not `main`) so you inherit the ~70% you keep; start fresh only if you judge it cleaner — your call, tell the human which.
- If your worktree is off `main`, fetch the code + this plan first: `git fetch origin && git checkout cloud-orgs-agent-isolation` (or read it via `gh pr diff 8`).
- **First decision, before any code: Kata vs gVisor** (the table above). It forks the node type, the cost, the ops load, and whether bwrap survives. Surface your recommendation and get the human's nod before the cluster swap.
- Then follow the **7-phase plan**, cluster swap first.
- **v1 is live with real users — keep it running.** Build v2 on its own branch; cut over only when proven.

*(Generated from a 3-agent design pass: hosting-stack + runtime-redesign were thorough; the reuse map was written by hand. All dollar figures are list-price estimates — reconcile against the BigQuery billing export before committing.)*
