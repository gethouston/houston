# Runtime session: design decisions

Decisions and constraints of the long-lived session layer in `packages/runtime/src/session` (outside `session/tools`). Each section names the module that holds the rule. The shorter summary in ADR 0006 (`0006-runtime-design-decisions.md`, section "Long-lived session layer") stays valid; this file carries the detail.

## The Conversation record (conversation-record.ts)

- `provider` and `model` record what the live session is pointed at, because on the web the picker applies a switch through `setSettings`, which alone does not move the cached session. A real mid-conversation switch is detected by comparing against them.
- `backendId` is the backend that built the live session (pi by default, `anthropic` for the Claude Agent SDK), compared against `serverBackendFor(model.provider).id` every turn. A switch that crosses a backend boundary rebuilds the session on the new backend. A foreign model is never forwarded into the live session through `setModel`: that would route an anthropic turn through pi's in-process client, or an openai id through the Claude subprocess.
- `mode` is the mode the session was built with. A per-turn flip that differs rebuilds the session on the same backend, because plan and execute need different tool allowlists and system prompts, and both are fixed at build time (`switchModeIfNeeded`).
- `liveMode` exists only while a turn executes. With no turn running there is nothing to apply live; the next turn's pin carries the mode.
- `context` is the workspace and user context the session was first built with. A mode or backend rebuild reuses it verbatim, so a conversation keeps its startup context across a plan and execute flip the same way it keeps its history. A context edit only reaches a new conversation.
- `turnId` is the executing turn's wire id. The Stop path stamps it on the "Stopped by user" terminal frame so the stop settles the turn it actually interrupted, never one a client guessed.
- `stoppedTurnId` is the only trace that a resolution was a stop: pi routes an aborted turn down the normal usage path, so `prompt()` resolves clean with no provider_error. `execTurn` reads it to stamp `stopped: true` on the persisted assistant message (so the stop survives a reload) and to skip the clean `done`.
- `pending` counts turns queued or running for the conversation for their whole lifetime. Above zero it pins the session against idle and LRU eviction. `turnId` alone would miss a turn parked in the queue behind the workdir lock. `isConvBusy` checks both.
- `sessionRebuildPending` is set while a routine reset has disposed the live session but not yet built its replacement. The next turn on the record retries the rebuild even when it is a person's turn, so no queued turn ever prompts a disposed session.

## Turns versus conversation commands (conversation-command-gate.ts, truncate-turn.ts, import-conversation.ts)

A conversation command (`/clear`, `/compact`) rewrites the context a turn runs in, so a turn and a command never overlap. Ordinary turns exclude each other through the conversation queue, which a command joins too, but the queue cannot decide acceptance: a turn is accepted by the route and reaches the queue several awaits later (credential sync, session build). Acceptance is therefore gated at the one place turns enter the runtime, and the answer holds from the instant the route says yes:

- a turn is held from acceptance until it settles (`holdConversationTurn`), registered in the same tick the route accepts it, since that gap is exactly the window a `/clear` could slip through;
- a command is in flight from acceptance until it settles (`beginConversationCommand`), marked synchronously before it awaits anything.

Each refuses while the other holds the conversation, with a structured 409 the caller can act on, never a dropped message. `runTurn` settles rather than rejects, so a rejection seen by the hold is a runtime bug: the hold is still released (a conversation wedged against every future command is worse) and the reason is logged. `conversationCommandBusy` reads lifecycle only, never the event stream: a frame published after a turn's terminal one leaves the stream reading running, and the conversation must not refuse commands on that account.

Edit-and-resend (`truncate-turn.ts`) and transcript import (`import-conversation.ts`) are conversation commands too and ride the same gate rather than a private copy of half of it. The private copy checked only executing and queued turns, which let a turn accepted but not yet queued have its session torn out, and let a `/clear` interleave with the teardown. The client disables the edit affordance while a turn runs, so a 409 there means the user raced one.

Both tear down model context the same way DELETE does, minus deleting the file: the canonical transcript is not what the model reads, so the live session is disposed, both backends' native session state is deleted, and the event channel is evicted (outstanding resume cursors point into the pre-cut feed, so reconnects get `sync {resync}`). The store write stamps `needsSessionReplay`, so the next turn opens a fresh session carrying the kept transcript as a replay preamble. Without that the model would either remember dropped turns or forget kept ones. Imported lines reach the model the same way any earlier turn does after a rebuild.

## Native session state (native-session-state.ts, conversation-control.ts)

`clearNativeSessionState` deletes everything the backends keep as a conversation's model context and nothing else; the transcript the person reads (and `houston_recall` searches) stays whole. It clears pi's per-conversation session dir and the Claude backend's `sessions.json` mapping, transcript JSONL and armed compaction checkpoint; each is a no-op for a conversation that never ran on that backend, so callers need not know which provider the chat used. The compaction checkpoint goes first, before anything that can fail: it arms the next prompt with a summary of the history being deleted, and while armed the Claude backend will not resume. Dropping it last would let a failed teardown leave a conversation that answers from a summary of turns that are gone.

## Stop (conversation-control.ts, turn-frame-gate.ts, turn-stopped-before-prompt.ts)

