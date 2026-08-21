# Where two sources can disagree

Each entry: the two copies, how they drift, and what reconciles them. "None"
means nothing does until a human or a future change acts. D = divergence,
W = wake-time writer (see [wake-writers.md](wake-writers.md)).

## Engine side

| # | Copies | How they drift | Reconciler |
|---|---|---|---|
| D1 | pool worker's disk vs store | A claimed turn may write anywhere under the workspace with the clamped file tools, but `claimedTurnIncludes` lands only its conversation, its sessions dir, `activity.json` and `routine_runs.json`. User deliverables, `CLAUDE.md` edits, `learnings`, `config`, `routines`, `models.json` written during a pool turn are counted `outOfScope` and dropped (`turn-filesystem.ts`, `sync-back.ts`) | None. One `console.info` with the count |
| D2 | `settings.json` / `custom-endpoint.json` vs the `providers` view doc | A settings op lands the file but returns `events: []`, so `republish()` captures nothing; the gateway keeps serving the old `isActive` / `activeModel` | Next pod wake (`warmViewDocs`) or a live client `GET providers` |
| D3 | view docs (`providers`, `provider_usage`, `custom_definitions`, `skills`) vs pod reality | Captured answers, exact only while the pod sleeps. A capture is abandoned silently on non-200, non-JSON or above 4 MiB and the previous doc keeps serving. `providers` and `provider_usage` have no event refresh at all | Boot warm with a 4 x 10 s retry ladder; event refresh for `SkillsChanged` and `CustomIntegrationsChanged` only; `providers` is overlaid with the credential store at read time |
| D4 | family file vs family doc after a failed projection | Op: files land, `publish()` fails, one 500 ms retry, then the op still answers 200 and logs. Turn: `board doc publish failed` is appended to the outcome error, files already durable | Next op's republish, or the pod's boot `DocShadowProjector.seed()` (needs a wake) |
| D5 | doc revision conflict | `HttpDocShadow.put` drops its cached revision after one 409 retry and returns; the file stays newer than the doc. The worker's `publish()` does GET-revision, PUT, one retry, then gives up | Next projection of that family |
| D6 | projector binding refused | With more than one agent dir on a pod volume (rename leftovers) the projector defers; every `project()` for an unbound agent is refused and logged. Same rule blocks the view sink | An authenticated request binds (`bindAddressed`) or a lazy single-agent bind fires |
| D7 | turn-written `activity.json` / `routine_runs.json` vs their docs | `publishTurnActivityDoc` and `publishTurnRunsDoc` run only when the key appears in `uploaded`. Unchanged hash with a drifted doc re-projects nothing | None from the turn; the pod's projector or a later op |
| D8 | transcript rows vs conversation file | The doc shadow seeds at boot; the transcript shadow does not. Repairs happen only inside a live process (send failure, queue overflow). A pod that sleeps after a failed send leaves Postgres stale until the next mutation of that conversation | None at boot |
| D9 | chat-history boot migration | `migrateChatHistory` writes conversation files at every boot with no transcript enqueue; under `database` authority the gateway list will not show them until mutated | None |
| D10 | adopted claim | An adopted re-run appends a second user/assistant pair behind the dead worker's; `HttpTurnTranscript` picks the last by `turnId`. The file keeps both, Postgres keeps the last | None |
| D11 | turnlog vs transcript vs file | Turnlog is best-effort: 404 disables it for the turn, any other failure drops the batch; bounded 1024 entries and 1 h on the gateway side. `seq` must be continued via `turnlogSeqStart` or a restarted worker collides | `Replay` answers `Resync` for an unservable cursor; the tail replaces a stale cursor with an idle sync; history comes from the transcript read |
| D12 | `routines` doc vs `routines.json` | Run-now and control-plane routine fires trust the doc with no authority check. A routine present in the doc but edited on disk runs from the stale doc | Unknown routine id falls back to the pod path; the worker answers `error:no_routine` inside an early window |
| D13 | fenced mid-sync | `syncBack` aborts at the first 409, leaving the pass partially written; the turn reports `claim_fenced` and the temp root is deleted. The standing daemon latches `fencedLatch` and stops all further sync including the shutdown sync | None: everything written after the fence is lost with the pod |
| D14 | `GROUP.md` vs the `sidebar_layout` preference | The gateway writes `GROUP.md` straight into an awake pod and never into the store, so a sleeping pod misses the edit | Re-driven at the dispatch wake and at provisioning completion; best-effort |
| D15 | standing pod disk vs store during the sync window | The daemon debounces 3 s and sweeps every 5 min; the watcher can degrade to periodic-only on inotify exhaustion. An op dispatched to an awake-but-unsynced agent hydrates stale bytes. Claims are per conversation plus one `agent-ops` key, so a live pod write and an agent-level op on the same file are separated only by generation preconditions | `StillAsleep` post-claim re-check; `waitForAgentOps` holds a 0 to 1 wake up to 10 s, then wakes anyway; per-object generation CAS when the store backend supports it |
| D16 | shared mirror vs org original | A generation conflict blocks the local edit and skips the pull for that key; a partial pass never advances the baseline | Retry on the next push-pull; `needsRetry` bypasses the probe debounce |
| D17 | `runtime.log` treated as state | Inside the data dir, excluded by nothing: uploaded on every sync tick, downloaded on every pool hydrate, counted against the 2 GiB cap | None |
| D18 | pool worker excludes are thin | A claimed turn hydrates with `DEFAULT_EXCLUDES` only; `credentials.json`, `db/`, `shared-mirror/` stay out solely because the pod's upload side excludes them | None |
| D19 | 413 over-cap files | Recorded in `skipped[]` with their hash so they never retry until they change; the file exists on the pod and nowhere else. A worker never sees it | None |
| D20 | partly durable op | Some objects landed, others conflicted: the op answers `ok: true, ambiguous: true`; a re-run would duplicate the landed half | None by design; the client refreshes and decides |

