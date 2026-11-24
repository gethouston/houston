# Runtime pooled turns: design decisions

Decisions and external constraints of the pooled per-turn runtime (`packages/runtime/src/turn`). Complements ADR 0006 (`0006-runtime-design-decisions.md`), which keeps the shorter summary; each section names the symbol it governs.

## Credential writes and OAuth custody (packages/runtime/src/turn/op-apply.ts, packages/runtime/src/turn/op-failure.ts, packages/runtime/src/turn/op-route.ts)

- `applyOp` syncs API-key connection sidecar files only after a successful credential-store push. A 502 must not durably change the agent's endpoint or region while its replacement key remains unstored.
- `answerOpFailure` logs only the action for custom OAuth failures. Library error messages can contain the authorization code or verifier. A thrown completion returns an ambiguous result because the token may already be in remote custody.
- `applyRouteOp` treats executor shutdown failures as diagnostics. Turning an otherwise successful operation into a 500 would discard its reply and prevent file sync even though its remote credential write may already have committed.

## Op validation and acting identity (packages/runtime/src/turn/op-first-day.ts, packages/runtime/src/turn/op-grammar.ts, packages/runtime/src/turn/op-grammar-seed.ts, packages/runtime/src/turn/parse-op-request.ts, packages/runtime/src/turn/turn-acting-context.ts)

- `prepareFirstDayOp` returns 400 for malformed JSON and JSON `null`. The pod's reader throws on these inputs, but a worker 500 makes the gateway temporarily fast-fail every operation for that agent.
- `parseRouteOp` checks the decoded route against the allowlist because host handlers decode it too. For example, `%2Ehouston` must receive the same judgment as `.houston`.
- `parseSeedOp` rejects invalid seed paths before creation. The equivalent pod failure occurs during creation and returns 500 after rollback; rejecting at the worker boundary produces a deterministic 400 that the gateway does not retry.
- `parseOpRequest` trusts `actingAs`, including its `via` marker, because the gateway constructs the envelope from its verified principal. Deployment IAM and `X-Internal-Token` restrict this entry point to dispatched work; these fields do not come directly from the client.
- `OpRequest.agentName` carries the gateway registry's display name because a cloud rename does not rename the stored folder. Handlers must use that display name rather than infer the current name from the folder.
- `turnActingContext` may set `verifiedOwner` from the dispatched acting person because the gateway already verified the turn record. That identity can own a browser hand-off even when no separate signed acting token accompanies the turn.

## Lazy hydration and write ownership (packages/runtime/src/turn/op-tree-options.ts, packages/runtime/src/turn/op-sync.ts, packages/runtime/src/turn/turn-claimed-hydration.ts, packages/runtime/src/turn/turn-agent-scope.ts, packages/runtime/src/turn/op-route-custom.ts)

- `opTreeOptions` uses a download filter for settings and credential inputs. Objects omitted by that filter never enter the hydration manifest, so downloading only the small configuration files cannot make the rest of the agent's files appear deleted.
- `syncOp` takes generation support from `filesystem.generationAware`, rather than inferring it from manifest entries. A pure create can have an empty manifest even though the store requires create-only writes with generation `"0"`.
- `CLAIMED_TURN_EXCLUDES` excludes store-root package caches while retaining toolchains inside the agent's own workspace, including `node_modules` and `.venv`. A disposable worker has no other source for an installation needed by the next turn.
- `agentScopeIncludes` retains agent-owned `.houston/<dir>/` state outside the directories owned by Houston's specialized writers. Dropping a routine's watermark would make its next disposable worker read the old watermark and repeat work already completed.
- `customIntegrationContext` materializes `custom-integrations.json` through the lazy VFS before constructing its filesystem-backed store. Otherwise the raw filesystem reader sees no definitions, and a later write attempts a create over the existing remote document.

## Conversation authority and import repair (packages/runtime/src/turn/op-conversation.ts, packages/runtime/src/turn/op-import-repair.ts, packages/runtime/src/turn/turn-card-owner-read.ts)

- `applyConversationOp` preserves runtime-only fields when installing an authoritative database snapshot, but discards the file's old archive index. That index describes the lagging file layout and must not accompany the canonical row snapshot.
- `repairImportedConversations` also repairs conversations skipped because their files already exist. A retry after a crash between file sync and transcript repair must finish the database projection even when it uploads no replacement transcript.
- `startCardOwnerRead` cannot use inlined conversation bytes as proof of the current card owner. Prefetch happens before the gateway holds the claim, so those bytes, or the prefetched listing itself, can omit the previous turn's final card. The ownership check therefore needs a read made under the current claim.

## Endpoint deployment rules (packages/runtime/src/turn/op-endpoint.ts)

