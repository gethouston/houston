# Houston Cloud — Code-Execution Architecture: Evaluation & Build Handoff

> **COMPLETED (2026-06-10).** The evaluation confirmed the decomposition and
> all five §5 gates; everything below was then built and tested on this
> branch: file-tool clamp (outer rewrite-wall + inner operations-wall),
> access-token-only credentials (+ CP-side device-code connect), sandbox
> egress/SA lockdown + IAM two-header auth, per-workspace run_code and turn
> budgets, collision-safe artifacts, and the per-turn Cloud Run hosting layer
> (§7 fork #1 → resolved: per-turn Cloud Run, not Kata/gVisor pods; v2-plan
> retired). Historical document — current truth lives in
> `cloud/code-execution.md` + `cloud/README.md`.

**To:** the next (more capable) model picking this up. **You are in the same git worktree**
(`cloud-v2-hosting-layer`); all code and docs referenced here are on disk. You do **not** have
the conversation that produced this — this file is the complete context.

**Your mandate:** independently evaluate this architecture and then build the best version of it,
secure and with agents genuinely isolated. Do not take this document on faith — **re-verify every
load-bearing claim against the actual code** (§9 gives you the exact greps). Prior design docs in
this repo contain claims that turned out false on inspection; assume the same could be true here.

**Ground rules (non-negotiable):** follow `CLAUDE.md` at the repo root — especially **RULE 0 (no
shortcuts)**, tests-mandatory, the **no-silent-failure** beta policy, type-safety-over-strings,
the 200-line file limit, and the worktree git flow. Product context: Houston's user is
**non-technical**; the agent must be able to **run real code** (the canonical task is "build me a
PowerPoint"). Infra runs on **GCP** (there is ~$200k in credits — prefer GCP-native over E2B/Modal
when viable). The LLM is **pi** (`@earendil-works/pi-coding-agent` 0.78.1), a coding agent.

---

## 1. The problem, and how we got here (the decision narrative)

- Houston Cloud hosts AI agents for ~745 real users (org → users → agents). The guarantee to
  sell: **"User A's agent cannot read User B's data, even if prompt-injected."**
- The agent runtime is **pi**, a coding agent whose power is an unrestricted **`bash`** tool —
  i.e. it runs arbitrary untrusted code. **That single fact is why isolation is hard**, and why
  v1 gave every agent an always-on container (GKE pod) → ~$100/user, ~$74.5k/mo at 745 users.
  v2 proposed a microVM-per-workspace (Kata, Intel nested-virt) — kernel-hard but expensive.
- **The reframe (what this branch builds):** an agent doesn't need a permanent box. Split it:
  - **Agent = a cheap process.** Tools = safe in-process file ops + integrations (Composio,
    per-user OAuth held server-side) + a **`run_code`** tool. **Local `bash` is removed.**
  - **Code execution = a rented, ephemeral, credential-less sandbox.** `run_code` ships
    `{language, code, files}` to a **Cloud Run gen2** service (`--concurrency=1`, scale-to-zero,
    fresh wiped workdir per request); artifacts come back into the workspace. Idle ≈ $0.
  - This is essentially pi's own **Gondolin** pattern (pi + auth on the host, tool execution in a
    disposable microVM) — but Gondolin is local-dev-only, so we host the equivalent ourselves.
- **Why Cloud Run over E2B/Modal:** per-task cost is within a hair of both (~$0.0003/10s task),
  but Cloud Run is covered by the GCP credits, same VPC/IAM/bill, free same-region GCS egress.
  E2B/Modal only win on cold-start latency (~150ms vs ~1–3s), irrelevant for deck-building.
  **Graduation target at scale: GKE Agent Sandbox** (gVisor/Kata, default-deny net, pod
  snapshots) once sustained concurrency justifies an always-on cluster.

---

## 2. What is built and verified (this branch)

