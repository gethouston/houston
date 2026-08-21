# Paths: the table

Columns are defined in [README.md](README.md). T = claimed pool turn,
O = pool op (kind in parentheses), P = standing pod. "Flag" links to the
numbered entry in [divergences.md](divergences.md).

## Typed families (`.houston/<family>/<family>.json`)

| Path | Source of truth | Worker reads from | Worker writes to | Projected doc | Served asleep from | Claim | Flags |
|---|---|---|---|---|---|---|---|
| `.houston/config/config.json` | store (doc is a projection) | T, O: hydrate | T: never (out of scope). O(route): store | `config`. O(route) on `ConfigChanged`; P: `DocShadowProjector` on watcher event and boot seed | `GET config` and `GET agentfile/.houston/config/config.json`: doc (needs authority `database`); writes: O(route) | agent-ops | D1 D4 D5 D19 |
| `.houston/activity/activity.json` | store | T, O: hydrate | T: store (the one family a turn may write, via `settleRoutineTurn`). O(route): store | `activity`. T: `publishTurnActivityDoc` only when the file was actually uploaded; O(route) on `ActivityChanged`; P: projector | `GET activities`: doc; writes: O(route) | agent-ops; also inside a plain conversation claim (gateway `claimAllowsAgentDocKey`) | D4 D7 D15 D20 |
| `.houston/routines/routines.json` | store | T, O: hydrate. T reads it as the routine prompt authority (`turn-routine.ts`) | T: never (`save_routine` is off in turn mode). O(route): store | `routines`. O(route) on `RoutinesChanged`; P: projector. Never by a turn | `GET routines`: doc; run-now and control-plane routine fires read the doc with no authority check; writes: O(route) | agent-ops | D12 D11 |
| `.houston/routine_runs/routine_runs.json` | store | T, O: hydrate | T: store (running row before, terminal row after the turn). O(route): store | `routine_runs`. T: `publishTurnRunsDoc` (routine turns, only if uploaded); O(route); P: projector and `schedule/reconcile.ts` every 30 s | `GET routine_runs`: doc; writes: O(route) | agent-ops; also inside a conversation claim | D4 D7 D15 |
| `.houston/learnings/learnings.json` | store | T, O: hydrate | T: never (`save_learning` off). O(route): store | `learnings`. O(route) on `LearningsChanged`; P: projector | `GET learnings`: doc; writes: O(route) | agent-ops | D1 D4 |
| `.houston/<family>/<family>.schema.json` (x5) | the app build (`schemaDoc`), not user data | T, O: hydrate | T: never. O(route): in scope but no handler writes it | none | via `GET agentfile/...`: O(route) read | agent-ops | W2 |

Side projections inside the pod-store object PUT of `routines.json`: the
waker schedule snapshot and the trigger desired-set. Both best-effort,
skipped above 4 MiB or on parse error (D11).

## Skills and manifest

| Path | Source of truth | Worker reads from | Worker writes to | Projected doc | Served asleep from | Claim | Flags |
|---|---|---|---|---|---|---|---|
| `.agents/skills/<slug>/SKILL.md` | store | T, O(route): hydrate | T: never (`skillDirectory` off). O(route): store (create/edit/delete, community and repo install) | view `skills` (a captured `GET skills` answer, no JSON file). O(route) re-captures on `SkillsChanged`; P: boot warm and event refresh | `GET skills`: view doc (asleep only, no authority check). `skills/search`, `popular`, `preview`, `list`: wake. Writes: O(route) | agent-ops | D3 |
| `.houston/skills-manifest/skills-manifest.json` | store | T, O(route): hydrate. Runtime reads it at session build | T: never. O(route): store | none; its PUT emits `SkillsChanged` which re-captures the `skills` view | `GET` and `PUT skills-manifest`: O(route) (GET runs the handler on a worker) | agent-ops | D3 |
| `<shared>/skills/**` (org shared, ADR 0003) | separate store prefix `<org>/shared` | nothing: a pool worker has no shared mirror; shared skills reach a session only via `HOUSTON_SHARED_SKILLS_DIR`, which the host sets per agent at spawn | nothing | none | `/v1/workspaces/:org/shared-skills`: served by the gateway from the shared prefix | none (shared PUT is not lease-fenced) | D16 |

## Context files and user files

| Path | Source of truth | Worker reads from | Worker writes to | Projected doc | Served asleep from | Claim | Flags |
|---|---|---|---|---|---|---|---|
| `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `WORKSPACE.md`, `USER.md` | store | T, O(route): hydrate; T loads via `agentsFilesOverride` | T: never, even when the model edits it. O(route): store via `PUT agentfile/<path>` | none (`ContextChanged` has no family) | `GET agentfile/<rel>`: O(route) read; `PUT`: O(route) | agent-ops | D1 |
| `GROUP.md` | derived from the `sidebar_layout` preference; file is a mirror | T, O: hydrate | T: never. O: not written by any op; the gateway writes it straight into an awake pod via `PUT agentfile/GROUP.md` and skips sleeping pods | none | re-driven on the next wake and at provisioning | none | D14 |
| `uploads/<name>` (composer attachments) | store | T, O(route): hydrate. O(settings/credential): excluded | T: never. O(route): store (`POST attachments`) | none | `POST attachments`: O(route); listing via `files/*` | agent-ops | D1 |
| user files (everything else under the agent root) | store | T, O(route): hydrate. O(settings/credential): `files/` and `uploads/` excluded | T: never. Every file the model writes in a pool turn is dropped at sync-back. O(route): store (`files/*` import, move, rename, folder, delete) | none | every `files/*` shape incl. listing and download: O(route) read on a worker; binary rides base64, 100 MiB reply cap | agent-ops | D1 D13 D17 |
| `.houston/store-publication/store-publication.json` | store, machine-local by design (not a family, never exported) | T, O(route): hydrate | T: never. O: no op route (`portable/*` is not classified) | none | `portable/store-publication` GET/POST/DELETE: wake | none | - |
| `.houston/migration/imported.json` | store | hydrate | O: no op route (`migration/*` not classified) | none | wake | none | - |
| `.houston/agent.json`, `.houston/sessions/**`, `.houston/integrations.json`, `.houston/memory/`, `.houston/prompts/`, flat `.houston/<f>.json` | legacy (Rust era, pre-v0.4) | hydrate | O(route) scope admits them but nothing writes | none | n/a | - | W1 |

`.houston/runtime/**` and the root-level objects are in
[runtime-paths.md](runtime-paths.md).