- Out-of-turn controls (mode flip, cancel, dispose) act on the cached session and answer honestly when the conversation is not cached (for example after a restart) instead of pretending they acted. `cancelTurn` returning false tells the caller to settle a card stuck on running because its turn died.
- The "Stopped by user" frame is published before the abort, so it settles the turn first; pi's own abort rejection then lands on an already settled stream and is ignored. `STOPPED_BY_USER` is matched verbatim by the web adapter (`isStoppedByUser`) and emitted by the control plane relay on abort, so it renders as a neutral stop, never a red error.
- The mark is set only when a turn is executing (`turnId` set); a stop that raced turn end has nothing to mark.
- Every frame of an executing turn goes through `turnFramePublisher`, which stamps the turn id and drops frames once the turn was stopped. Everything pi says while unwinding (the aborted tool's `tool_end`, an all-zero `usage` from an aborted codex generation, the file diff) lands after the terminal frame, and the stream snapshot reads any non-terminal frame as running, which would re-open a finished turn. The frames leave the live stream only: the persisted assistant message is built from the turn's own accumulators.
- A turn is recorded and stoppable before it takes the workdir lock, and its setup awaits a backend switch or autocompact before prompting; aborting a session that is not prompting does nothing. `execTurn` checks the mark after the lock and again right before `prompt()` and settles there: nothing reaches the model. A replay the setup consumed is re-armed for the next turn; provider-switch and compaction boundaries already crossed are kept so the divider survives a reload. The mission settle matches a stop mid-prompt (`needs_you`, `stopped` so no push notification is sent).

## Mode (turn-mode-context.ts, live-mode-gate.ts, tool-selection-modes.ts, mode-overlays.ts)

- The turn's mode is an AsyncLocalStorage holding a mutable ref, not a value, so a Mode-pill switch while the agent works (`POST /conversations/:id/mode`) is adopted at the next tool decision, like Claude Code's shift+tab. `exec-turn.ts` creates one ref per turn and parks it on the Conversation record so the route reaches it. A module-level current mode would leak across concurrent conversations. Outside a turn the store is undefined and no gate fires. The integration execute proxy forwards `x-houston-turn-mode: auto` from it so the host's action approval gate lets an auto turn act.
- A session's toolset is fixed at build, so a mid-turn switch takes effect through execute-time gates: each restricted tool reads the live mode when it runs and refuses with text that tells the model what changed. Only the restrictive direction is enforceable mid-turn (execute or auto to plan blocks acting; execute to auto blocks waiting). Plan to execute cannot add tools to a running session and takes effect on the next turn's rebuild. pi's built-in `bash` runs outside Houston's tool wrappers, so a mid-turn flip to plan cannot stop it until the turn ends; the next turn's session has no bash.
- Plan mode keeps the clamped read tools (`read, ls, grep, find`) and `ask_user`; it drops `edit, write, bash, run_code` and every integration tool, because an integration call is a real-world action.
- Autopilot drops only `ask_user`. `request_connection` and `request_credential` stay: a missing connection or key is the one thing autonomy cannot produce, and without them an auto run that hits an unconnected app is a dead end (search results say to call a tool the mode removed). Recording the step ends the turn with the card, and the connection auto-continues the run.
- `toolNamesForMode` is the one place both backends derive a mode's allowlist, so pi and Claude never drift. `plan_ready` is stripped unconditionally first and re-added only on the plan branch, because the incoming list (the Claude backend's built list) may already contain it.
- The plan and Autopilot overlays are appended last, after the agent's own context. The tool subset enforces plan in fact; the overlay tells the model why and shapes the output. Overlays name no files, JSON or CLIs (non-technical user); the only tools named are `ask_user` and `plan_ready`, since every plan turn must end in one of them. `exec-turn` attaches a `plan_ready` to a clean plan turn that ended with neither (`planReadyFallback`, kept identical in shape to `recordPlanReady`).

## Ambient turn context (conversation-context.ts, turn-model-context.ts)

Tools get the turn's conversation id and resolved provider and model from AsyncLocalStorage set for the duration of `session.prompt()`, since pi hands a tool only its parameters. Asking the model for the conversation id is unreliable (it cannot see it) and could be made up. The resolved model exists so `start_mission` can pin a child turn: on managed cloud the runtime holds no standing provider and the gateway supplies no credential to a host-fired child (routines avoid this only because they always carry a pin), while the parent is running right now on a provider that works.

## Interaction recording (interaction*.ts)

- One approval card per host-issued `requestId`, never deduped by question text: two calls can read alike and do different things, so merging them would let one click grant two. A retried pending call is still one card. Approval cards are appended, never replaced, and lead the sequence: they are the runtime's, and losing one means the user never saw what they approve.
- `ask_user` replaces the question steps, so a model that asks twice settles on its final batch.
- `plan_ready` owns the interaction exclusively (`p1`). `suggest_reusable` (`r1`) is fallback only, shown when nothing else was queued.

## Finish marks and reply_complete (turn-finish.ts, reply-complete.ts)