| Piece | Where | State |
|---|---|---|
| Code-exec sandbox service (`POST /run`, `GET /health`) | `packages/code-sandbox/src/{run,exec,artifacts,server,paths,types,config}.ts` | built · 16 tests pass |
| Sandbox container (python+node+bash + python-pptx/pandas/etc.) | `packages/code-sandbox/Dockerfile` + `requirements.txt` | built (build in CI) |
| `run_code` pi tool (ships files, runs remotely, writes artifacts back) | `packages/runtime/src/session/tools/run-code.ts` | built · 8 tests pass |
| Agent wiring (drop `bash` → add `run_code` iff a sandbox is configured) | `packages/runtime/src/session/chat.ts` | built · suite green |
| Cloud Run deploy (gen2, concurrency=1, scale-to-zero, secret token) | `cloud/scripts/05-code-sandbox.sh` | staged · confirm-before-billing |
| Design + pricing + security-gaps doc | `cloud/code-execution.md` | written |

**Genuinely solid (verified against code + tests):** the sandbox's in-instance hygiene — fresh
`mkdtemp` workdir removed in `finally`; minimal env with no inherited secrets; `detached` spawn +
SIGKILL of the whole **process group** (an orphaned `sleep &` grandchild is proven reaped);
symlinks skipped during artifact collection; byte caps on actual bytes (no TOCTOU); constant-time
bearer compare; early-abort body cap. The `run_code` path-clamps input + artifact paths
(`safeJoin`). Verified end-to-end locally: real Python wrote `deck.txt`, tool saved it into the
workspace. Run tests: `pnpm test` in each of `packages/code-sandbox` and `packages/runtime`.

---

## 3. What is NOT built (and is load-bearing)

1. **The agent-hosting layer itself** — how the pi runtime is hosted per agent with scale-to-zero
   is **undecided**. This is the actual cross-tenant wall (see §5). Everything else rests on it.
2. **Sandbox egress lockdown** (Direct VPC + firewall blocking `169.254.169.254` + RFC1918).
3. **GCS-backed workspace** — the MVP uses a local workspace dir; object-storage-as-filesystem is
   designed but unbuilt (and is awkward — see §6).
4. **Per-session warm sandbox** — the MVP is stateless per call (each `run_code` is independent).
5. **In-container gVisor (`runsc`)** for a second isolation layer; **per-tenant service account**.

---

## 4. The audit verdict

A multi-perspective adversarial audit (security red-team, isolation audit, architecture
alternatives, cost stress-test, product-fit — each independently challenged) converged on:
**SOUND-WITH-FIXES.** The decomposition is correct and the `run_code` sandbox is well-built, but
**the agent tier is not yet isolated, so the cross-tenant guarantee cannot be claimed yet.**

Think in **two tiers**:
- **Untrusted-code tier (`run_code` sandbox): strong.** microVM + concurrency=1 + wiped workdir +
  group-kill + credential-less. This earns its guarantee.
- **Agent tier: not isolated yet.** See §5.

---

## 5. Verified critical findings — the gates before real (hostile) tenants

These were **confirmed against real source** (re-verify them yourself, §9):

1. **The agent's in-process file tools are NOT path-clamped.** They are pi's *defaults*; pi
   resolves an absolute path as-is (`node_modules/@earendil-works/pi-coding-agent/dist/utils/paths.js:63`,
   used by `dist/core/tools/read.js`), and the SDK exposes only `noTools/excludeTools/customTools`
   (`dist/core/sdk.d.ts`) — **no operations override**. `chat.ts` passes none, so a prompt-injected
   agent can `read({path:"/etc/passwd"})` or read its own `auth.json` with **no bash**. The doc's
   old "workspace-scoped file tools" claim was false for absolute paths.
   **Fix:** shadow read/ls/grep/find/edit/write with custom tools that reject/clamp absolute + `..`
   paths, AND/OR run the agent inside an OS/FS jail (bwrap/microVM). App-clamp is acceptable only
   as an inner wall behind a real kernel boundary.
2. **The agent holds the user's refresh token on disk.** `packages/runtime/src/auth/serve.ts:62`
   writes `{type:"oauth", access, refresh, expires}` to `auth.json` every turn in connect-once
   mode — its own docstring claims it does *not*. Gap #1 + #2 = credential theft via prompt
   injection. **Fix:** keyless-proxy-only in cloud, or hand the agent a **short-TTL access token
   only**, never the refresh token.
