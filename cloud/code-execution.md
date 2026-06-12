# Houston Cloud — code execution as a rented sandbox (cheap-agent model)

**Status:** MVP built + tested in-repo. Live deploy needs the GCP account (run `cloud/scripts/05-code-sandbox.sh`).

The premise that makes Houston Cloud cheap: **an agent is not a server you keep
running — it's a row in a database.** The expensive thing in v1/v2 was giving
every agent a permanent, always-on box because the agent has a `bash` tool and
`bash` runs untrusted code. This design removes that:

- **The agent stays cheap.** Its tools are the safe in-process ones
  (`read/ls/grep/find/edit/write`) plus integrations. No local `bash`.
- **Code execution is a tool the agent rents for a few seconds.** When the agent
  needs to *run* something (write Python to build a `.pptx`, crunch a CSV, render
  a chart), it calls `run_code`, which executes in a disposable Cloud Run sandbox
  and returns the output + any files. The box scales to zero between tasks.

The container never disappears — it moves from "the agent's permanent home"
(billed 24/7) to "an 8-second tool call" (billed per use). That move is the
entire cost story.

```
Agent = a row + a GCS prefix. A turn = ONE Cloud Run request (per-turn runtime):
  hydrate gs://…/ws/<ws>/<agent> → run pi → stream SSE → sync delta back → wipe
  ├─ read/ls/grep/find/edit/write   CLAMPED to the workspace (Gate #1 closed:
  │                                 outer path-rewrite wall + inner operations
  │                                 wall — see packages/runtime/src/session/tools/)
  └─ run_code(language, code, …) ──▶ Cloud Run code-sandbox (gen2, concurrency=1)
                                        fresh /tmp workdir → run → return stdout
                                        + artifacts → workdir wiped → scale to 0
        artifacts written back collision-safely (overwrite only declared inputs)
```

## What's in this repo

| Piece | Where | State |
|---|---|---|
| Code-exec sandbox service (`POST /run`, `GET /health`) | `packages/code-sandbox/src/{run,server,main,config}.ts` | ✅ built · 14 tests |
| Sandbox container image (python + node + bash + batteries) | `packages/code-sandbox/Dockerfile` + `requirements.txt` | ✅ built (build in CI) |
| `run_code` pi tool (calls the sandbox, syncs files) | `packages/runtime/src/session/tools/run-code.ts` | ✅ built · 5 tests |
| Agent wiring (drop `bash` → add `run_code` when a sandbox is configured) | `packages/runtime/src/session/chat.ts` | ✅ built · suite green |
| Cloud Run deploy (gen2, concurrency=1, scale-to-zero, secret token) | `cloud/scripts/05-code-sandbox.sh` | ✅ staged · confirm-before-billing |
| Live deploy · egress lockdown · load-test | — | ⏳ needs the GCP account |

Run it locally: `cd packages/code-sandbox && bun run dev`, then
`HOUSTON_CODE_SANDBOX_URL=http://127.0.0.1:8080 bun run dev` in `packages/runtime`.
Tests: `bun test` in each package.

## The sandbox contract

`POST /run` (Bearer-gated) →
```jsonc
{ "language": "python|bash|node", "code": "…", "files": [{ "path": "in.csv", "contentBase64": "…" }], "timeoutMs": 60000 }
```
→
```jsonc
{ "exitCode": 0, "stdout": "…", "stderr": "…", "timedOut": false, "truncated": false,
  "artifacts": [{ "path": "deck.pptx", "contentBase64": "…", "bytes": 12345 }], "durationMs": 812 }
```

## Why Cloud Run (and why GCP-native beats E2B/Modal here)

The choice was researched against GKE Agent Sandbox, Cloud Run jobs, Cloud
Functions, and Cloud Batch. **Cloud Run gen2 service** wins for a bursty
build-a-deck workload because it's the only GCP-native option that is *genuinely*
serverless (true scale-to-zero, per-100ms billing, no cluster fee) **and** can be
made strongly isolated for untrusted code.

**Isolation (defense in depth):**
1. **Per-instance microVM boundary** — Cloud Run gen2 runs each instance in a
   full microVM, so one tenant's instance can't see another's. Cross-*instance*
   leakage is off the table by the platform.