- `closingMessageSeen` is per assistant message: a message's text always streams before its tool calls run, so a tool can ask whether the model already wrote its closing message in this message. Text from an earlier round-trip of the same turn never counts. Whitespace-only deltas (block separators) are not a message.
- Text counts only after the backend reported an assistant message start. A backend without the signal (a test fake) leaves the mark unset forever, so a tool never ends a turn on text it cannot attribute to the current message.
- `noteReplyBeat` completes the reply once per turn: when the model opens an offer tool after its closing message, or ends a message holding that text with no tool call. An offer opened before any closing text is the NEEDS_MESSAGE path and completes nothing.
- `reply_complete` is emitted then, seconds before `done`, so the client hands the card back before the offers, durability write and title. Both turn executors share `emitReplyComplete`; a backend without reply beats never emits the frame.

## Resume after restart (resume-request.ts, resume-provider-gate.ts, resume-revoke.ts, resume-prompt.ts)

- A marker is not resumed when: it was itself a resume (one automatic resume per interrupted turn, ever); it carries no resume payload (an older engine, so pin and credential scope are unknown); it is older than `RESUME_MAX_AGE_MS` (the user has moved on); or no user message for the turn id is on disk.
- A per-user scope resolves to that member's own auth file, and those files are excluded from store sync, so after a pod move they are gone. Resuming would run and bill on whatever the empty scope resolves to, so the turn settles as interrupted. The team scope is fetched by the boot serve sync and never refuses here.
- The route refuses a turn while nothing is connected; a resume has no client to refuse to, so it waits (`RESUME_PROVIDER_RETRIES` looks, `RESUME_PROVIDER_RETRY_MS` apart) for the served credential, then drops with a log line. The team scope probes through `ensureProviderForTurn`, even for a pinned turn, because that sync fetches the credential the resume runs on. A per-user scope never syncs: the serve probe sends `x-houston-acting-as` only with a live token, which died with the process, so the gateway would answer with the team credential and the sync would write it into the member's auth file (wrong account billed, wrong credential stored).
- The boot settle writes the interrupted reply with `interrupted.resumed` before the resume runs (the chat reads "picking up where it left off") and skips the mission settle, which the resumed turn would own. Every path where the resume never starts undoes both (`revokeResume`), or the transcript promises a continuation that never comes and the card stays on running. The settle report is idempotent on the host.
- `runTurn` refuses a turn it cannot start by publishing an `error` and resolving normally without recording a user message, so the recorded hidden prompt is the only proof a resume began (`resumeWasRecorded`).
- The resume prompt is model-facing English sent as a hidden auto-continue message (every surface folds `AUTO_CONTINUE_MARKER` away). It names what survived (workspace files) and what did not (temp folders, installs, running processes) because the model cannot see that and otherwise re-ran finished work, and it quotes the original request in full because the provider session died with the process.

## Claude session token guards (claude-token-guard.ts)

A Claude SDK session carries its credential in the subprocess env. A conversation touched regularly never idle-expires, so a session could outlive the gateway's token rotation and 401 `token_revoked` forever while the user's reconnects minted credentials the session never read. Besides the per-prompt re-read there are two guards, both Claude-only (pi reads credentials per request and cannot pin a token):

- At conversation lookup, a cached session whose pinned access digest is no longer the stored one is rebuilt. The check reads without a `remove` callback, so it can never delete the superseded entry that the full read drops: a staleness question that mutates the credential changes its own answer. Sessions with no digest (api_key, config-dir credential) never match.
- A turn that ended on `unauthenticated` or `token_revoked` evicts the session so the next attempt rebuilds on the fresh credential. Eviction is skipped while other turns are queued (`pending > 1`): they captured this Conversation and disposing its session would make their prompts silently no-op; the last settling turn evicts. It deletes only when the cache still maps the id to this same Conversation, so a concurrent rebuild is never torn down.

## Provider gate (provider-gate.ts)

Every provider answers "connected" from a stored credential except anthropic on desktop, whose credential only the `claude` binary can read, through a cached subprocess probe that is unknown until it first answers. Reading unknown as not connected refused anthropic turns for the first probe window and dropped the prompt. So the gate awaits a settled answer and refuses only on one that says logged out; an unanswerable probe lets the turn run and surface the provider's typed error. The await happens only on the refusal path.

## Workdir lock (workdir-lock.ts)

Turns are serialized within a conversation by its queue, and across conversations sharing a workdir (a chat and a routine run, two chats of one agent) by a per-folder lock, so they never write the same files concurrently and the per-turn file diff stays attributable. Different folders never contend. Keys are realpaths so aliases share one lock. A failed turn never wedges the folder, and the map entry is dropped once its run is the tail and done.

## Pre-run failures in turn order (turn-start-order.ts)

A turn's pre-run failure write (its message and an error reply) runs in the conversation's turn order, after the card-owner re-check: while a card is live only its person may answer, and a reply written after a running turn's card would retire it. A refused send writes nothing. With no cached conversation nothing is queued (a queued turn holds its record via `pending`), so the write runs at once.

## Session opening (open-conversation-session.ts)

Every build on the standing server goes through `openConversationSession`, because a resumed session has measured nothing and must size its first request from the fill the last reply recorded (read from the recent page, not the whole history, to avoid reading archive segments). The fresh-retry replay the Claude backend needs when a resume fails is built only then, and excludes the in-flight turn's message because the rerun sends it after the replay.