3. **Open egress + shared service account + reachable metadata server.** `cloud/scripts/05-code-sandbox.sh`
   deploys one SA, no VPC (only a WARN). Until a firewall blocks `169.254.169.254` + RFC1918,
   untrusted code can mint the shared SA's token and exfiltrate. A metadata/RFC1918 block does
   **not** stop exfil once general outbound HTTPS is allowed — true exfil control needs an
   **egress allowlist** (proxy with domain allowlist), or no general internet + pre-baked deps.
   Plus a **near-zero-IAM, per-tenant** SA.
4. **The agent-hosting layer is the real cross-tenant wall — and it's undecided/unbuilt.** Today
   the only kernel-grade boundary (the Cloud Run microVM) is attached to the *least* sensitive
   process (stateless code-exec); the credentialed, workspace-mounted agent has no demonstrated
   wall in this repo. Choose it and pen-test agent↔agent reachability before hostile tenants.
5. **No per-tenant rate/quota on `run_code`** → one tenant can saturate the 50-instance fleet
   (availability DoS). Add a per-workspace concurrency budget in the control plane.

**Also real (lower severity):** artifact write-back **silently overwrites** existing workspace
files (`run-code.ts`, no collision check); within-scope prompt injection lets the agent **act as
the user** (Composio, its own files) — inherent to autonomous agents, but must be disclosed (the
guarantee is "A can't read B," not "the agent is safe").

**Fixed this session:** the silent over-budget artifact drop is now **surfaced**
(`droppedArtifacts` in `types.ts`/`artifacts.ts`/`run-code.ts`), per the no-silent-failure rule.

**Refuted findings — do NOT chase these (they were claimed in audit, then disproven against code):**
- "A long-lived SSE stream on Cloud Run is billed per session → ~120× cost." The built web client
  closes the SSE stream **per turn** (`packages/web/src/engine-adapter/translate.ts` aborts on
  `done`/`error`), not per session. The real cost caveat is narrower (a turn is 30–120s).
- "Per-agent Cloud Run services blow the 1000-services/region cap." No doc proposes that — the
  **agent runs on GKE pods** (`cloud/k8s/agent-deployment.yaml`); the only Cloud Run service is
  the single shared sandbox.

---

## 6. The recommended best plan (what to build)

Keep the spine (cheap agent + credential-less rented exec; keys out of both). Then:

1. **Promote per-SESSION warm sandbox + hydrated workspace from "follow-up" to the cloud v1
   default.** Stateless per-call `run_code` breaks the loops real work needs (`pip install` then
   use; debug→fix→rerun; multi-file edits) and forces object-storage-as-filesystem (slow, wrong
   `edit`/rename semantics). One disposable box per **active chat** — kept warm via session
   affinity / min-instances during the conversation, **destroyed (never reused) at session end** —
   fixes statelessness, makes file tools run against a real local FS, and collapses the
   agent-view/sandbox-view into one directory. Keep stateless `run_code` as the desktop/one-shot
   fallback. (Note the lifecycle obligation: a warm per-tenant box must be destroyed at session
   end, since the "wiped-workdir makes a warm instance safe for the next tenant" invariant no
   longer holds within a session.)
2. **Close the five §5 gates as ship-blockers**, not follow-ups. Smallest first: surface
   input-too-large + add collision-safe artifact write-back; block the metadata server; clamp the
   file tools; then the structural ones.
