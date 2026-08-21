# What a standing pod rewrites on boot or wake

A managed pod runs the local profile (`buildLocalHost`, `FsVfs`,
`LocalPaths`), so the on-disk shape is the desktop one. `start()` in
`packages/host/src/local/host.ts` runs these in order; the ones marked W are
the ones that can overwrite something a pool op landed while the pod slept.

| # | Step | Writes | Event | Note |
|---|---|---|---|---|
| W1 | `syncDaemon.hydrate()` | restores the whole `workspaces/` tree from the store, minus `credentials.json`, `claude-login/.credentials.json`, `db/`, `shared-mirror/` | none | Blocking and readiness-critical. Everything a pool op wrote is picked up here; the daemon's first sync-back afterwards is manifest-diffed, so a pod that hydrated at T0 pushes its pre-op tree over anything landed in the gap (D15) |
| - | `sharedMirror.wake()` | `<home>/shared-mirror/skills` | none | Outside the agent workspace; also `beforeTurn()` every turn, 15 s debounce |
| W5 | `remoteCustomSecrets.migrateLegacy()` | deletes `custom-integration-secrets.json` after uploading | none | Managed cloud, non-passive, every boot |
| W1b | `migrateAgentLayouts` | moves flat `.houston/<f>.json` into `<f>/<f>.json`, `memory/learnings.md` into `learnings.json`; deletes `.houston/prompts/{system,self-improvement}.md` unconditionally | none | Idempotent except the delete |
| W2 | `reseedAgentSchemas` | rewrites all five `.schema.json` when content differs from this build | none (runs before the watcher) | A build with a changed schema rewrites on every wake |
| W6 | `migrateChatHistory` | new conversation files and synthesized sessions from the legacy SQLite db | none | Additive, per-conversation existence check; no transcript enqueue (D9) |
| - | `docProjector.seed()` | Postgres docs, not files | n/a | Reads the five family files and PUTs them normalized; a missing file publishes `{}` or `[]`. This is the wake-time authority reset for asleep reads |
| W4 | `warmViewDocs` | self-GETs `providers`, `providers/usage`, `integrations/custom/definitions`, `skills` | n/a | The `providers` hit runs the serve sync, which rewrites `auth.json`, `auth-users/**`, `served-providers.json`. Stands down unless exactly one agent dir |
| - | `watcher.start()`, `syncDaemon.start()`, `scheduler.start()`, `usageSampler.start()` | scheduler first tick (30 s) rewrites `routine_runs.json` and `activity.json` for any `running` run | `RoutineRunsChanged`, `ActivityChanged` | |
| W3 | eager runtime spawn, then `afterSpawn` | runtime module eval `mkdir`s `dataDir`, `dataDir/sessions`, `workspaceDir`, opens `runtime.log` for append. `syncSharedEndpoint` then re-seeds an org-hydrated `custom-endpoint.json` on every spawn, or wipes it when the org share is gone. A locally configured, non-org endpoint is left alone (`configured && !orgShared`) | none | The sharpest pool-op collision: a settings op writes `custom-endpoint.json`, the next wake re-seeds or clears it when the agent is org-shared |
| - | first user turn | `activity-attribution.ts` stamps the board on every gateway-fronted turn; `ensureProviderForTurn` re-runs the serve sync (`auth.json`) | `ActivityChanged` | |

## Also written without a user action on an awake pod

- `token-usage.json` after every turn.
- `runtime.log` continuously, and uploaded on every sync tick (D17).
- `routine_runs.json` and `activity.json` by `schedule/reconcile.ts` every
  30 s while a run is `running`.
- `auth.json` / `auth-users/**` on every `GET providers`, `providers/usage`,
  `auth/status`, `settings/claim` and at every turn start (serve sync).

## The lock that no longer holds

`routes/doc-lock.ts` asserts that the host process is the only writer of an
agent's docs. A pool worker runs the same handlers against a hydrated copy,
so cross-process safety rests on the gateway claim plus `StoreFencedError`
and generation preconditions, not on this lock (D15, D23).