`recordedContextFill`: a compaction, provider switch or `/clear` with no reply after it leaves the fill unknown, as pi answers after compacting; a reply whose request failed records zero usage, which says nothing about the fill.

## Routine sessions (routine-context.ts, routine-session-reset.ts)

Every fire of a routine (schedule, trigger, Run now) starts a fresh backend session. A shared routine runs every fire in one conversation, and resuming its session re-sends every earlier run, tool output included, on every model call: routines firing every few minutes re-read up to 100k tokens of old runs per call. A fire opens with a short digest of the latest runs and the path of a file holding their full replies; the digest comes from Houston's own transcript, so the start cannot fail the way a summarization can. A person chatting in the routine's chat resumes the session the last fire opened and gets autocompact. A per-run routine starts fresh by construction.

The reset runs before the turn's backend and mode switches, so it rebuilds on the resolved backend in the turn's mode and both switches then no-op. `sessionRebuildPending` is set before the dispose, so a throwing rebuild leaves the record the one queue owner and the next turn retries rather than prompting a disposed session. The digest tail may sit in an archive segment, since a rotation can move the whole previous run out of the live file.

## Personal assistant role (runtime-role.ts, learnings-context.ts, assistant-rules-context.ts, assistant-capability-map.ts, houston-api-served.ts, assistant-family.ts)

- Whether a runtime is the coordinator comes from the role the host gave the process (`HOUSTON_ASSISTANT_ROLE`, `config.assistantRole`), never from its directory: the managed assistant pod runs under `/workspace` with an ordinarily named agent, so a directory check would withhold memory and rules exactly where the assistant runs, and leave it the coordinator toolset without its rules. The role clamps the tool surface on both backends and makes every mission tool name the target agent.
- Its memory is always injected (every other agent recalls learnings on lookup). There is no `.houston` gate: the assistant's tree is unseeded, so its memory doc is the first thing under it. An unreadable memory doc reads as empty rather than failing session start; the learnings routes surface a mangled doc on their own path.
- The memory frame is part of the behavior: memories are written by a summarizer from whatever went through the chat, including content a web page, document or another person put there. So they are presented as reported data about the user, and anything inside that reads as an order is quoted content, never an instruction. Without the frame, one planted line would act as standing policy from the system prompt. The last sentence of the frame states that the list is fixed for the chat, the same rule workspace context follows.
- The rules section exists because of three observed failures: guessing formats and recreating an agent instead of finding the operation; starting missions on itself, a board nobody sees; and claiming an operation did not exist without searching. A model only searches for what it believes exists, so the capability map names the whole surface up front. It is generated from the catalog and narrowed to what this deployment serves, rendered with the same renderer as the generator. Nothing stamped means nothing withheld and the generated constant is returned untouched; a catalog that will not parse falls back the same way, since a coordinator that knows too much is one wrong sentence while one that knows nothing is no assistant.
- The Houston API rules appear only where the deployment serves the API-key operations (desktop stamps them unserved, the gateway stamps nothing; fail open). They are the one place the rules allow identifiers and protocols into the conversation.
- The assistant tool family needs three things: the coordinator role, host reachability (both folded into `config.assistantEnabled`, so runtime and host dispatcher agree), and a readable embedded catalog. An unreadable catalog is a named log line and no tools, never a boot failure.

## Coordinator file and tool surface (coordinator-policy.ts, tool-selection-coordinator.ts, tool-selection-types.ts)

- The coordinator produces nothing itself, so its file tools get an exact-file allowlist (its memory doc) instead of a root, and no shared root. The workspace-shared skills mirror (a skill edited there runs inside every agent), workspace context documents and its own session records stay out. Two read-only widenings: the uploads folder (attachments people send it) and the tool-result spill folder. It can never change uploads, so one bad attachment cannot rewrite the next. It cannot read a routine chat's results file, which sits among its session records.
- Its tool list keeps only `read` and `write` (memory consolidation and reading attachments), plus interaction, mission and assistant tools. No `edit, ls, grep, find, bash, run_code`, integration execution or skill tools: work belongs on an agent's board where the user can see it. This is structural: a model cannot do work with tools it was never given.
- The assistant family is granted only together with `personalAssistant`, since the catalog reaches the whole account (deleting agents, billing, membership), which is no ordinary or third-party agent's job.
- `save_routine`, `save_learning` and the mission tools ride host reachability only, not a Composio key, since scheduled tasks and missions exist on every deployment. Without `save_routine` the agent gets nothing, never a wholesale write of routines.json. `save_learning` is the only path that records provenance (who taught it, which mission). `read_mission` rides the same gate as listing.

## Host-reaching tools (host-tools.ts, sandbox-call.ts)

Integration, custom-integration setup, `save_routine`, `save_learning` and mission tools hold no credential: they proxy to the host's `/sandbox/*` routes under the sandbox token and the host (or its gateway) acts as the user. A runtime with no host does without them. `sandboxCall` lives in its own module because both the tool wiring (whose module load builds the backends) and the turn path need it, and importing the cache would drag its load-time side effects into the turn's import graph. Which custom-integration surface a runtime gets is decided by `credentialTools`, shared with the Claude backend's bridged set.

## Mission settle report (mission-settle.ts)

