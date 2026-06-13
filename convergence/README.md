# Single-engine convergence — program plan

One engine for local (desktop) + cloud (multi-tenant SaaS). Zero drift. Rust `engine/` retired at the end.

**Architecture: one host, not two addons.** Not "shared library + local supervisor + cloud control plane" — that still lets handlers drift. Instead: ONE deployment-agnostic server (the **Houston host**, evolved from `packages/control-plane`) with ONE router, ONE `authorize()` seam, ONE domain layer — and two **adapter profiles** wired in `main()`:

| Port | Local adapter | Cloud adapter |
|---|---|---|
| RuntimeLauncher | subprocess spawn/sleep per agent (server mode) | CloudRun per-turn / GKE pods (exists) |
| Vfs (agent files) | real FS | GCS prefix (exists: `turn/files.ts`) |
| Identity | single-user, always-owner, offline | Supabase JWT (exists) |
| Events | FS watcher → HoustonEvent | post-turn-sync synthetic events |
| Store (tenancy index) | FS scan of `~/.houston/workspaces` | Postgres (exists) |
| Bus | in-process | Redis (exists) |
| Scheduler | in-process cron loop | leader-elected via bus lock |
| Credentials | host-owned connect-once, `/sandbox/credential` | same code (exists) |

Drift prevention: domain logic exists once in the host; adapters pass shared **contract-test suites**; one Playwright E2E suite runs against both boot profiles; `/v1/capabilities` replaces "am I web/desktop" branches.

**Base runtime** (`packages/runtime`) stays single-workspace/single-credential/tenancy-free forever. Gains only: skills loading (pi-native), context files, conversation rename/delete, title summarize.

**Protocol v3** = v2 conversation core verbatim, nested under `/v1/agents/:id/conversations/*`, + domain families (workspaces, agents, files, skills, routines, activities, config, providers, preferences, portable, store) + global `/v1/events` channel carrying the existing HoustonEvent vocabulary (keeps `use-agent-invalidation.ts`). Types in `packages/protocol`. Frontend talks ONLY to the host, every deployment. `@houston-ai/engine-client` keeps its function surface, transport rewritten. `packages/web/src/engine-adapter/` (the v1-faking synthesizer) gets deleted.

## Phases

- **P0 — Spikes + decisions.** ✅ done — see `phase0-findings.md`.
- **P1 — Protocol v3 + runtime additions.** ✅ done (#21, #22). `packages/protocol`; runtime: rename/delete, skills dir, context files, summarize.
- **P2 — control-plane → host.** ✅ ports done: RuntimeChannel (ProxyChannel/TurnChannel — the server never branches on hosting model), RuntimeLauncher (was SandboxManager), Vfs (was ObjectFiles; Memory/Gcs/**Fs** adapters + shared contract suite), SingleUserVerifier, /v1/version + /v1/capabilities live on the cloud host. The `packages/control-plane` → `packages/host` DIRECTORY rename is deliberately deferred to the start of P4 (one commit together with cloud deploy scripts/k8s refs, so live deploys never point at a half-renamed tree).
- **P3 — Domain in TS.** 🟡 in progress. Done: `packages/domain` (TextStore port — the host Vfs satisfies it structurally; `.houston` layout + schema seeding from `ui/agent-schemas`; activities/routines/runs/config/learnings normalize+CRUD as pure fns, junk → diagnostics, parse errors throw with the key named) + host routes `/agents/:id/{activities,routines,routine_runs,config,learnings}` over `deps.vfs`, schemas seeded on agent create — live on cloud first. Also done: skills family — SKILL.md frontmatter parse (YAML 1.1 `featured: yes` normalized), list/read/create/edit/delete at `/agents/:id/skills[/:slug]`; created skills reach the agent next session with no extra plumbing (pi loads the same dir).

Also done: global `/v1/events` SSE channel — `EventHub` over the publish/subscribe subset of the TurnBus (Redis multi-replica in cloud, in-process otherwise; one bus now backs both turns and events). Per-user channel (`events:<userId>`) so cloud tenants never cross-leak; the host emits `ActivityChanged`/`RoutinesChanged`/`ConfigChanged`/`LearningsChanged`/`SkillsChanged`/`AgentsChanged` after every successful mutation, carrying the same vocabulary the Rust firehose used (so `use-agent-invalidation.ts` survives the P6 engine-client rewrite). Locally (P4) the FS watcher feeds the same hub.

Remaining: scheduler (cron eval + routine firing as synthetic turns), workspaces family, portable agents, migration-chain port.
- **P4 — Local profile.** ProcessLauncher, FS watcher adapter, single-user identity, local connect-once credentials, host-as-sidecar packaging (ONE compiled artifact, host+runtime modes).
- **P5 — Desktop cutover + migration.** Tauri spawns host sidecar (same supervisor contract). Migration: idempotent, versioned, copy-never-move. Reconnect-onboarding card. Beta gate: parity checklist + migration verified on real data + signed Windows builds. Downgrade always works.
- **P6 — Consumer sweep + deletion.** Web local-mode, mobile/relay, smartbooks, always-on → v3. Delete engine-adapter, `engine/`, v1, CLI bundling. Update all KBs.

Critical path: P0 → P1 → P3 → P5. P1∥P2, P3∥P4.

## Migration (existing local users)

| Data | Action |
|---|---|
| Workspace/agent tree + `.houston/*` JSON | unchanged (schemas already from `ui/agent-schemas`) |
| `config.json` model IDs | CLI IDs → pi IDs, mapping table, never auto-upgrade |
| History (`chat_feed` + `.houston/sessions`) | transcripts → v3 conversations (always visible) + synthesized pi session from plain user/assistant pairs (agent remembers; tool/thinking fidelity impossible — say so). Mechanism proven: `packages/runtime/src/session/resume.test.ts` |
| Credentials | NOT migratable (different OAuth clients). One-time "Reconnect your AI" card |
| Skills | none needed — Houston SKILL.md = pi native format |
| CLAUDE.md | none needed — pi discovers CLAUDE.md natively |
| Preferences / tunnel / engine tokens | prefs → host store; tunnel/tokens regenerate, mobile re-pairs |

## Standing decisions

- Gemini: **dropped at cutover** (pi has google provider but API-key-only; no Google OAuth; non-technical users don't paste keys). Revisit if pi grows Google OAuth.
- Composio: **cut** (no MCP in pi 0.78.1; custom tools are the only extension point). Revisit on demand data.
- Anthropic in cloud: stays off (ToS). Local keeps Anthropic + Codex OAuth. Config asymmetry, not code fork.
- Open source: Option B (open local stack: runtime + domain + host + local adapters + app + ui; cloud adapter profile closed). Apache-2.0 + DCO. Execute AFTER P6, never during. Closed repo owns no domain types, runs open contract tests, stays adapters+infra only.