`applyEndpointConnect` always applies the managed deployment's public HTTPS endpoint check because these operations run only behind the managed gateway. The development launcher's loopback pods retain the proxy path for localhost endpoints, which a worker would reject with 400.

## Seed views and migration synchronization (packages/runtime/src/turn/op-seed-views.ts, packages/runtime/src/turn/op-seed-sync.ts, packages/runtime/src/turn/op-migrate-sync.ts, packages/runtime/src/turn/op-migrate.ts, packages/runtime/src/turn/op-migrate-reply.ts)

- `RUNTIME_VIEW_SOURCES` deliberately supplies an unconfigured provider baseline for a new agent. The gateway overlays connected providers and the active provider on every asleep read, so the worker does not need the agent's credentials to capture that baseline.
- `syncSeedTree` and `syncMigratedTree` omit the store's metadata-manifest method from the wrapper passed to `syncBack`. This disables refreshed-generation retries: a 412 must remain a conflict instead of retrying stale bytes against the generation another writer just created.
- `moveCustody` leaves a failed custody move incomplete rather than sending it to the pod as an ordinary failure. The pod's boot would attempt the same move, so changing execution location would not resolve it. The gateway must leave the version unconfirmed and retry later.
- `MigrateFailureCode` distinguishes `"store_empty"` from a malformed layout. An empty listing can be momentary and remains retryable; `"layout_unexpected"` and `"hydrate_over_cap"` make the gateway wait for the stored objects to change.

## Routine cancellation and mirror healing (packages/runtime/src/turn/op-route-allowlist.ts, packages/runtime/src/turn/op-routine-heal.ts)

- `RUN_CANCEL_ROUTE` assumes the gateway has already released the routine run's pooled claim. The worker settles the run row; it does not stop the original worker's model execution.
- `ROUTINE_HEAL_BUDGET_MS` is 1,500 ms, inside the gateway's 5-second run-now early-result window, which also includes dispatch and hydration. `healRoutinesMirror` has no transient retries and cancels outstanding document requests when that budget ends. Waiting beyond the gateway's window could turn a missing-routine 404 into a 200 for a run that never started.

## Single-use worker lifecycle (packages/runtime/src/turn/single-use.ts, packages/runtime/src/turn/server-types.ts)

- `markWorkerSpent` relies on `HOUSTON_HOME` being on the pod's writable volume. The volume and its page cache survive a container restart; the container's writable layer does not provide that contract. A hard node loss removes the pod and requires replacement anyway.
- The spent marker is a local fast path. Model-directed Bash can modify its volume, so the control-plane recycler's deletion of the whole pod is the authoritative replacement mechanism.
- `TurnServerDeps.singleUse` spends a worker for its first login request as well as its claimed turn. A login retains custody until the gateway kills its runner. An `/op` request does not spend the worker because it runs host handlers without model-directed code.

## Hand-off deadlines (packages/runtime/src/turn/turn-deadline.ts)

`TURN_END_RESERVE_MS` reserves three minutes for the model to read the returned page and complete durability sync after a hand-off. `MIN_HANDOFF_MS` requires at least 60 seconds for the person to sign in.

`turnTokenExpiry` counts an `exp - iat` lifetime from arrival to avoid depending on a restored sandbox's clock. This overstates the actual expiry by the dispatch delay, typically seconds; the end reserve absorbs that difference. Reading the claims does not require the gateway's verification key because the result only limits the worker's waiting time.

## Deferred file performance (packages/runtime/src/turn/turn-deferred-rule.ts, packages/runtime/src/turn/turn-deferred-watch.ts)

- `deferredWorkspaceFile` must stay identical to the gateway's prefetch predicate. Deferred files must also be omitted from the inlined upload, or their transfer still delays the worker's acceptance response.
- `DEFERRED_PARALLEL` is four, matching the critical hydration path's batch parallelism and allowing four batch bodies beside the running backend. Halving that pace would make the first tool wait longer than the previous full-tree hydration before prompting.
- `watchDeferredFiles` logs an exceeded file budget as a size condition rather than an engine fault. The same files exceed the budget on every send until their size changes.

## Claude startup profiling (packages/runtime/src/turn/turn-claude-startup.ts)

- `armClaudeStartupProfile` enables profiling only for single-use workers because its armed state and report are process-wide. A reusable worker cannot safely associate that single record with overlapping turns.
- `MAX_ENTRIES` permits 120 report entries while the CLI currently emits about 80 checkpoints. The allowance leaves room for growth without making terminal diagnostics unbounded.
- `collectClaudeStartupProfile` runs only after the CLI stream ends on its own. An early return can leave the CLI writing its shutdown report, so collecting and removing the directory then would race that writer.

## Document contention and merge bases (`packages/runtime/src/turn/turn-doc-merge-publish.ts`, `packages/runtime/src/turn/turn-doc-refresh.ts`)