Board settle is normally client side, but a mission an agent or API caller started may have no client watching, so its card would stay on running. The runtime reports every turn end; the host changes status only for agent- or API-started missions still running but stamps every successful reply's time. The report runs after the terminal frame with no UI thread, so it is fire-and-forget: network drops retry with a fresh timeout each, and a final failure is a warning (a dropped pod-to-control-plane socket is connectivity, and settle-from-history heals it when the mission is opened). `modelCalls` rides along because this is the one report every turn end sends.

## Drain and shutdown (drain.ts, graceful-shutdown.ts, turn-inflight-count.ts)

- The drain latch is set when a shutdown signal lands and never cleared: the runtime finishes the turns it holds and refuses new ones with 503 and Retry-After (the "not now" shape clients treat as a wake), and `/busy` reads true until exit.
- The listener stays up for the whole drain. Turns are fire-and-forget (the start route answers 202), so nothing holds a connection open and `server.close(cb)` at signal time completes at once; exiting from that callback killed running turns seconds after SIGTERM while most of the termination grace went unused. Timers stay ref'd, because the drain is what keeps the process alive once the host dropped its connections. `DRAIN_SETTLE_MS` gives the last turn's terminal frame time to reach the host before the listener goes.
- The in-flight count follows each turn's lifecycle (accepted, building, queued, waiting on the lock, executing; commands count too), never the stream snapshot, which can read running for a finished turn after an out-of-order frame. A wrong running there is a stale spinner; here it is a pod that never reads idle and a fleet roll that defers forever. Release in `finally`; releasing twice is a no-op.

## Conversation commands (conversation-command.ts)

Commands are understood by the runtime, not a client, so every channel (composer, relayed WhatsApp or Slack) gets them with no per-channel parsing. Exact match is the whole contract: "/clear the kitchen table" is a person talking and must reach the model, and an unrecognized `/something` passes through as text. Matching is case-insensitive and trims whitespace because composer and relays add trailing newlines. `/compress` aliases `/compact`.

## Conversation mode from the board (conversation-mode.ts)

A send that pins no mode runs on the mode kept on the conversation's mission card, read at acceptance, by both the standing server and a pooled worker, so a relay, API follow-up or other pin-less send keeps the person's pick. No board, card or mode runs execute; an API-started card with no mode reads as auto. Agents write the board with their own tools, so a half-edited board is reported and read as no mode: the message must still run.

## Provider switch fit (provider-switch.ts)

`REPLAY_FIT_FRACTION` (0.8) mirrors the frontend's value in `app/src/lib/provider-switch.ts`. A leaving fill that was never reported counts as no proof it will not fit, so the history is replayed rather than spending a summarizer call.

## Autocompact override (autocompact.ts)

The compaction point lives with the window table in `@houston/protocol`, where the context bar reads it. The runtime owns the decision because it holds the live fill and the active window, so every surface inherits it. `HOUSTON_AUTOCOMPACT_THRESHOLD` replaces the point with a plain percent of the window (for testing). A fill of null (no usage reported yet) never compacts. Compaction never waits past a model input limit below the window.

## Stall cards (stall-failure.ts)

A silent or unanswered request settles as `provider_internal` (it reached the provider, which failed to deliver, with no HTTP status). A repetition loop settles as `malformed_response`: the model's own output broke and a retry usually comes back clean.

## Tool result size (tool-results/cap.ts, tool-results/clearing.ts)

- A Houston tool result puts at most `RESULT_HEAD_CHARS` (8,000) characters in front of the model; the rest is saved to a file it can read. Every result is re-sent on every later request until compaction, so one 64k payload cost about 16k tokens per request for the rest of the chat. Measured: a 4k head made models read the file for answers a few thousand characters in, each read one more full-context request; a 20k head cost more over ten turns than 8k, since a model that needs all of a result reads the file either way. Only tools that return what an app, program or Houston's API hands back are capped; file tools have their own limits and are how the model reads a capped result.
- Stale results are cleared from the outgoing request and replaced by a stub naming the tool, size and saved file. Clearing rewrites the request prefix, costing one prompt-cache miss, so results are cleared in batches (`BATCH_CHARS`, about 30k tokens) and the prefix stays cached between batches. The newest `KEEP_RECENT_ROUNDS` rounds stay whole, results under `MIN_CLEAR_CHARS` cost less than the miss and stay, and a screenshot weighs `IMAGE_CHARS`. The decision is a pure function of history replayed round by round, so a stateless backend (pi transforms the full history before each request) reaches the same answer every request and never un-clears.

## Token estimate (token-estimate.ts)

The digest a fresh routine session opens with is sized by a deliberately conservative count. Four characters a token holds for English prose only: digits, punctuation and identifiers run nearer two, CJK and most non-Latin scripts nearer one, high-entropy strings (base64, hex, opaque ids) one to two. An undercount makes the digest outgrow its budget on every fire, so each class is charged at its dense end. A whitespace-free run of 16 or more ASCII characters mixing at least two of lowercase, uppercase and digits counts as opaque.

## Markdown fences for the loop detector (markdown-fence.ts)

The loop detector never judges text inside a code block. Fences follow CommonMark closely enough for model output: three or more backticks or tildes after indentation or quote markers; closed by the same character, at least as long, alone, in the same quote and within three columns of the opener, or when the quote or list item ends. A backtick opener's info string holds no backtick (that line is inline code). Lines longer than `FENCE_LINE_MAX` are never fences, because a looping line never ends and must still be judged. Past the opener's quote depth a `>` is content.