## Gateway side

| # | Copies | How they drift | Reconciler |
|---|---|---|---|
| D21 | `agent_docs` vs store file, awake pod | The family read interceptor checks authority but not power, so an awake pod's `GET config` can serve a doc older than the file the pod is about to read-modify-write | Mis-shaped docs fall through to the proxy; nothing else |
| D22 | credential store vs pod-local `auth.json` | A gateway-side login or logout while asleep touches only Postgres | The pod re-pulls from the pod credentials route on wake; nothing verifies |
| D23 | agent-ops claim vs the agent write lease | `fenced` short-circuits to the claim path when claim headers are present, so a worker's write bypasses the lease the awake pod holds | Ordering from D15 plus generation preconditions |
| D24 | transcript / doc rows after a cross-org move | The object prefix and the registry rows move; `agent_docs`, `conversations`, `conversation_messages`, `conversation_turns` keyed on the old org slug do not | None. Reads fall through to the proxy; a fresh doc is created on the next push; old rows stay until account purge |
| D25 | per-row `conversations.authority` vs per-agent phase | Promotion updates both in one transaction, but `GetAgentAuthority` is `bool_and` over rows: one divergent row silently demotes the agent to `file` | Inheritance at insert; fails safe but invisible |
| D26 | claim and lease caches vs durable rows | Positive cache up to 2 s means a just-fenced token can still write | Unknown tokens always re-read durably; `FenceSettleDelay` makes gateway-authored terminal frames wait the window out |
| D27 | `compute_active_reports` vs actual awake time | Pushed unfenced by boot id; a resumed zombie with the same boot id merges into the same row | `greatest(...)` merge only |
| D28 | `desired_power` vs the actual pod | Informer projection, lags both ways | Re-checked after the claim; a lagging "awake" reading simply wakes the pod |

## Inputs to the follow-on work

- **Lazy hot-set hydrate.** The per-path hydrate columns above are the hot
  set by construction: a turn needs `settings.json`, `custom-endpoint.json`,
  `qwen-region.json`, `models.json`, its own conversation and sessions dir,
  the context files, `.agents/skills/**`, `skills-manifest`, `activity.json`,
  `routine_runs.json`, `routines.json` (routine turns) and whatever user
  files the model opens. Everything else hydrated today is either never read
  (other conversations, `runtime.log`, `token-usage.json`) or dropped at
  sync-back (D1).
- **SSE fan-out.** Op-made changes that already emit a host event on the
  worker (`ConfigChanged`, `ActivityChanged`, `RoutinesChanged`,
  `RoutineRunsChanged`, `LearningsChanged`, `SkillsChanged`, `FilesChanged`,
  `ContextChanged`, `ConversationsChanged`) are dropped on the wire in
  `execute-op.ts`. Writes that emit nothing anywhere, so fan-out alone will
  not surface them: `settings.json` (D2), `custom-endpoint.json`,
  `qwen-region.json`, `auth.json`, `store-publication`, the migration marker,
  schema re-seed (W2), `CLAUDE.md` written by agent create or portable
  install.