2. **`--concurrency=1`** — one task per instance at a time. Mandatory: Cloud Run
   does **not** isolate concurrent requests sharing an instance.
3. **Fresh workdir per request, wiped on return** — kills the only residual leak
   (a warm instance's filesystem/memory persisting from request N to N+1).
4. **`--no-allow-unauthenticated` + Bearer token** — two independent gates so only
   the control plane/runtime can call it.
5. *(follow-up)* **Egress lockdown** — Direct VPC + a firewall blocking the
   metadata server (`169.254.169.254`) and RFC1918, so untrusted code can't pivot.
6. *(optional, stronger)* run gVisor `runsc` **inside** the container per request
   (Google's `cloud-run-sandbox` reference pattern) for a second, syscall-level
   kernel boundary.

Per-task cost is within a hair of E2B/Modal (all ~$0.0003 for a 10s task). The
deciding factors are GCP-native: it's **covered by the $200k credits**, lives in
the same VPC/IAM/bill, and same-region GCS↔Cloud Run egress is free. The only
thing E2B/Modal buy you is faster cold start (~150 ms vs ~1–3 s) — irrelevant for
"build a deck." Graduate to **GKE Agent Sandbox** only once sustained concurrency
(hundreds of live sandboxes, warm-pool <200 ms) justifies an always-on cluster.

## Pricing

> List prices, Cloud Run **Tier-1** region (us-east1/us-central1), request-based
> CPU billing. **Verify against the live pricing pages before committing dollars**
> (same caveat as `cloud/billing.md`). LLM tokens are **not** included here — they
> ride on the user's own ChatGPT/Codex subscription (connect-once; the cloud is
> OpenAI-only — Anthropic's subscription terms don't allow it) and are $0 to Houston.

**Unit rates**

| Resource | Rate |
|---|---|
| Cloud Run vCPU | $0.000024 / vCPU-second |
| Cloud Run memory | $0.0000025 / GiB-second |
| Cloud Run requests | $0.40 / million |
| Cloud Run free tier / mo | 180,000 vCPU-s · 360,000 GiB-s · 2M requests |
| GCS Standard storage | $0.020 / GiB-month |
| GCS ops | writes $0.005/1k · reads $0.0004/1k |
| GCS → Cloud Run egress (same region) | free |

**Per code-exec task** (1 vCPU + 1 GiB):

| Task wall time | Cost / task |
|---|---|
| 5 s | ~$0.00013 |
| 10 s (typical "build a deck") | ~$0.00027 |
| 30 s (heavy) | ~$0.0008 |

`= seconds × (0.000024 + 0.0000025) + $0.0000004/request`. The free tier alone
covers ~18,000 ten-second tasks **per month** before a cent is billed — and
that's before the $200k credits.

**Per user / month** (illustrative). Note what dominates: for an **idle** user it's
storage; for an **active** user it's **agent compute** (the runtime billed per
second while it handles turns — much of that waiting on the LLM), *not* storage.
The code-execution sandbox itself stays pennies either way.

| Component | Light user | Heavy user |
|---|---|---|
| Workspace storage (GCS) | ~$0.02 (1 GiB) | ~$0.20 (10 GiB) |
| Code execution (`run_code`) | ~50 tasks → **$0.01** | ~1,000 tasks → **$0.27** |
| Agent compute (scale-to-zero runtime, ~$0.0004/active turn) | ~$0.05 | ~$1.20 |
| **Total infra / user / mo** | **~$0.08** | **~$1.70** |
| LLM tokens | user's own plan ($0 to us) | user's own plan ($0 to us) |

**Idle user = storage only (≈ $0.02–0.20/mo, or ~$0 with a tiny workspace).**

**Versus the old design:** v1 was ~$100/user/mo (always-on pod floor) → ~$74.5k/mo
at 745 users. v2 got to ~$1–4.5/workspace/mo. This design makes the cost **track
real activity** instead of paying a fixed always-on floor: an idle user is just
storage (~$0.02–0.20/mo); an active user lands around **~$0.10–2/mo**, dominated
by **agent compute**, not storage — because *nothing runs when no one is using
it*. The two caveats on that number: (1) the agent-compute line is an estimate
for the runtime-hosting layer, which is **not built here** (only the code-exec
sandbox is) and depends on how the runtime is hosted (a long-lived SSE stream on
Cloud Run is billed for its open duration); (2) the genuinely-verified, pennies
part is the code-execution sandbox (~$0.0003/task). At 745 mostly-light users,
total infra is on the order of **tens to low-hundreds of dollars a month**; the
$200k credits last years.

