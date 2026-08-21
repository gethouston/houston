# The agent workspace, audited

Audit date: 2026-08-21 (houston `44e71cd04`; gateway at the same date).
One row per path, current truth only; the target design is elsewhere.

Files:

| File | Content |
|---|---|
| [`paths.md`](paths.md) | The table: one row per path, the seven columns below |
| [`runtime-paths.md`](runtime-paths.md) | Same columns for `.houston/runtime/**` and everything found beyond the asked list |
| [`divergences.md`](divergences.md) | Every place two sources can disagree, and what reconciles it (or nothing) |
| [`wake-writers.md`](wake-writers.md) | What a standing pod rewrites on boot or wake, in order |

## Columns

- **Source of truth**: `store` = the object under the agent's object prefix;
  `doc` = the Postgres `agent_docs` row; `transcript` = the Postgres
  conversation tables; `credstore` = the gateway credential tables.
- **Worker reads from**: what a pool worker hydrates before a turn (T) or an
  op (O). Hydrate is always a full-prefix download minus an exclude list.
- **Worker writes to**: what the sync-back `include` predicate lets land.
  Anything else the worker wrote is counted `outOfScope` and dropped.
- **Projected doc**: the `agent_docs` family (or view) re-published from the
  file, and by whom.
- **Served asleep from**: what answers the app when `replicas=0`. `wakes` =
  the gateway proxies to the pod, which wakes it.
- **Claim**: `agent-ops` (one agent-wide key) or the conversation id.

Op kinds (`packages/runtime/src/turn/parse-op-request.ts`, gateway
`classifyPoolOp`): `route` (agent-data families, agentfile, skills, files,
attachments, skills-manifest), `title`, `conversation` (rename, delete),
`settings` (put, claim), `credential` (api-key). Agents whose workspace or
agent directory name starts with `.` are rejected by the claim scope and can
never take a pool op.

## Layout primitives (engine)

A pool worker hydrates the agent's whole object prefix into a throwaway root
and resolves the layout (`packages/runtime/src/turn/turn-layout.ts`):

| layout | `workspaceRel` | `dataRel` |
|---|---|---|
| `standing` (the only live one) | `workspaces/<Ws>/<Agent>` | `<workspaceRel>/.houston/runtime` |
| `cloudrun` (retired per-turn) | `workspace` | `data` |

The object prefix is the pod's whole `HOUSTON_HOME`, not just the agent dir:
the standing pod's sync daemon roots at `dirname(workspacesRoot)`
(`packages/host/src/local/host.ts`, `store-sync/daemon.ts`). Root-level
objects (`custom-integrations.json`, `agents/`, `claude-login/projects/**`)
ride along. Symlinks are skipped by sync-back, so a symlinked `AGENTS.md` or
`GEMINI.md` never reaches the store.

### Exclude sets (`packages/runtime-client/src/object-sync/hydrate.ts` `excluded()`)

Unconditional, every caller: `*.tmp`, any `…/.houston/runtime/auth.json`,
any path containing an `auth-users` segment.

| Caller | Extra excludes | Where |
|---|---|---|
| claimed turn, title op | `DEFAULT_EXCLUDES` = `data/auth.json` only | `turn/execute-turn.ts`, `turn/turn-filesystem.ts`, `turn/execute-op.ts` |
| route op | `workspaces/*/*/.houston/runtime/` | `turn/execute-op.ts` `ROUTE_OP_EXCLUDES` |
| settings / credential op | `…/.houston/runtime/conversations/`, `…/sessions/`, `workspaces/*/*/files/`, `workspaces/*/*/uploads/` | `turn/execute-op.ts` `SETTINGS_OP_EXCLUDES` |
| conversation op | none beyond unconditional | `turn/execute-op.ts` |
| standing pod (hydrate and sync) | `credentials.json`, `claude-login/.credentials.json`, `db/`, `shared-mirror/` | `host/src/store-sync/daemon-policy.ts` |

Caps: claimed turn 2 GiB (`turn-filesystem.ts`), standing pod 9 GiB
(`daemon-policy.ts`), per object 256 MiB on the store side. Over the hydrate
cap is `TurnSetupError("hydrate_over_cap")`.

### Write scopes (sync-back `include`)

| Writer | May land |
|---|---|
| claimed turn | its own `conversations/<cid>.json`, its `sessions/<cid>/**`, `.houston/activity/activity.json`, `.houston/routine_runs/routine_runs.json` (`turn-filesystem.ts` `claimedTurnIncludes`) |
| route op | everything under `<workspaceRel>/` except `.houston/runtime/` (`turn/op-apply.ts` `agentRouteScope`) |
| conversation op | one `conversations/<cid>.json` plus `sessions/<cid>/**` (`op-apply.ts` `conversationScope`) |
| settings op | exactly `settings.json` and `custom-endpoint.json` (`turn/op-settings.ts` `settingsOpFiles`) |
| credential op, title op | nothing |
| standing pod | everything not excluded |

Conflict policy (`object-sync/sync-back.ts`, `sync-back-conflicts.ts`):
unchanged hash skips. A 412 generation conflict is retried once at the
refreshed generation, which overwrites the competing write (last writer
wins); only a second conflict is recorded and the pass continues. 413
over-size is recorded and not retried until the file changes. 409 fenced
aborts the whole pass. Ops hold deletes when anything was skipped or
conflicted. Generation preconditions detect concurrent writes; they do not
protect against them.

## Gateway side (private repo, named by function)

Every `/agents/{slug}/<rest>` call runs a fixed interceptor chain in the
agents handler `dispatch()`: transcript read, view doc, `auth/status`,
asleep credential ops, agentfile family read, pool op (`classifyPoolOp` /
`maybePoolOp`), connect, turnlog tail, pool send, pool cancel, run-now, then
the proxy. Three things wake a pod: the proxy's connect-failure hook (logs
`agent dispatch could not connect; ensuring awake` with `method` and
`rest`, so grouping it is the inventory of what still proxies), the
dispatch self-heal when the registry has no engine agent id, and agent
rename. Only the first emits the inventory line.

Transcript authority is per agent (`file` | `shadow` | `database`), mirrored
per conversation row. An agent reads as `database` only when every
conversation row is; any `shadow` row reads `shadow`; otherwise (including
zero rows) `file`. Family reads (`config`, `activities`, `routines`,
`routine_runs`, `learnings`) and agentfile family reads require `database`.
View docs (`providers`, `provider_usage`, `custom_definitions`, `skills`)
do not check authority, only that the agent is asleep.

Three independent gates, all default off: the transcripts gate (family,
view, agentfile and `auth/status` interceptors), the turnlog gate (asleep
SSE tail), and the pool gates (ops, sends, run-now; several flags must all
be on). With all three off, every read and write for a sleeping agent
proxies and wakes the pod, except `credential/capture`, `credential/forget`
and `auth/{provider}/logout`, which answer from the credential store with
no flag.
