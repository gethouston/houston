# Houston Cloud — Implementation Plan

> **Architecture update (2026-06-10).** The hosting layer evolved past §"one
> agent = one GKE pod": workspaces now carry a `runtime` flag. `cloudrun`
> workspaces (the default for new ones) run agents as PER-TURN Cloud Run
> requests over GCS-prefix workspaces — no standing pod, no PVC, idle = $0 —
> dispatched by the control plane behind the SAME `/agents/:id/*` surface
> (`packages/host/src/turn/*`, `packages/runtime/src/turn/*`).
> `gke` workspaces keep the pod path below until their PVC migrates
> (`cloud/scripts/07-migrate-pvc-to-gcs.sh`). The keyless org-key proxy was
> REMOVED: the one credential model is connect-once user subscriptions
> (OpenAI/Codex), served access-token-only. Code execution is the locked-down
> Cloud Run sandbox (`cloud/code-execution.md` — start there).

Multi-tenant cloud platform. Each customer **org** has **users** who chat with **agents**. Every agent runs **fully isolated** from every other agent, on its own machine, on **GKE Agent Sandbox**. The agent runtime is **pi** (`@earendil-works/pi-coding-agent`) wrapped by the Houston TS runtime (`packages/runtime`). A central **control plane** guards access, spawns agents, holds credentials, and tracks what's running.