3. **Decide and PRICE the agent-hosting layer before quoting any per-user number.** GKE
   bin-packed microVM (v2-plan's ~$1–4.5/workspace/mo committed) is the defensible path; validate
   real idle-worker RSS first (the density/oversubscription assumption is unmeasured). Name **GKE
   Agent Sandbox + pod-snapshots** as the graduation target for sustained concurrency.
4. **Reconcile or retire `cloud/v2-plan.md`'s microVM-per-workspace + Kata/Intel plan.** Once the
   agent is credential-less and bash-less, the *agent* is no longer the untrusted unit — paying
   the Intel nested-virt premium to wall the whole agent is largely wasted. The two security
   models (v2 = VM-around-the-whole-agent; this branch = cheap agent + walled exec) are currently
   contradictory and unreconciled in the repo. Pick one explicitly.
5. **Cost truth:** the run_code sandbox is genuinely pennies/scale-to-zero. The real costs are
   the (undecided) agent-hosting layer, the **routine-bearing population that never scales to $0**
   (must fold into the blended average), and **LLM tokens** — which are only "$0 to us" under
   strict BYO-key, contradicting the keyless-proxy-with-org-keys design. Add missing lines:
   control-plane compute, Direct VPC egress, GCS operations.

---

## 7. Open decisions you must make (the real forks)

1. **Agent-hosting boundary:** GKE bin-packed microVM (Kata) vs gVisor pods vs bwrap-per-agent.
   This is "the fork everything hangs on" (v2-plan's words). It sets cost, ops, and whether the
   cross-tenant wall is kernel-hard.
2. **Credentials in cloud:** keyless-proxy-only (delete the connect-once refresh-token write) vs
   short-TTL access token to the agent. Reconcile with the keyless proxy already built at
   `packages/runtime/spike/keyless-proxy.ts` + `packages/host/src/proxy/credentials.ts`.
3. **File-tool isolation:** clamp at the app layer (shadow pi's tools) vs rely on an FS jail vs
   both. For mutually-hostile tenants, app-clamp alone is not acceptable.
4. **Stateful vs stateless exec:** per-session warm box (recommended) vs stateless per call.
5. **Egress policy:** allowlist proxy vs no-internet+pre-baked deps vs open (not acceptable).
6. **Workspace storage:** local PVC vs GCS-prefix (+ hydration layer). PVC reintroduces a per-agent
   disk; GCS needs a real FUSE/hydration design.
7. **Reconcile v2:** keep, retire, or layer `cloud/v2-plan.md`.

---

## 8. Map of the repo for this work

- `cloud/code-execution.md` — the design + full pricing model + the Security-gaps section.
- `cloud/v2-plan.md` — the *prior* plan (microVM-per-workspace + bwrap + cron). Contradicts this
  branch's bet; must be reconciled (§6.4).
- `cloud/README.md` — the *earlier* cloud plan (per-agent gVisor sandbox + control plane + keyless
  proxy + RBAC §2/§5/§6 are the security model worth reading).
- `packages/code-sandbox/**` — the built sandbox service (your strongest existing component).
- `packages/runtime/src/session/tools/run-code.ts`, `…/session/chat.ts`, `…/config.ts`,
  `…/auth/serve.ts` — the agent-side wiring + the credential path (§5.2).
- `packages/host/**` — auth, RBAC (`domain/access.ts`), the SSE proxy (`proxy/route.ts`),
  the keyless credential proxy (`proxy/credentials.ts`), the GKE sandbox manager (`sandbox/*`).
- `cloud/k8s/agent-deployment.yaml` — the agent-as-GKE-pod manifest (disproves the per-agent
  Cloud Run strawman; relevant to the hosting decision).

---

## 9. Re-verify my load-bearing claims yourself (don't trust this doc)

```sh
PI=packages/runtime/node_modules/@earendil-works/pi-coding-agent
# Claim: pi resolves absolute paths as-is (file tools NOT clamped). Expect the isAbsolute line:
grep -n "isAbsolute(normalized) ? nodeResolvePath" $PI/dist/utils/paths.js
# Claim: the SDK has no file-operations override (only noTools/excludeTools/customTools):
grep -n "noTools\|excludeTools\|customTools\|operations" $PI/dist/core/sdk.d.ts
# Claim: chat.ts passes no clamped file ops, only cwd + tool names:
grep -n "createAgentSession\|tools:\|customTools" packages/runtime/src/session/chat.ts
# Claim: serve.ts writes the refresh token to auth.json every turn:
grep -n "refresh\|writeFileSync\|auth.json" packages/runtime/src/auth/serve.ts
# Claim: the deploy ships one SA, no VPC egress lock (only a WARN):
grep -n "service-account\|vpc\|egress\|169.254\|WARN\|warn" cloud/scripts/05-code-sandbox.sh
# Then run the suites:
( cd packages/code-sandbox && pnpm test ) ; ( cd packages/runtime && pnpm test )
```

If any claim here does not match the code, **trust the code and say so** — this document is a
starting point, not ground truth.