## Next-step suggestions (next-step-suggestions.ts)

Only the product-authored `<next_step_suggestions>` section is conditional; agent instructions stay intact. Turning suggestions off drops only `suggest_actions` and keeps every other tool the same object, because pi's lists hold tools already wrapped for logging and the deferred-file gate.

## One-shot prompts (one-shot.ts)

Title and Create-with-AI generation run through a throwaway pi session so every provider and OAuth flavor behaves like a normal turn without per-provider completion code. Its settings are in-memory so a throwaway request never persists retry or model settings in the workspace.

## Acting identity and credential scope (packages/runtime/src/session/acting-context.ts)

- `runWithActingContext` relies on tool callbacks remaining in the async subtree of `session.prompt()`. Its `AsyncLocalStorage` keeps concurrent conversations from sharing acting identities. A process-global current identity would mix their integration requests.
- `ActingContext.verifiedOwner` comes from the verified pooled-turn record and may establish ownership of something the turn starts, such as a browser hand-off. `actingUser` comes from an unsigned request header on the standing runtime and cannot establish that ownership.
- `ActingContext.credentialScopeKey` may identify an internal execution scope independently of forwarded acting authority. Pooled turns use a stable workspace-and-agent scope to isolate credential health. `runWithActingContext` computes the default scope once because pi resolves it on every credential read during request preparation.
- `credentialScopeKeyFor` derives an unreadable token's isolated scope from a digest. Scope keys reach logs and filenames, so they must never contain the token itself. `actingUser` cannot select personal credentials because a routine creator's bare subject carries no gateway-signed identity.

## Child-process memory limits (packages/runtime/src/session/child-memory-fence.ts)

- `bashMemoryFencePrefix` uses `RLIMIT_DATA` because the pod's group OOM policy kills the whole container when its combined memory exceeds the limit. A per-process limit makes an oversized script fail in its tool result instead of ending the conversation. The observed failure was an exporter growing past approximately 1 GB in a 2 GiB pod, causing three restarts in one session on 2026-09-09.
- `RLIMIT_DATA` covers private writable memory, including heap and anonymous mappings, and children inherit it. `RLIMIT_AS` is unsuitable because it also counts reserved, uncommitted address space, which V8 reserves in gigabytes before using it.
- `bashMemoryFencePrefix` suppresses `ulimit` diagnostics so the command still runs when an existing hard limit prevents applying the requested cap. A lower hard limit already imposes a stricter cap.

## Claude CLI shell contract (packages/runtime/src/session/claude-shell-fence.ts)

- `claudeShellFenceScript` expects the CLI to append the complete Bash command as one argument, verified against Claude Code 2.1. After removing an optional leading `-c`, `$1` is the command. `$BASH` identifies the interpreter already running the wrapper, preserving the CLI's interpreter choice.
- `claudeShellPrefix` adds trailing `-c` only when the wrapper path contains `" -"`. That suffix makes the CLI's final split occur after the complete path. Other paths remain bare because the CLI also uses the prefix as an unsplit executable when launching stdio MCP servers, including machine-managed servers. Those launches cannot use the suffixed form.
- `claudeShellFenceScript` explicitly unsets credential variables because the CLI's own environment scrubbing is disabled on Linux and the deployment's tool shell preserves its incoming environment.
- `ensureClaudeShellFence` requires a directory the tool user cannot modify. The CLI executes the wrapper as the runtime user, so the tool user must not be able to replace it.

## Compaction failure handling (packages/runtime/src/session/autocompact-guard.ts, packages/runtime/src/session/compaction-guard.ts)

- `runAutocompact` classifies reporting severity using the active model's provider taxonomy. The summarizer uses the turn's provider and credential, so expected provider refusals usually recur on the following prompt and already produce its card. Treating them as engine errors produced 6,400 events from 56 users in one week, with seven distinct provider refusals grouped under one report. Unclassified failures, including empty summaries, remain errors.
- Continuing after a failed `runAutocompact` is viable because the normal compaction point leaves headroom: 93% of the window, with a 200,000-token ceiling where that ceiling applies. If the prompt still fails, the user receives the provider's actual refusal.
- An explicit `/compact` does not use `runAutocompact`'s failure suppression. The person requested that operation and must receive its failure.
- `MAX_BOUNDED_ATTEMPTS` permits three attempts, the initial budget and two halvings. One halving covers observed tokenizer densities around 2.5 characters per token. The second allows for dense content around one character per token. A bounded Codex request already exceeded its 272k-token window despite the characters-divided-by-four estimate.
- `makeCompactionGuard` delegates bounded summarization to pi's own `compact` implementation so file-operation tracking, split-turn handling, and previous-summary merging retain pi's behavior.

## Backend registration dependencies (packages/runtime/src/session/conversation-backends.ts)

`serverBackendFor` intentionally remains a thin wrapper around the registry lookup. Importing that function also loads the module that registers the standing runtime's backends. A separate side-effect import would make successful lookup depend on import order and could leave a caller failing with `"no harness backend"` after an unrelated import-graph change.