**Cost comparison — code-exec backends** (per 10s task, normalized to 1 vCPU + 1 GiB):

| Backend | ~Cost / 10s task | Cold start | Monthly base | Notes |
|---|---|---|---|---|
| **Cloud Run gen2** | **~$0.00027** | ~1–3 s | $0 | covered by GCP credits; same VPC/bill; free GCS egress |
| E2B | ~$0.00033 | ~150 ms | $150/mo (Pro, real concurrency) | fastest cold start; one-time $100 free credit |
| Modal (sandbox) | ~$0.00026 | sub-second | $0 (+$30/mo free credits) | per-core billing (1 core = 2 vCPU) |

## Security gates — ALL FIVE CLOSED (2026-06-10)

The adversarial audit's five ship-blockers, and how each closed (tests pin every one):

1. **File tools clamped.** Outer wall: every model-supplied `path` is resolved the way pi
   resolves it (unicode spaces, `@`-strip, `~`, `file://`), validated lexically AND
   symlink-resolved against the workspace root, then REWRITTEN to the clamped absolute path
   before pi's execute runs — this is the only wall that constrains the rg/fd subprocesses
   grep/find spawn. Inner wall: guarded `operations` for edit/write/ls/grep. Proven inside a
   real AgentSession (customs shadow builtins by name; bash absent).
   `packages/runtime/src/session/tools/{fs-guard,clamped-fs}.ts`.
2. **Access-token-only.** `/sandbox/credential` no longer returns the refresh token; the
   runtime writes `refresh:""`; post-connect capture scrubs what pi's login wrote
   (`POST /auth/scrub-refresh`). For cloudrun workspaces the device-code connect runs IN the
   control plane (pi's own AuthStorage), so no refresh token ever touches an agent at all.
3. **Sandbox egress + identity locked.** Zero-IAM SA (the deploy script DIES if the SA ever
   holds a role — the metadata server is link-local and cannot be firewalled, so the mintable
   token must be worth nothing) + dedicated VPC whose only rule is deny-all egress
   (`--vpc-egress=all-traffic`): no exfil channel, no RFC1918 pivot, pip dead by design (deps
   bake into the image). Ingress: Cloud Run IAM (`run.invoker`, ID token in `Authorization`)
   + app token in `X-Sandbox-Token` — two gates, two headers (an app token in Authorization
   would be eaten by IAM; that bug is fixed).
4. **Hosting layer decided + built: per-turn Cloud Run.** The agent is a cheap stateless
   request (hydrate GCS prefix → run pi → sync → wipe), `concurrency=1`, per-instance microVM
   — the same no-co-residency property as the code sandbox, attached to the credentialed tier.
   No Kata, no per-agent pod, no PVC. `cloud/v2-plan.md` is retired.
5. **Budgets.** Per-workspace `run_code` limiter in the runtime (concurrent + per-minute) and
   per-workspace turn quota in the control plane (concurrent + per-hour), plus fleet-wide
   `--max-instances` caps. One tenant cannot starve the others.

Also closed: collision-safe artifact write-back (an artifact may only overwrite a file the
model DECLARED via `input_files`; other collisions save as `name (2).ext` and are reported)
and surfaced `droppedArtifacts`.

**Residual risk, stated honestly:** during a turn the agent process holds the user's short-TTL
access token in memory; within its own workspace a prompt-injected agent can still act as the
user (Composio-class risk inherent to autonomous agents). The guarantee is "User A's agent
cannot read User B's data — or even its own credentials' refresh token," not "the agent is
harmless to its own user."

## Follow-ups (genuinely optional now)

- **Per-session warm sandbox** (Gondolin-style) for `pip install`-then-use loops — a latency/
  capability optimization, not a security gate; deps are pre-baked for the canonical tasks.
- **In-container gVisor** (`runsc`) inside the code sandbox for a third kernel layer.
- **Control-plane HA**: the turn relay + connect state are in-memory (replicas: 1 today);
  moving them to a shared bus is the prerequisite for scaling the CP horizontally.
