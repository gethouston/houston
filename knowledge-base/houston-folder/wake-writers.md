# What a standing pod rewrites on boot or wake

A managed pod runs the local profile (`buildLocalHost`, `FsVfs`,
`LocalPaths`), so the on-disk shape is the desktop one. `start()` in
`packages/host/src/local/host.ts` runs these in order; the ones marked W are
the ones that can overwrite something a pool op landed while the pod slept.

| # | Step | Writes | Event | Note |
|---|---|---|---|---|
| W1 | `syncDaemon.hydrate()` | restores the whole `HOUSTON_HOME` tree (workspaces plus root-level objects) from the store, minus `credentials.json`, `claude-login/.credentials.json`, `db/`, `shared-mirror/` | none | Blocking and readiness-critical. Everything a pool op wrote before this point is picked up. For an op that lands after it: sync-back is manifest-diffed, so only files the pod itself modified are pushed; for those the one 412 retry overwrites the op's version, and op-created new keys are invisible to the pod until its next hydrate (D15) |
| - | `sharedMirror.wake()` | `<home>/shared-mirror/skills` | none | Outside the agent workspace; also `beforeTurn()` every turn, 15 s debounce |
| W5 | `remoteCustomSecrets.migrateLegacy()` | deletes `custom-integration-secrets.json` after uploading | none | Managed cloud, non-passive, every boot |
| W1b | `migrateAgentLayouts` | copies flat `.houston/<f>.json` into `<f>/<f>.json` and `memory/learnings.md` into `learnings.json` when the target is missing, originals left in place; deletes `.houston/prompts/{system,self-improvement}.md` unconditionally | none | Idempotent except the delete |
| W2 | `reseedAgentSchemas` | rewrites all five `.schema.json` when content differs from this build | none (runs before the watcher) | A build with a changed schema rewrites on every wake |
| W6 | `migrateChatHistory` | new conversation files and synthesized sessions from the legacy SQLite db | none | Additive, per-conversation existence check; no transcript enqueue (D9) |
| - | `docProjector.seed()` | Postgres docs, not files | n/a | Reads the five family files and PUTs them normalized; a missing file publishes `{}` or `[]`. This is the wake-time authority reset for asleep reads |
| W4 | `warmViewDocs` | self-GETs `providers`, `providers/usage`, `integrations/custom/definitions`, `skills` | n/a | The `providers` hit runs the serve sync, which rewrites `auth.json`, `auth-users/**`, `served-providers.json`. Stands down unless exactly one agent dir |
| - | `watcher.start()`, `syncDaemon.start()`, `scheduler.start()`, `usageSampler.start()` | the scheduler tick (30 s) inspects `running` runs; it rewrites `routine_runs.json` once a reply is found or the run timed out, and `activity.json` only for surfaced replies | `RoutineRunsChanged`, `ActivityChanged` | |
| W3 | eager runtime spawn, then `afterSpawn` | runtime module eval `mkdir`s `dataDir`, `dataDir/sessions`, `workspaceDir`, opens `runtime.log` for append. `syncSharedEndpoint` then re-seeds an org-hydrated `custom-endpoint.json` on every spawn, or wipes it when the org share is gone. A locally configured, non-org endpoint is left alone (`configured && !orgShared`) | none | The sharpest pool-op collision: a settings op writes `custom-endpoint.json`, the next wake re-seeds or clears it when the agent is org-shared |
| - | first user turn | `activity-attribution.ts` stamps `activity.json` when the send carries an acting identity, a matching activity exists and the contributor or mention set changed; `ensureProviderForTurn` re-runs the serve sync (`auth.json`) | `ActivityChanged` | |

## Also written without a user action on an awake pod

- `token-usage.json` after every turn.
- `runtime.log` continuously, and uploaded on every sync tick (D17).
- `routine_runs.json` and `activity.json` by `schedule/reconcile.ts` when a
  `running` run gets its reply or times out.
- `auth.json` / `auth-users/**` on every `GET providers`, `providers/usage`,
  `auth/status`, `settings/claim` and at every turn start (serve sync).

## The lock that no longer holds

`routes/doc-lock.ts` asserts that the host process is the only writer of an
agent's docs. A pool worker runs the same handlers against a hydrated copy,
so cross-process safety rests on the gateway claim plus `StoreFencedError`
and generation preconditions, not on this lock (D15, D23).