## Conversation-command events (packages/runtime/src/session/conversation-command-run.ts)

`runConversationCommand` represents commands as ordinary turns so existing clients can show progress, reconnect, and retain a transcript record without command-specific client logic. Command markers contain structure rather than authored sentences because the runtime serves all languages. The app renders the marker through `t()`.

## Memory harvest provenance and deduplication (packages/runtime/src/session/durable-facts-harvest.ts)

- `compactWithFactHarvest` receives the conversation ID explicitly because compaction runs outside `runWithConversationId`, whose scope covers `prompt()`. Reading the ambient conversation ID here would lose mission provenance.
- `harvestDurableFacts` removes already-known text before calling the host. The host append route is idempotent by record ID, not by fact text, so repeated summaries of the same standing preference would otherwise create duplicate memories.

## Session rebuilding and replay (packages/runtime/src/session/conversation-switch.ts, packages/runtime/src/session/exec-turn.ts)

- `switchBackendIfNeeded` builds the replacement directly in the requested mode. A turn that changes both backend and mode therefore needs one rebuild, and the following `switchModeIfNeeded` call does nothing.
- `execTurn` attaches subscriptions after backend and mode rebuilding. Earlier subscriptions would remain attached to the discarded session and miss the session that actually executes the turn.
- `execTurn` consumes `needsSessionReplay` before choosing between reset replay and cross-backend replay. Both paths carry history, so leaving the marker armed during a cross-backend rebuild would send the history again on the following turn.
- `execTurn` puts the replay preamble in the model prompt rather than the canonical user message. The chat bubble retains the person's text, while the backend-native session retains the carried context for later rehydration.
- Replay recovery differs by backend. pi retains a failed prompt in its session history, so replaying again would duplicate context. The Claude SDK retains nothing from a failed prompt. When a replayed Claude turn ends without assistant text, `execTurn` re-arms replay so the next attempt still receives the conversation.

## Turn completion ownership (packages/runtime/src/session/exec-turn.ts)

A clean `execTurn` settles the mission as `needs_you`, regardless of whether it carries a question, connection request, or optional offer. Only the user moves a mission to done. The interaction describes what the reply offers or requests, not whether the mission is complete.

## Create-with-AI generation (packages/runtime/src/session/generate-agent-parse.ts, packages/runtime/src/session/generate-agent.ts)

- `buildRoutine` constructs cron expressions from the constrained daily, weekday, and weekly schedule choices. It never accepts raw model-authored cron because a fabricated expression could schedule work every minute.
- `generateAgentInstructions` propagates failures so the route reports why the requested generation failed. Generation is user-initiated work. The quiet fallback used for cosmetic title generation is inappropriate here.

## Interaction ordering (packages/runtime/src/session/interaction-access.ts, packages/runtime/src/session/interaction-holder.ts)

`recordHandsOn` and `MutableInteractionHolder.pending` place hands-on errands after connection steps because a connection can unblock the agent's work, while an errand on a user-only screen cannot. Deduplication represents the destination trip: two requests for the same screen are one errand, while API-access screens for two different agents require two errands.

## Follow-up reporting (packages/runtime/src/session/follow-up-pass.ts)

`reportUnusableReply` reports malformed suggestion replies once per reporting window and includes the number accumulated since the previous report. The window is 10 minutes, not the process lifetime. Some models return unusable output every turn, and the consequence is only missing follow-up bubbles, so repeated failures produce counted warnings rather than an error per turn.

## Prompt resources (packages/runtime/src/session/prompt-skills.ts, packages/runtime/src/session/resource-loader.ts)

- `skillsForPrompt` uses code-unit comparison because directory order and locale collation vary between workers. ext4 and APFS return hash-based directory order; tmpfs returns creation order. Reordering the skills index changes the system-prompt prefix and breaks prompt-cache reuse. Replacing the comparator with `localeCompare` would reintroduce worker-dependent ordering.
- `indexLine` keeps only enough description to choose a skill because the index accompanies every model request. The full `SKILL.md` is read after selection, so carrying its explanation in the index repeatedly spends context without helping selection.
- `buildAgentLoader` disables pi's discovery of extensions, prompt templates and themes so an agent's resources come from the explicitly assembled workspace configuration. Files elsewhere on the machine must not silently change what the agent loads.

## Context replay (packages/runtime/src/session/replay-transcript.ts, packages/runtime/src/session/routine-replay.ts)

- The preamble from `renderReplayPreamble` belongs in the first user prompt after rebuilding. Both backends persist that prompt in their native session store, so the carried history survives later process restarts and cache eviction. Putting it only in the system prompt would lose that durability.
- `replayCharBudget` leaves 20% of the target window free for the system prompt, the incoming turn and differences in tokenization between providers.
- `replayForConversation` gives routine chats the short digest on every rebuild, including cross-backend switches, edit-and-resend and recovery from a refused Claude resume. A generic window-sized transcript replay would restore the accumulated history that routine resets deliberately removed.

## Compaction sizing (packages/runtime/src/session/summarizer-budget.ts)