- `DOC_MERGE_ROUNDS` allows ten PUT attempts to accommodate ten runs of one agent finishing together. Writers racing in lockstep can land only one per round; jitter breaks that lockstep.
- `refreshDocument` records the remote bytes, hash and generation in the manifest, even when the local file contains merged changes. A failed upload must retry against the store's actual version. Unsaved merged bytes cannot become a trusted merge base.

## Hydration budgets and archive coordination (`packages/runtime/src/turn/turn-filesystem.ts`, `packages/runtime/src/turn/turn-hot-set.ts`, `packages/runtime/src/turn/turn-archive-fetch.ts`, `packages/runtime/src/turn/turn-routine-context.ts`)

- `TURN_DEFERRED_MAX_BYTES` is 8 GiB. Together with the 2 GiB startup cap, it fits within the pool sandbox's measured 22 GB disk capacity.
- `ownConversationOnly` admits no archive segment (ADR 0116). A shared routine conversation adds a segment approximately every 6 MiB of runs and never shrinks, so hydrating its archive on every fire produces unbounded transfer growth.
- `turnArchiveLoader` enters a fetched segment in the turn's manifest with the bytes' hash, exactly like a hydrated one: the sync never re-uploads it, and a local delete of it reaches the store. A segment the store lacks too is reported and fails the fetch (`ArchiveSegmentMissingError`); the caller decides whether its read can go on past the hole.
- `loadRoutineReplayArchive` treats a segment the store lost as a shorter digest, not a failure: failing there would fail every run of the routine for good. Any other fetch failure fails the turn.

## Store-backed reads (`packages/runtime/src/turn/turn-filesystem-types.ts`, `packages/runtime/src/turn/turn-filesystem.ts`, `packages/runtime/src/turn/turn-store-read.ts`, `packages/runtime/src/turn/turn-mission-title-remote.ts`)

- Readers that may reach files the operation has not materialized must use `TurnFilesystem.vfs`. Direct filesystem reads cannot distinguish a remote object from an absent one in a lazy tree. `TurnFilesystemOptions.lazy` is suitable only for operations whose readers use that port; turn tools read the real filesystem.
- `readStoreText` downloads outside the synced tree because store adapters create destination parents. Downloading into the tree could recreate a folder the turn deleted.
- `remoteActivityReader` also downloads outside the hydrated tree. Its fresh board read is input to the title merge and must never become an independent sync-back write.

## Model startup dependencies (`packages/runtime/src/turn/turn-runtime.ts`)

`TURN_RUNTIME_INPUTS` includes `models-store.json` because pi reads it internally. `ModelRuntime.create` constructs a `FileModelsStore` at `dirname(modelsPath)/models-store.json` and loads it during its offline refresh. That file must finish hydrating before model construction; leaving it to bulk hydration permits pi to parse a partially downloaded file.

## Conversation roots and layout evidence (`packages/runtime/src/turn/turn-root.ts`, `packages/runtime/src/turn/turn-layout-agents.ts`, `packages/runtime/src/turn/turn-layout.ts`)

- `conversationTurnRoot` stabilizes paths for prompt caching. The cwd, context-file paths and skill paths enter model input as absolute paths, and the cache matches exact bytes. Random roots change those bytes on every follow-up turn and force the history to be processed again.
- `realAgents` cannot treat schemas or runtime files as evidence of an authored agent. Host startup can create a runtime inside a mistakenly selected folder, and schema seeding writes into any folder containing `.houston`. Those generated files can therefore reinforce an incorrect selection.
- `StoreEmptyError` preserves `layout_unexpected` for turn clients while allowing migration to answer `store_empty`. A temporarily empty listing should remain retryable; it must not receive the gateway's persistent treatment of a store containing multiple agent layouts.

## Pooled provider transport (`packages/runtime/src/turn/turn-pi-transport.ts`)

`POOLED_TURN_TRANSPORT` selects SSE for both the agent session and mission-title requests. In pi-ai 0.87, `auto` first opened a WebSocket for `openai-codex` and cached it per session for five minutes. Single-use workers exit before another turn, and multi-turn workers may next serve another conversation, so pooled execution does not reliably recover that handshake cost.

A measured staging turn spent 6.4 seconds of its 9.9-second time to first token waiting for the Codex socket to close with code 1011 before pi fell back to SSE. Standing runtimes retain `auto` because subsequent conversation turns can reuse the socket.

## Provider connection warming (`packages/runtime/src/turn/turn-provider-warm.ts`)

