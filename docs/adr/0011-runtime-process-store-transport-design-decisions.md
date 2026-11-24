# Runtime process, store and transport: design decisions

Decisions and external constraints of runtime config and boot, the transcript store, the HTTP transport and the eval harness (`packages/runtime/src/{config.ts,main.ts,lru.ts,observability,store,transport}`, `packages/runtime/eval`). Complements ADR 0006 (`0006-runtime-design-decisions.md`), which keeps the shorter summary; each section names the symbol it governs.

## Discoverability evaluation (packages/runtime/eval/discoverability-cases.ts, packages/runtime/eval/run-discoverability.ts)

- `DiscoverabilityCase.operations` accepts every operation that honestly answers an ambiguous request. Restricting a case to one interpretation would measure the fixture author's preference rather than the assistant's ability to find a capability.
- `run-discoverability.ts` stays opt-in and outside CI because it spends tokens through the user's connected provider. Missing credentials are an expected setup state, reported with connection instructions rather than a stack trace.
- `INSTRUCTION` requests an operation name rather than a tool call because this evaluation measures discovery. A wrong name makes the failure readable without reconstructing a tool transcript.

## Timeout evidence (packages/runtime/src/config.ts)

- `config.turnStallTimeoutMs` defaults to 10 minutes to accommodate silent reasoning while bounding provider stalls. A 5-minute default interrupted a live `gpt-6-astra` reasoning phase at approximately 250k context after just over 300 seconds without output, losing the billed turn. A stalled SSE connection had remained open for 19 minutes in production.
- `config.turnFirstByteDeadlineMs` uses a 15-second base because that is three times the measured first-byte p99. This is the base for the prompt-size allowance, not a fixed deadline for every request.

## Memory budgets and cache ownership (packages/runtime/src/config.ts, packages/runtime/src/lru.ts, packages/runtime/src/store/conversation-parse-cache.ts, packages/runtime/src/store/conversation-file.ts)

- `config.sessionCacheMax` defaults to eight because pi's `SessionManager` retains every JSONL entry in memory. Compaction reduces model context without reducing that retained history. Sessions consume two to three times their file size; forty settled sessions accounted for most of a 1.5 GB runtime with no user workload.
- `config.engineMemoryReserveBytes` uses a 1280 MiB default based on production measurements before the memory baseline work: an awake engine occupied 0.7 to 1.5 GB without user workload, and the Claude CLI alone reached 0.6 GB.
- `readParsedFile` needs a byte budget in addition to its 64-entry limit. The count-only limit retained sixty-four multi-MB transcripts, including a single 165 MB routine conversation, contributing to runtime memory exhaustion.
- `loadConversation` can return the same mutable object held by the parse cache. A caller that mutates it must save the change through `saveConversation`; otherwise subsequent readers can observe a change that never reached disk.
- `LruCache` is deliberately duplicated in the runtime and SDK. Neither package has an appropriate shared dependency for this utility, and the protocol package contains wire types rather than general cache code. Its callers must retain an authoritative source from which an evicted value can be rebuilt.

## Runtime identity and process lifecycle (packages/runtime/src/config.ts, packages/runtime/src/main.ts, packages/runtime/src/observability/logging.ts, packages/runtime/src/transport/server.ts)

- `config.assistantRole` comes from the host because a runtime cannot infer its role from its directory. The local coordinator uses `.assistant`, while a managed coordinator can be an ordinarily named agent under `/workspace`.
- `config.shutdownDrainMs` follows the host's termination budget after reserving time for final store synchronization. Desktop keeps the short default because the owning application has already exited.
- `start` sets umask `002` when a turn worker uses `config.toolShell`. The runtime and tool user share the turn tree's group, so each must be able to edit and synchronize files created by the other. Explicit private file modes remain private.
- `start` checks `workerSpent()` before calling `assertMarkerWritable()`. A spent pod may have a full volume. Checking writability first would make that normal recycle state crash repeatedly instead of idling, obscuring the clean-exit signal the recycler uses.
- `installRuntimeLogging` supplies Sentry through `LoggerOptions.capture` because it already owns the console methods. A second console wrapper would report entries twice. The capture callback must contain its own failures so reporting cannot interrupt logging.
- `shutdown` cannot use connection closure as proof that a standing runtime has finished its turns. Those turns run after their initiating request returns, so no open connection necessarily holds the process alive.
- `drainTranscriptShadow` imports the conversation store only in server mode. Turn mode has no long-lived store, and importing it would create an unused conversations directory.
- `startServer` treats an interrupted-turn settlement failure as nonfatal. It reports the failure and leaves the marker for the next boot, rather than turning one interrupted turn into a runtime that cannot start.