- `SUMMARIZER_INPUT_FRACTION` is 0.7 because the remaining window must absorb errors in pi's characters-per-four estimate, summarizer prompt scaffolding and reserved summary output. An oversized request can wedge the conversation; a conservative request only discards some older context.
- `SUMMARIZER_INPUT_MAX_TOKENS` caps estimated input at 2,000,000 tokens, approximately 8,000,000 characters. This keeps the serialized content below OpenAI's 10,485,760-character limit. The absolute ceiling starts binding above approximately 2.9 million context tokens; smaller windows hit the fractional limit first.
- `elideMessage` converts the token budget back to characters with an additional 10% reduction for elision markers and rounding. Using the full inverse estimate could produce an elided message that still exceeds its budget.

## Stall and repetition detection (packages/runtime/src/session/stall-watchdog.ts, packages/runtime/src/session/runaway-output.ts)

- `createStallWatchdog` bounds how long a silent provider can retain the workspace lock. In the production incident behind this rule, the socket remained open for 19 minutes, blocking every queued turn for the agent.
- `isAbortEcho` handles pi's pending-response abort behavior. pi can finish the assistant message with `stopReason: "error"` and `"This operation was aborted"`, which becomes an `unknown` provider error. That echo must be suppressed only when this turn issued the abort, so the watchdog's authored failure or the user's Stop remains the terminal explanation.
- `LOOP_MAX_DISTINCT` is 64 for a 4,096-character window because the observed loops and ordinary output were well separated. On staging on 2026-10-03, four looping replies contained only 2 to 56 distinct four-character sequences. The detector caught each within its first 6.4k characters, 4 to 48 seconds into replies that otherwise lasted 112 to 217 seconds and generated 19k to 28k tokens each. None of the other 255 replies in that run triggered it.
- The ordinary-output comparison behind that threshold covered 3,806 files and 40 MB across the Houston and cloud repositories. The least varied 4 KiB window still contained 278 distinct four-character sequences. Some models permit 500k output tokens, so waiting for the provider's output limit can retain a sandbox far longer than useful work requires.

## Restart diagnosis (packages/runtime/src/session/turn-inflight-marker.ts, packages/runtime/src/session/settle-interrupted-turns.ts)

- `INFLIGHT_DIR` lives under the synced runtime data directory so the marker survives replacement of the pod along with its transcript. It stays outside `conversations/` because the conversation lister interprets every JSON file there as a transcript.
- `turnFootprint` measures the live transcript and all pi session files because both are loaded whole into the heap at turn start. Their sizes help distinguish memory pressure during loading from an unrelated eviction. The motivating pattern repeated 348 times on one routine, a few seconds into each turn with no tool running.
- `turnFootprint` uses file metadata only. Parsing those files while diagnosing a memory-related restart would repeat the expensive operation under investigation.

## Turn admission and startup failures (packages/runtime/src/session/turn-start.ts, packages/runtime/src/session/turn-start-failure.ts)

- The message route awaits `ensureProviderForTurn` so a disconnected provider fails the request itself. Accepting first and reporting only through the conversation stream lets the error arrive before the client's SSE subscription, leaving the chat waiting without a visible failure.
- `runAcceptedTurn` checks connectivity again before using a cached conversation. A logout can occur after the route's check, and a cached session does not rerun `resolveModel`'s connection guard. Without the second check, that session could reach `prompt()` without a credential and never publish a terminal event.
- `recordRefusedUserTurn` publishes the nonce-stamped user echo before the error because the client adopts the turn ID from that echo. An error arriving first is classified as foreign and discarded, leaving the failed turn spinning.
- `reportTurnStartFailure` persists the typed failure as well as publishing it so unattended readers, including routine reconciliation, find the actual failure rather than timing out waiting for a reply. For failures before session construction, `undelivered_prompt` preserves the text for reconnect and automatic continuation: appearing in the UI transcript does not mean the backend received it.

## Model-call timing (packages/runtime/src/session/model-call-report.ts)

`collectModelCalls` retains the latest `harness_init` measurement because a Claude turn whose resume is refused spawns twice. The second initialization belongs to the subprocess that actually served the reported model calls; retaining the first would associate those calls with the abandoned attempt.

## Tool selection (packages/runtime/src/session/tool-selection-build.ts)

- `turnCodeExecutionMode` permits local execution on a single-use worker because that worker serves one tenant for its entire lifetime. On a shared worker, process trees, temporary files and environment state can survive into the next tenant's turn, so configured local execution resolves to disabled.
- `buildToolSelection` withholds the entire assistant family in plan mode, including catalog search. Although searching is a read, the family exists to perform account operations. Offering discovery while withholding those operations would lead the plan turn to operations it cannot complete.

## Tool logging and saved results (packages/runtime/src/session/tool-call-log.ts, packages/runtime/src/session/tool-results/spill.ts)

- `loggedToolCall` records at INFO because tool execution is the ordinary trace needed to reconstruct what an assistant actually did. A DEBUG-only record would leave normal incident logs unable to distinguish an operation that was never searched for, never called or refused.
- `SPILL_DIR` stays inside the agent workspace so cloud store sync carries saved results between turns. Its dot-folder location hides it from the Files tab and lets hydration happen behind the prompt rather than on the prompt's critical path. `SPILL_BUDGET_BYTES` prevents a long-lived agent from syncing an ever-growing collection; a pruned result can be recovered by rerunning its tool.