- `PROVIDER_WARM_EVERY_MS` is 3,000 because Node's global fetch pool closes connections after four idle seconds. The measured DNS, TCP and TLS cost inside a sandbox was 50 to 90 ms.
- `ProviderWarmer` uses OPTIONS. On the sandbox's Node 22 runtime, HEAD responses carried `connection: close`, leaving no reusable connection. OPTIONS kept the connection open without changing provider state. Draining the response returns the connection to the pool.
- `NOT_WARMED` excludes Anthropic and Bedrock because their requests use other connection pools: the Claude CLI's process and the AWS SDK respectively. Warming Node's global fetch pool cannot warm either path.

## Overlapped session setup and token attribution (`packages/runtime/src/turn/turn-kept-mode.ts`, `packages/runtime/src/turn/turn-session-backend.ts`, `packages/runtime/src/turn/turn-session.ts`)

- `adoptKeptMode` need not hold up early model and backend setup. Those stages do not read execution mode; the backend session opens later from the adopted request. This ordering preserves the overlap with hydration.
- `openTurnBackendSession` seeds `usedTokens` from the hydrated `auth.json` because pooled `ModelRuntime` uses pi's file-backed credential store rather than `HoustonAuthStore`, so request preparation does not otherwise record the token. The seed identifies the token used by this request because its root is exclusive, and served OAuth entries contain no refresh token that could rotate it between the read and a failure.

## Turnlog deadline behavior (`packages/runtime/src/turn/turn-log-post.ts`)

`liveDeadline` accounts for event-loop stalls because a plain `AbortSignal.timeout` can fire before the poll phase reads an already-arrived socket response. The request can then appear to have failed despite receiving an answer, or before getting a chance to send. The observed case was pi walking a cyclic session for 6 to 11 seconds. A sufficiently late timer therefore grants a fresh request window.

## Mission title scheduling and diagnostics (`packages/runtime/src/turn/turn-session-title.ts`, `packages/runtime/src/turn/turn-mission-title-outcome.ts`)

- `armPooledTurnTitle` starts generation when the model response opens, rather than at prompt submission. An Anthropic title starts another Claude CLI process; starting both processes together in a small sandbox would delay the reply's first token. The title can already run from the user's words, so waiting for reply text provides no benefit.
- `MissionTitleReport` must travel on the terminal frame because worker stdout is unavailable in a per-turn sandbox. That frame is the available diagnostic channel for the title outcome.

## Routine execution and settlement (`packages/runtime/src/turn/turn-routine.ts`, `packages/runtime/src/turn/turn-routine-finish.ts`, `packages/runtime/src/turn/turn-routine-context.ts`, `packages/runtime/src/turn/turn-routine-reply.ts`)

- `prepareRoutineTurn` needs no additional cross-process runs-file lock. The conversation claim already permits only one open claim for that conversation across workers. This is a narrower coordination boundary than the standing runtime's per-agent runs-file queue.
- `finishRoutineTurn` may snooze after a usage-limit failure even when the run row did not become durable. That individual failure is sufficient evidence to hold further fires. A streak-based auto-pause instead depends on durable run history.
- `loadRoutineReplayArchive` tolerates only `ArchiveSegmentMissingError`. The missing segment has already been reported, and omitting it merely shortens the digest. Failing every later fire over the same absent segment would prevent the routine from running indefinitely. Other read failures still fail the turn.
- `lastAssistantReply` returns empty content when the conversation is missing or unreadable, allowing settlement to classify an otherwise successful run as surfaced with an empty summary. Settlement must not introduce another failure after the turn's own outcome has already reported what happened.

## Shared skill snapshots (`packages/runtime/src/turn/turn-shared-skills.ts`)

- `snapshotTurnSharedSkills` passes the directory prefix `skills` without a trailing slash. The pod-store refuses `skills/`.
- `clearSnapshot` removes partial snapshot contents because offering a skill whose reference files never arrived is worse than omitting that skill. It preserves the snapshot directory itself because the file guard was built against that directory.
- Shared skill snapshots remain read-only because their contents are outside sync-back and disappear with the turn. Allowing edits would appear to succeed while discarding the changes; standing runtimes own persistent shared-skill writes.

## Setup error text (`packages/runtime/src/turn/turn-terminal.ts`)

`TURN_SETUP_MESSAGES` is part of the fallback contract. Clients that do not understand a setup code display its message verbatim, and the cloud mission watcher stores that message as the mission error. Each entry must accurately explain its code, and retry advice belongs only on conditions a retry can resolve.

## Worker registration authority (`packages/runtime/src/turn/worker-registration-config.ts`)

`WorkerRegistrationConfig` omits pod identity and single-use state because the turn shares the runtime's Unix user and can read its worker token. Possession of that token cannot establish that self-reported lifecycle facts are true. The gateway obtains those facts from the Kubernetes API. The projected token file contains only this worker's token, so the same access does not confer another worker's identity.