## Transcript archiving (packages/runtime/src/store/conversation-archive.ts)

- `ARCHIVE_TRIGGER_BYTES` and `archiveOlderMessages` address storage costs that autocompaction cannot reduce. A 165 MB transcript required over a gigabyte of resident memory per turn and caused 87 pod terminations from memory exhaustion in one day.
- `archiveOlderMessages` writes the segment before the live transcript so a crash between writes leaves redundant data rather than missing history. The next rotation uses the same segment number and overwrites that redundant segment.
- `readSegment` reports malformed segment JSON as a gap in old history while keeping the live conversation usable. Segment writes are atomic, so an incomplete Houston write is not an expected explanation for malformed JSON.

## Transcript resets and compaction checkpoints (packages/runtime/src/store/conversation-truncate.ts, packages/runtime/src/store/conversation-import.ts, packages/runtime/src/store/conversation-compaction.ts)

- `truncateConversationMutationAt` requires the session teardown and event-channel invalidation performed by `truncateConversationTurn`. `importConversationMessagesAt` likewise requires the teardown performed by `importConversation`. Changing the canonical file alone leaves backend-native context that no longer matches the transcript.
- `createCompactionCheckpoints.clear` discards a checkpoint whose history no longer applies. An armed checkpoint supplies old model memory and suppresses native session resume, so leaving it after a reset can also prevent the replacement session from being resumed.

## Admission durability (packages/runtime/src/store/message-admissions.ts)

`MessageAdmissions` provides durable retry decisions across process restarts over the same data tree. Durability across asynchronous remote replication belongs to the hosting service; publishing a local receipt does not establish that the remote copy has arrived.

## Claude credential materialization (packages/runtime/src/transport/claude-oauth-route.ts)

`handleClaudeOAuthCredential` needs both credential sinks because the SDK reads them differently across operating systems. On Linux, `<CLAUDE_CONFIG_DIR>/.credentials.json` is the SDK and `claude auth status` source, and the shared directory carries the pushed credential to every agent runtime. On macOS and Windows, the SDK reads the OS credential store rather than that pushed file. The runtime therefore also stores the token in `auth.json` so `readAnthropicToken` and `buildClaudeEnv` can supply `CLAUDE_CODE_OAUTH_TOKEN`. That environment token takes precedence over file and OS stores on all three systems.

## Credential rollback and actionable errors (packages/runtime/src/transport/api-key-rollback.ts, packages/runtime/src/transport/auth-action-route.ts)

- `handleApiKeyRollback` is necessary because runtime verification and persistence precede the host's central credential write. If that central write fails, the local key has no `served-providers.json` provenance, so an authoritative central not-connected response cannot remove it. Without rollback, the key works locally until the pod recycles, then disappears.
- `handleAuthAction` preserves a typed login error's `kind`, such as a busy Codex callback port, because the frontend uses it to select an actionable sign-in message. Flattening the error to text loses that routing information.
- The logout branch of `handleAuthAction` records when an OpenAI-compatible sign-out also removes custom endpoint configuration. That attribution distinguishes an explicit sign-out from an unexplained endpoint disappearance.

## Conversation request contracts (packages/runtime/src/transport/conversation-routes.ts, packages/runtime/src/transport/conversation-start-turn.ts, packages/runtime/src/transport/interaction-owner-gate.ts)

- `handleTitleFromText` retains `POST /title` for shipped clients that predate the message request's `missionTitle` field.
- The history branch of `handleConversationRoute` keeps full-history behavior when pagination parameters provide no usable window. Older clients and proxies that remove query strings must still receive history.
- The interaction-dismissal branch keeps `conversationCommandBusy` and `markConversationStopped` in one synchronous operation. An intervening context command could otherwise place the dismissal marker before a new `/clear` boundary, leaving it unable to retire the intended interaction.
- `handleStartTurn` treats either supplied gateway context field as selection of the entire gateway context. An omitted companion field becomes an empty string rather than falling back to local `WORKSPACE.md` or `USER.md`. Only requests with neither field use those files.
- `isRoutineFire` trusts `ROUTINE_FIRE_HEADER` because the host's `fireTurn` supplies it directly. Ordinary client forwarding constructs its own header list, including bearer authorization, content type, acting identity, `Last-Event-ID` and `Accept`, instead of forwarding arbitrary client headers. That distinction is required for the routine exemption from card ownership.