> **This doc supersedes the two earlier design attempts** (`cloud-design/` and `engine-design/`, now deleted). Both were written for the old Rust `houston-engine` that shelled out to Claude/Codex CLIs. We have since committed to **pi**, which is in-process and has no CLI subprocesses — that pivot invalidated the load-bearing mechanisms of both old plans (see [What we drop](#what-we-drop-from-the-old-plans)). This is the single source of truth.

---

## 0. TL;DR

- **Houston lives in the cloud**, not as a desktop app. The pi runtime is already a headless HTTP/SSE server; we host N of them and put a web frontend in front.
- **Orgs / users / shared agents / per-agent permissions** all live in the **control plane**, which is 100% new. The runtime stays single-tenant and identity-free by design.
- **Isolation is enforced by the GKE sandbox, not by pi.** pi gives the agent an unrestricted shell. The wall is: one agent = one sandbox = one volume + default-deny networking + the control plane refusing out-of-scope routes.

---

## Build status (in-repo)

The control plane and supporting artifacts are **built and tested** here. What remains needs your live accounts (GKE / Supabase / provider keys) and is staged as runnable scripts, not faked as done.

| Area | State | Where |
|---|---|---|
| Control plane foundation — domain, `authorize()`, ports, in-memory store | ✅ built · tested | `packages/host/src/{domain,ports.ts,store/memory.ts}` |
| Control plane auth — Supabase JWT verifier (+ dev) | ✅ tested | `packages/host/src/auth/verify.ts` |
| Control plane RBAC store — Postgres + migration | ✅ built · integration-noted | `packages/host/src/store/pg.ts`, `cloud/migrations/0001_rbac.sql` |
|  Control plane GkeLauncher — GKE lifecycle + fake | ✅ built · GKE integration-noted | `packages/host/src/launcher/*` |
| Control plane routing + 1:1 SSE pass-through proxy | ✅ tested | `packages/host/src/proxy/route.ts` |
| Control plane keyless credential proxy + vault | ✅ tested | `packages/host/src/proxy/credentials.ts`, `src/credentials/vault.ts` |
| Control plane HTTP server + authz boundary + `main` | ✅ tested (John's scenario) | `packages/host/src/{server.ts,main.ts}` |
| Operator dashboard — pods-per-user + GCP spend (estimate + BigQuery actuals) | ✅ built · tested | `packages/host/src/admin/*`, `packages/web/src/admin/*`, `cloud/billing.md` |
| Runtime cloud-mode — keyless, `baseUrl`→proxy | ✅ tested | `packages/runtime/src/{config,ai/providers,auth/login}.ts` |
| Session-resume fix (sleep/wake hinge) | ✅ tested | `packages/runtime/src/session/chat.ts` |
| Agent container image | ✅ built · CI-build-noted | `packages/runtime/Dockerfile`, root `.dockerignore` |
| K8s / Agent-Sandbox manifests | ✅ validated | `cloud/k8s/*` |
| gcloud provisioning (P0/P1) | ✅ scripts · confirm-before-billing | `cloud/scripts/*` |
| **Frontend un-faking (web → control plane)** | ⏳ remaining in-repo work | `packages/web/src/engine-adapter/*` |
| Files download/preview (GCS workspace → browser) | ✅ built · tested | `packages/host/src/turn/files.ts` (`files/download`), web Files tab Preview/Download |
| "Send feedback" intake (web → Linear) | ✅ built · tested (set `CP_LINEAR_API_KEY`/`CP_LINEAR_TEAM_ID`) | `packages/host/src/feedback.ts`, `POST /feedback`, web shim `report_bug` |
| Shared turn-state bus (2+ CP replicas) | ✅ built · tested (Memory default; Redis via `CP_REDIS_URL` — run `09-redis.sh`, then bump replicas) | `packages/host/src/turn/{bus,bus-redis,relay,quota,connect}.ts` |
| Turn-quality evals (deck/xlsx/chart, nightly) | ✅ harness + CI workflow (needs `EVAL_*` secrets + eval user) | `cloud/evals/*`, `.github/workflows/evals.yml`, `CP_SERVICE_TOKENS` |
| Custom domain (app.gethouston.ai) | ⏳ script ready; needs DNS + Supabase allow-list | `cloud/scripts/08-custom-domain.sh` |
| Live provisioning · pen-test · load-test | ⏳ needs your accounts | run `cloud/scripts/*` |

Run the control plane locally (all fakes, one local runtime): `cd packages/host && CP_DEV=1 bun run dev`. Tests: `bun test` in `packages/host` and `packages/runtime` (91 passing).

---

## 1. The reframe: one runtime instance *is* one agent sandbox

The most important structural fact. The pi runtime is **single-workspace, single-credential, single-process by construction** (`packages/runtime/src/config.ts`: *"One houston-runtime instance = one workspace… Everything is single-user; there is no workspace management here."*).

**So we do not make the runtime multi-tenant. We deploy N of it** — one process per agent, each with its own `workspaceDir`, its own injected credential, its own volume. Every tenancy boundary (identity, authz, routing, network policy, credential scoping) lives **above** the runtime, in the control plane. Nothing tenant-aware goes *inside* the runtime; that would fight its whole shape and is unnecessary once you deploy N.

The plan's "Worker that drives pi" is **not new code** — it is the runtime's existing HTTP server (`packages/runtime/src/transport/server.ts`), already a "receive message → drive pi → stream answer over SSE" loop. Worker ≈ runtime.

---

## 2. The security model (the part that must be exactly right)

The guarantee we sell: *"John from Sales runs SalesAgent. Even if he tells it 'go read our salaries', it cannot — that data lives with HRAgent, on a different machine John's agent can't see or reach."*

That holds **only** because of three things working together. **pi is not the wall — the sandbox is.** pi runs `/bin/bash -c <anything>` with the runtime's full environment and nothing confining it to the workspace; its permission/extension system is disabled in Houston. Treat the agent as fully capable code inside its box. Therefore:

1. **One agent = one sandbox = one volume.** SalesAgent's box mounts only SalesAgent's disk. HR's files are not absent-by-permission; they **do not exist** in that box. `cat`-ing for salaries finds nothing. This is the primary wall.
2. **The control plane enforces RBAC before routing.** "John may talk to SalesAgent, not HRAgent" is checked on every request, above the runtime. The only path to any agent goes through the control plane, so the grant table is final.
3. **Default-deny networking.** The filesystem wall is worthless if SalesAgent can reach salary data *over the network* — a shared DB, an internal API, or HRAgent's own endpoint. So: sandboxes get outbound internet (tools need it) but **no path to each other, to internal infra, or to the cloud metadata endpoint** (`169.254.169.254`). **Rule: sensitive data exists only inside its own agent's volume / behind its own agent's tools.** No shared datastore that two differently-scoped agents can both reach.

Get those three right and the scenario works exactly as described.

---

## 3. Architecture

```
Browser (web frontend)
      │  HTTPS + SSE, one address
      ▼
   ┌───────────────┐   auth · RBAC · spawn/wake/sleep/kill · credential proxy · routing · audit
   │ CONTROL PLANE │   (stateless, replicated)
   └───────────────┘
      │  routes to the right agent's sandbox; proxies the long-lived event stream
      ▼
 GKE Agent Sandbox  ──────────────  one per agent
   ┌──────────────────────────┐
   │  Worker = pi runtime       │   receives message → drives pi → streams answer
   │  pi (SDK, in-process)      │   thinks (AI call via control plane proxy) + runs tools, sealed in the box
   │  Volume (PVC)              │   this agent's files only
   └──────────────────────────┘
```

GKE Agent Sandbox provides the managed isolation (gVisor → Kata), default-deny networking, per-agent persistent storage, and stable per-agent identity. That managed layer is the main reason to use Agent Sandbox over hand-assembling Kata + Knative + Cilium ourselves.

**One message, end to end:** user types → control plane authenticates + checks the grant → control plane ensures the agent's sandbox is awake (GKE) → control plane forwards the message to the Worker and streams the reply back → pi runs sealed in the box → answer flows pi → Worker → control plane → browser.

---

## 4. Components

### Frontend — `packages/web` (exists, needs work)
Already the full Houston UI as a standalone web app. Two changes:
- **Repoint** its single runtime base URL at the control plane (one-line: `window.__HOUSTON_ENGINE__`).
- **Un-fake the domains.** Today the "agents / workspaces / routines / skills" surfaces are faked client-side in `packages/web/src/engine-adapter/**` (localStorage / empty stubs) and `agentPath` is discarded before the runtime call. These must become real, control-plane-backed resources. Chat itself already works against a remote runtime; these other domains are theater and are the sleeper work item.

### Control plane (100% new)
Stateless, replicated, the only thing the frontend talks to. Responsibilities:
- **Auth** — Supabase (already in the repo: Google SSO, `profiles`). Verify the user's JWT.
- **RBAC** — org / user / agent / grant (§6). Enforced on every request.
- **Lifecycle** — create / wake / sleep / kill an agent's sandbox via the GKE API.
- **Credential proxy** — agents are keyless; the control plane adds the org's API key to outbound AI calls (§5).
- **Routing** — forward each message to the right sandbox and **proxy the long-lived SSE stream** as a strict 1:1 pass-through (see the SSE note below).
- **Observability** — audit log, per-org metering/billing, live sandbox counts.

Language: TS/Node is the natural choice now that the runtime and frontend are TS (the old Rust-control-plane idea was tied to the retired Rust engine). ~a few thousand lines: routes, auth glue, GKE client, a streaming reverse proxy.

**SSE is the fragile seam.** The client streams events over a long-lived `fetch`+`getReader()` GET with header auth and no resume (`packages/runtime-client/src/client.ts`). The control plane must be a **1:1 streaming reverse proxy**: forward the `Authorization` header on the stream, do **zero** buffering/gzip/transform, set no idle timeout shorter than a turn, and pass heartbeat comment frames verbatim. Do **not** try to multiplex many runtimes onto one socket — that forces you to reimplement the runtime's per-conversation event bus.

### Agent sandbox — pi runtime, one per agent
- **Image:** containerize `packages/runtime` (Bun/Node). This is **new** — the old `always-on/Dockerfile` (now deleted) built the *Rust* engine and never applied here.
- One sandbox per agent, its own `workspaceDir` on its own PVC, **keyless** (creds via the control plane proxy).
- Push to Artifact Registry.

---

## 5. Credentials — keyless proxy from day one

Today the runtime is **subscription-OAuth-only** (`packages/runtime/src/auth/providers.ts` hardcodes `anthropic` Claude-Max + `openai-codex`; one `auth.json` per process). That model **cannot ship to cloud**:
- Reselling one person's Claude Max / ChatGPT Plus seat to N paying orgs **violates consumer-subscription ToS** and has no per-tenant accounting.
- pi-ai **does** support commercial API keys + a custom `baseUrl` (`setRuntimeApiKey`, `AuthStorage.inMemory()`, per-model `baseUrl`). "OAuth-only" is a Houston wrapper choice, not a pi limit.

**Decision: the keyless LLM proxy is v1, not v2.** Rationale: the agent's bash can trivially read its own environment (`env | grep -i key`), so injecting an org's real API key into the sandbox env hands the key to any prompt-injection. Instead:
- Per-org commercial API keys live in **Secret Manager**, known only to the control plane.
- Each sandbox points pi-ai's `baseUrl` at the control plane proxy and sends **no real key**. The control plane attaches the org's key, meters usage, and can cut a tenant off instantly.

Runtime work: rewrite `auth/storage.ts` and `providers.ts`; delete most of `login.ts` (the OAuth paste-code flow is dead weight in cloud).

> **De-risked ✅.** A working keyless proxy and a proof that pi-ai runs against an arbitrary `baseUrl` carrying only a control-plane-issued token (no real key in the sandbox) live in `packages/runtime/spike/keyless-proxy.ts` + `spike/keyless-proxy.test.ts`. The proxy injects the real key on the way upstream; the sandbox token never reaches the provider. Graduates into the control plane.

---

## 6. RBAC data model (in the control plane)

| Entity | Meaning |
|---|---|
| **Org** | Top-level tenant. |
| **User** | Belongs to an org. An identity (Supabase), not a sandbox. |
| **Agent** | Belongs to an org. Maps to exactly one sandbox + one volume. |
| **Grant** | Which users may use which agents (Sales team → Sales agents; HR person → HR agent). |

Enforced by the control plane on every request. Permissions control **visibility/access**, not isolation — isolation is the sandbox's job (§2). Identity substrate = Supabase (already shipped). Reconcile the vocabulary: pick **org** as the tenant word and retire the inconsistent "workspace"/"team"/"company" usages from the old docs and `teams/`.

---

## 7. Sleep / wake (cost control) — gated on session-resume

Idle agents should cost ~$0 (storage only). After N minutes idle: persist the workspace to the PVC and delete the sandbox (compute → 0). On the next message: restore and spawn a fresh sandbox. Keep a short **warm window** so the common case is instant.

**Status — de-risked ✅, one gate remains.** The bug was real: `chat.ts` rebuilt sessions with `SessionManager.create()`, which mints a **brand-new empty pi session** on every fresh process, so a woken sandbox silently lost all prior turns. **Fixed:** `chat.ts:getConversation` now uses `SessionManager.continueRecent()`, which reopens the conversation's most recent on-disk session; `createAgentSession` then rehydrates `agent.state.messages` from it. Proven by `packages/runtime/src/session/resume.test.ts` (a fresh process restores the conversation; the old path loses it). **Remaining gate:** one round-trip *fidelity* test across a real Claude/Codex turn (tool-result + thinking-block replay) — needs a live provider credential, so run it once during P3 with a real key.

---

## 8. Tech decisions

| Concern | v1 | v2 |
|---|---|---|
| Cluster | GKE Autopilot | GKE Autopilot or Standard |
| Per-agent isolation | gVisor (Agent Sandbox default) | Kata Containers (micro-VM) — **verify Agent Sandbox supports the flip** (it may be a different runtime, not a toggle) |
| Per-agent storage | PVC on Persistent Disk | same |
| Cold storage (idle) | Cloud Storage (GCS) | same |
| Networking | Default-deny + allow outbound internet; block internal + metadata; Workload Identity | same |
| AI credentials | **Keyless proxy through the control plane** (org keys in Secret Manager) | same, + per-tenant metering/cutoff |
| Agent runtime | pi SDK inside the Worker (the TS runtime) | same |

**Hard requirements (verify before depending on any):** GKE **1.35.2-gke.1269000+**, **N2** machine types, Agent Sandbox is GA but some sub-features (e.g. Pod snapshots) may be preview.

---

## 9. Phased build

Ordering puts the two unproven unknowns (session-resume, keyless proxy) *before* the architecture hardens around them.

- **P0 — Project setup.** GCP project, billing, IAM, enable APIs (GKE, Artifact Registry, Secret Manager, Cloud Storage). Pick a region.
- **P1 — Cluster + isolation foundation.** GKE Autopilot on a supported version; enable Agent Sandbox; verify a hello-world box with `runtimeClassName: gvisor` + default-deny.
- **P2 — Agent image.** Containerize `packages/runtime` (Bun/Node). The Worker = the runtime server. Push to Artifact Registry. (Net-new; the Rust `always-on/Dockerfile` does not apply.)
- **P3 — De-risk the two unknowns. ✅ (mechanisms proven; one live-credential gate left).** (a) pi **session-resume** — fixed in `src/session/chat.ts` + proven by `src/session/resume.test.ts`; remaining: one fidelity test across a real provider turn. (b) **keyless proxy** — built at `spike/keyless-proxy.ts` + proven by `spike/keyless-proxy.test.ts` (pi-ai runs keyless against a chosen `baseUrl`; the proxy injects the real key).
- **P4 — Control plane v0.** Auth + route to one agent + **SSE pass-through**. Single tenant, single agent, end to end.
- **P5 — RBAC.** Org / user / agent / grant schema + enforcement on every request.
- **P6 — Per-agent storage.** PVC per agent, mounted only into that sandbox. + GCS for cold/large + a backup/restore drill. Verify nothing shared is mounted.
- **P7 — Networking lockdown.** default-deny, egress allowlist, block internal + metadata, Workload Identity. Pen-test agent↔agent reachability.
- **P8 — Credentials.** Secret Manager per org + the proxy carrying real keys + metering.
- **P9 — Sleep/wake.** Idle detect → snapshot → delete; restore on next message; warm window. (Depends on P3a.)
- **P10 — Observability.** Per-org audit + billing + live counts + dashboard; Cloud Logging/Monitoring; Sentry. *(Dashboard ✅: operator `/admin` view — pods-per-user + live cost estimate + BigQuery billed actuals. `packages/host/src/admin/*` + `packages/web/src/admin/*`; setup in `cloud/billing.md`. Audit log + Cloud Logging/Monitoring + Sentry remain.)*
- **P11 — Frontend.** Un-fake the agent/workspace/routine/skill domains against the control plane; ship the web app.
- **P12 — v2 hardening.** Kata (if the flip is real), load-test concurrency, tune warm windows + node sizing.

---

## What we drop from the old plans

Recorded so we don't relitigate:
- **The Rust `houston-engine` + bundled CLIs in the pod.** Replaced by pi in-process. The old roadmap's "containerize the engine" milestone and `always-on/Dockerfile` do not carry over.
- **Per-agent Linux user / `HOME`-override / setuid walls** (old `engine-design/07`). These assumed a CLI subprocess to confine. pi has none — the whole process is the agent, so "one process per sandbox" replaces the entire three-walls design.
- **Kata-from-day-one.** We ship gVisor-first (managed, lower risk) and treat Kata as v2 hardening. This inverts the old plan's most-argued decision; it is acceptable **only while the hostile-community-agent marketplace is deferred** (see open questions).
- **Knative for scale-to-zero.** Replaced by Agent Sandbox lifecycle + control-plane-driven sleep/wake. Note this is a trade: we lose a battle-tested primitive and own the wake logic.
- **The doorman-only control plane** that "never talks to any LLM." Our control plane deliberately **does** sit in the inference path (the keyless proxy). Conscious reversal, for credential safety + metering.

---

## Open questions / risks (priority order)

1. **Agent-marketplace launch date.** It decides gVisor-first vs. Kata-first. Near-term hostile community code → we need the hardware wall sooner. Deferred → gVisor-first is fine. **Pin this date before hardening the architecture.**
2. **Is the gVisor → Kata "flip" real on Agent Sandbox?** It may not be a toggle but a different runtime that drops us out of the managed path. Verify before promising v2.
3. **Isolation unit: per-agent or per-org?** Per-agent = strongest, but N× the cold-start / PVC / scale-to-zero cost. Must match the one-key-per-org billing unit.
4. **Credentials per org or per user?** Default: per org (matches Secret Manager + metering).
5. **Durable turns before public ingress.** The pi runtime has no durable turn replay (the event snapshot is in-process memory); a sandbox killed mid-turn loses the turn. Decide whether that's acceptable for v1 or needs a durable store first.
6. **Session-resume — mechanism proven ✅, fidelity gate open.** The hinge of the cost story (P9) now works at the API level (`resume.test.ts`). The one open item: confirm full replay fidelity (tool results, thinking blocks) across a real provider turn with a live key.

---

## Out of scope (for now)

- **Houston Cloud as a PaaS for third-party devs** (the original placeholder framing: devs push their own Houston-Engine product, we host/bill it). Separate product; this plan is Houston-the-company running agents for customer orgs.
- Multi-region / data residency, on-prem / BYO-Kubernetes, per-tenant dedicated node pools, agent marketplace/publishing. Revisit when a customer pays for one.
